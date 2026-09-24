// /api/auth/*（ログイン不要）: 画面設定・Google ログイン開始・コールバック・再連携・招待プレビュー・ログアウト・開発専用ログイン
import { type Context, Hono } from "hono";
import { pkceChallenge, randomToken } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { platform } from "../usecases/common";
import { previewInvite } from "../usecases/invites";
import {
  isCurrentLegalVersion,
  LEGAL_VERSIONS,
  type LoginMode,
  SCOPE_SETS,
  saveGrant,
  scopeRows,
} from "../usecases/login-consent";
import { type LoginResult, loginWithIdentity, logout, resolveSession } from "../usecases/session";
import {
  clearOAuthCookie,
  clearSessionCookie,
  type OAuthFlow,
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

/** 使える招待のときだけテナント名を返す。使えない招待でも画面は招待の権限（メールだけ）で描く */
async function inviteTenantName(c: Context<AppEnv>, token: string): Promise<string | undefined> {
  try {
    return (await previewInvite(c.get("deps"), token)).tenantName;
  } catch (e) {
    if (e instanceof AppError) return undefined;
    throw e;
  }
}

authRoutes.get("/config", async (c) => {
  const invite = c.req.query("invite") || null;
  const mode: LoginMode = invite ? "invite" : "signup";
  const tenantName = invite ? await inviteTenantName(c, invite) : undefined;
  return c.json({
    devLogin: devLoginEnabled(c.env.DEV_LOGIN, c.req.url),
    mode,
    scopes: scopeRows(mode),
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    ...(tenantName ? { inviteTenantName: tenantName } : {}),
  });
});

async function redirectToGoogle(c: Context<AppEnv>, flow: OAuthFlow) {
  await writeOAuthCookie(c, c.env.TOKEN_ENC_KEY, flow);
  return c.redirect(
    buildAuthUrl({
      clientId: c.env.GOOGLE_CLIENT_ID,
      redirectUri: redirectUri(c.req.url),
      state: flow.state,
      nonce: flow.nonce,
      codeChallenge: await pkceChallenge(flow.verifier),
      scopeSet: SCOPE_SETS[flow.mode === "invite" ? "invite" : "signup"],
    }),
  );
}

const newFlowSecrets = () => ({
  state: randomToken(),
  verifier: randomToken(),
  nonce: randomToken(16),
});

authRoutes.get("/login", async (c) => {
  // YouTube API Developer Policies III.A.2: プライバシーポリシーと利用規約への同意をログイン前に必須とする
  if (c.req.query("consent") !== "1") return c.redirect("/login?error=CONSENT_REQUIRED");
  // 画面が古い版の規約を表示していたら、同意し直してもらう（qa-073）
  const termsVersion = c.req.query("terms_version");
  const privacyVersion = c.req.query("privacy_version");
  if (!isCurrentLegalVersion(termsVersion, privacyVersion))
    return c.redirect("/login?error=CONSENT_OUTDATED");
  const invite = c.req.query("invite") || null;
  return redirectToGoogle(c, {
    ...newFlowSecrets(),
    invite,
    mode: invite ? "invite" : "signup",
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
  });
});

/** 部分許可のあと、オーナーが YouTube の読み取り権限を追加で許可する（qa-065） */
authRoutes.get("/youtube/connect", async (c) => {
  const sessionId = readSessionCookie(c);
  const session = sessionId ? await resolveSession(c.get("deps"), sessionId) : null;
  if (!session) throw new AppError("UNAUTHENTICATED");
  if (!session.tenantId || session.role !== "owner") throw new AppError("FORBIDDEN");
  return redirectToGoogle(c, {
    ...newFlowSecrets(),
    invite: null,
    mode: "connect",
    userId: session.userId,
    tenantId: session.tenantId,
  });
});

/**
 * 再連携の戻り。ログイン中の本人・Google で認証した本人・開始時の本人が同じで、まだオーナーのときだけ保存する。
 * 新しいセッションは作らず、同意も記録しない（ログインではないため）
 */
async function completeConnect(c: Context<AppEnv>, flow: OAuthFlow, code: string) {
  const deps = c.get("deps");
  const { identity, grant } = await exchangeCode({
    code,
    codeVerifier: flow.verifier,
    clientId: c.env.GOOGLE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(c.req.url),
    nonce: flow.nonce,
    now: deps.now,
  });
  const sessionId = readSessionCookie(c);
  const session = sessionId ? await resolveSession(deps, sessionId) : null;
  const repo = platform(deps);
  const user = flow.userId ? await repo.findUserById(flow.userId) : null;
  const role = flow.tenantId && flow.userId ? await repo.getRole(flow.tenantId, flow.userId) : null;
  if (
    !session ||
    !user ||
    !flow.tenantId ||
    session.userId !== user.user_id ||
    user.google_sub !== identity.sub ||
    role !== "owner"
  ) {
    return c.redirect("/?notice=YOUTUBE_LINK_MISMATCH");
  }
  await saveGrant(deps, { tenantId: flow.tenantId, userId: user.user_id, grant });
  return c.redirect("/");
}

authRoutes.get("/callback", async (c) => {
  const flow = await readOAuthCookie(c, c.env.TOKEN_ENC_KEY);
  clearOAuthCookie(c);
  const fail = (code: string) =>
    c.redirect(flow?.mode === "connect" ? `/?notice=${code}` : `/login?error=${code}`);
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (!flow || !state || state !== flow.state) return fail("OAUTH_STATE_MISMATCH");
  // Google の error / error_description は画面にも URL にも出さない（qa-066）
  if (c.req.query("error") || !code) return fail("OAUTH_FAILED");
  try {
    if (flow.mode === "connect") return await completeConnect(c, flow, code);
    if (!isCurrentLegalVersion(flow.termsVersion, flow.privacyVersion))
      return fail("CONSENT_OUTDATED");
    const deps = c.get("deps");
    const { identity, grant } = await exchangeCode({
      code,
      codeVerifier: flow.verifier,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri: redirectUri(c.req.url),
      nonce: flow.nonce,
      now: deps.now,
    });
    const result = await loginWithIdentity(deps, identity, {
      inviteToken: flow.invite,
      grant: flow.mode === "signup" ? grant : undefined,
      consent: {
        termsVersion: flow.termsVersion ?? "",
        privacyVersion: flow.privacyVersion ?? "",
      },
    });
    writeSessionCookie(c, result.sessionId);
    return c.redirect(landingPath(result, flow.invite));
  } catch (e) {
    if (e instanceof AppError) return fail(e.code);
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

/** Google を通らないので、付与スコープと連携状態には触れない（seed データで用意する）。同意は版が送られたときだけ記録する */
authRoutes.post("/dev-login", async (c) => {
  if (!devLoginEnabled(c.env.DEV_LOGIN, c.req.url)) throw new AppError("NOT_FOUND");
  const body = await readJson(c);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError("VALIDATION_FAILED", "email を指定してください");
  const invite = typeof body.invite === "string" && body.invite ? body.invite : null;
  const versioned = body.termsVersion !== undefined || body.privacyVersion !== undefined;
  if (versioned && !isCurrentLegalVersion(body.termsVersion, body.privacyVersion))
    throw new AppError("CONSENT_OUTDATED");
  const result = await loginWithIdentity(
    c.get("deps"),
    { sub: `dev:${email}`, email, emailVerified: true },
    {
      inviteToken: invite,
      consent: versioned
        ? { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy }
        : undefined,
    },
  );
  writeSessionCookie(c, result.sessionId);
  return c.json({
    outcome: result.outcome,
    inviteError: result.inviteError ?? null,
    next: landingPath(result, invite),
  });
});
