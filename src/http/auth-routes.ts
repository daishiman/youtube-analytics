// /api/auth/*（ログイン不要）: Google ログイン開始・コールバック・招待プレビュー・ログアウト・開発専用ログイン
import { Hono } from "hono";
import { pkceChallenge, randomToken } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { previewInvite } from "../usecases/invites";
import { type LoginResult, loginWithIdentity, logout } from "../usecases/session";
import {
  clearOAuthCookie,
  clearSessionCookie,
  readOAuthCookie,
  readSessionCookie,
  writeOAuthCookie,
  writeSessionCookie,
} from "./cookies";
import { buildAuthUrl, exchangeCode } from "./google-oauth";
import { type AppEnv, readJson } from "./middleware";

export const authRoutes = new Hono<AppEnv>();

const redirectUri = (url: string) => `${new URL(url).origin}/api/auth/callback`;

/** ログイン後の遷移先。失敗理由は画面側でエラーコードから文言を出す */
function landingPath(result: LoginResult, invite: string | null): string {
  if (result.outcome === "invite_failed" && invite && result.inviteError) {
    return `/invite?token=${encodeURIComponent(invite)}&error=${result.inviteError}`;
  }
  if (result.outcome === "signup_closed") return "/?notice=SIGNUP_CLOSED";
  return "/";
}

authRoutes.get("/config", (c) => c.json({ devLogin: devLoginEnabled(c.env.DEV_LOGIN, c.req.url) }));

authRoutes.get("/login", async (c) => {
  // YouTube API Developer Policies III.A.2: プライバシーポリシーと利用規約への同意をログイン前に必須とする
  if (c.req.query("consent") !== "1") return c.redirect("/login?error=CONSENT_REQUIRED");
  const invite = c.req.query("invite") || null;
  const flow = { state: randomToken(), verifier: randomToken(), nonce: randomToken(16), invite };
  await writeOAuthCookie(c, c.env.TOKEN_ENC_KEY, flow);
  return c.redirect(
    buildAuthUrl({
      clientId: c.env.GOOGLE_CLIENT_ID,
      redirectUri: redirectUri(c.req.url),
      state: flow.state,
      nonce: flow.nonce,
      codeChallenge: await pkceChallenge(flow.verifier),
    }),
  );
});

authRoutes.get("/callback", async (c) => {
  const flow = await readOAuthCookie(c, c.env.TOKEN_ENC_KEY);
  clearOAuthCookie(c);
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (!flow || !state || state !== flow.state)
    return c.redirect("/login?error=OAUTH_STATE_MISMATCH");
  if (!code) return c.redirect("/login?error=OAUTH_FAILED");
  try {
    const deps = c.get("deps");
    const identity = await exchangeCode({
      code,
      codeVerifier: flow.verifier,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri: redirectUri(c.req.url),
      nonce: flow.nonce,
      now: deps.now,
    });
    const result = await loginWithIdentity(deps, identity, { inviteToken: flow.invite });
    writeSessionCookie(c, result.sessionId);
    return c.redirect(landingPath(result, flow.invite));
  } catch (e) {
    if (e instanceof AppError) return c.redirect(`/login?error=${e.code}`);
    throw e;
  }
});

authRoutes.get("/invite", async (c) =>
  c.json(await previewInvite(c.get("deps"), c.req.query("token"))),
);

authRoutes.post("/logout", async (c) => {
  const sessionId = readSessionCookie(c);
  if (sessionId) await logout(c.get("deps"), sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

/** 開発専用ログイン: .dev.vars の DEV_LOGIN=1 かつ localhost のときだけ有効。本番は常に 404 */
export function devLoginEnabled(flag: string | undefined, url: string): boolean {
  const host = new URL(url).hostname;
  return flag === "1" && (host === "localhost" || host === "127.0.0.1");
}

authRoutes.post("/dev-login", async (c) => {
  if (!devLoginEnabled(c.env.DEV_LOGIN, c.req.url)) throw new AppError("NOT_FOUND");
  const body = await readJson(c);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError("VALIDATION_FAILED", "email を指定してください");
  const invite = typeof body.invite === "string" && body.invite ? body.invite : null;
  const result = await loginWithIdentity(
    c.get("deps"),
    { sub: `dev:${email}`, email, emailVerified: true },
    { inviteToken: invite },
  );
  writeSessionCookie(c, result.sessionId);
  return c.json({
    outcome: result.outcome,
    inviteError: result.inviteError ?? null,
    next: landingPath(result, invite),
  });
});
