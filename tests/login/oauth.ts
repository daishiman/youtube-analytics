// ログイン刷新テストの共通部品: Google の認可リダイレクトとトークン応答をテスト内で再現する
import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { base64url } from "../../src/lib/crypto";
import { LEGAL_VERSIONS } from "../../src/usecases/login-consent";
import { type CallOptions, call } from "../platform/helpers";

export const YT = "https://www.googleapis.com/auth/youtube.readonly";
export const YTA = "https://www.googleapis.com/auth/yt-analytics.readonly";
export const FULL_GRANT = `openid email ${YT} ${YTA}`;

export const CURRENT_VERSIONS = `terms_version=${LEGAL_VERSIONS.terms}&privacy_version=${LEGAL_VERSIONS.privacy}`;

export function fakeIdToken(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: "RS256" })}.${enc(claims)}.sig`;
}

export interface Started {
  res: Response;
  location: string;
  cookie: string;
  url: URL | null;
}

/** /api/auth/login（または connect）を叩き、Google への URL と署名付き Cookie を取り出す */
export async function start(path: string, opts: CallOptions = {}): Promise<Started> {
  const res = await call(path, opts);
  const location = res.headers.get("location") ?? "";
  const cookie =
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("yta_oauth="))
      ?.split(";")[0] ?? "";
  return { res, location, cookie, url: location.startsWith("http") ? new URL(location) : null };
}

export const startLogin = (extra = "") =>
  start(`/api/auth/login?consent=1&${CURRENT_VERSIONS}${extra}`);

/** Google のトークン応答を1回分だけ差し替えて callback を完了させる */
export async function finish(
  started: Started,
  identity: { sub: string; email: string },
  token: { scope?: string; refresh_token?: string } = {},
  opts: CallOptions = {},
): Promise<Response> {
  const nonce = started.url?.searchParams.get("nonce");
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({
      ...token,
      id_token: fakeIdToken({
        iss: "https://accounts.google.com",
        aud: env.GOOGLE_CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce,
        sub: identity.sub,
        email: identity.email,
        email_verified: true,
      }),
    }),
  );
  const state = started.url?.searchParams.get("state") ?? "";
  const cookie = [started.cookie, opts.cookie].filter(Boolean).join("; ");
  return call(`/api/auth/callback?code=c&state=${state}`, {
    ...opts,
    cookie,
    env: { MAX_TENANTS: "1000000", ...opts.env },
  });
}

export function sessionCookieOf(res: Response): string {
  return (
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("yta_session="))
      ?.split(";")[0] ?? ""
  );
}
