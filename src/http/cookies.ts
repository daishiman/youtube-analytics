// セッション Cookie: 256bit ランダム ID・HttpOnly・Secure・SameSite=Lax・30日（正本 auth/security 章）
// https では __Host- 接頭辞（Secure・Path=/・Domain なしを強制）。http の localhost 開発時だけ Secure を外す
import type { Context } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import { SESSION_TTL_MS } from "../usecases/common";

const OAUTH_COOKIE = "yta_oauth";
const OAUTH_TTL_SEC = 600;

function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

function sessionCookieName(c: Context): string {
  return isHttps(c) ? "__Host-yta_session" : "yta_session";
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, sessionCookieName(c));
}

export function writeSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, sessionCookieName(c), sessionId, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, sessionCookieName(c), { path: "/", secure: isHttps(c) });
}

/** OAuth の往復中だけ使う短命 Cookie（state・PKCE verifier・nonce・招待トークン）。改ざん検出のため HMAC 署名する */
export interface OAuthFlow {
  state: string;
  verifier: string;
  nonce: string;
  invite: string | null;
}

export async function writeOAuthCookie(c: Context, secret: string, flow: OAuthFlow): Promise<void> {
  await setSignedCookie(c, OAUTH_COOKIE, JSON.stringify(flow), secret, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/api/auth",
    maxAge: OAUTH_TTL_SEC,
  });
}

export async function readOAuthCookie(c: Context, secret: string): Promise<OAuthFlow | null> {
  const raw = await getSignedCookie(c, secret, OAUTH_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthFlow;
  } catch {
    return null;
  }
}

export function clearOAuthCookie(c: Context): void {
  deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth", secure: isHttps(c) });
}
