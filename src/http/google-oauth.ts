// Google OAuth 2.0 Authorization Code + PKCE。要求するスコープの組は login-consent.ts の SCOPE_SETS が決める
// ID トークンはトークンエンドポイントから TLS で直接受け取るため、署名検証の代わりに claim（iss/aud/exp/nonce）を検証する
// （OpenID Connect Core 3.1.3.7 の「TLS で直接受け取った場合」の扱い）
import { base64urlDecode } from "../lib/crypto";
import { AppError } from "../lib/errors";
import type { Grant, ScopeSet } from "../usecases/login-consent";
import type { VerifiedIdentity } from "../usecases/session";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export function buildAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  scopeSet: ScopeSet;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scopeSet.scopes.join(" "),
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (input.scopeSet.offline) {
    // refresh token を受け取り、以前に許可したスコープも引き継ぐ（incremental authorization）
    params.set("access_type", "offline");
    params.set("include_granted_scopes", "true");
    params.set("prompt", "consent");
  } else {
    params.set("prompt", "select_account");
  }
  url.search = params.toString();
  return url.toString();
}

export interface ExchangeResult {
  identity: VerifiedIdentity;
  grant: Grant;
}

interface IdTokenClaims {
  iss?: string;
  aud?: string;
  exp?: number;
  nonce?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
}

function decodeClaims(idToken: string): IdTokenClaims {
  const payload = idToken.split(".")[1];
  if (!payload) throw new AppError("OAUTH_FAILED");
  try {
    return JSON.parse(new TextDecoder().decode(base64urlDecode(payload))) as IdTokenClaims;
  } catch {
    throw new AppError("OAUTH_FAILED");
  }
}

export async function exchangeCode(input: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  nonce: string;
  now: Date;
}): Promise<ExchangeResult> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.codeVerifier,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError("OAUTH_FAILED");
  }
  if (!res.ok) {
    // 原因の切り分け用に Google のエラー種別（invalid_client など）だけをサーバログへ出す。画面と URL には出さない（qa-066）
    const reason = await res
      .json()
      .then((b) => (b as { error?: unknown }).error)
      .catch(() => undefined);
    console.warn(`google token exchange failed: status=${res.status} error=${String(reason)}`);
    throw new AppError("OAUTH_FAILED");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AppError("OAUTH_FAILED");
  }
  const token = (typeof body === "object" && body !== null ? body : {}) as {
    id_token?: unknown;
    scope?: unknown;
    refresh_token?: unknown;
  };
  const idToken = token.id_token;
  if (typeof idToken !== "string" || !idToken) throw new AppError("OAUTH_FAILED");

  const claims = decodeClaims(idToken);
  const nowSec = Math.floor(input.now.getTime() / 1000);
  if (
    !claims.iss ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    claims.aud !== input.clientId ||
    typeof claims.exp !== "number" ||
    claims.exp <= nowSec ||
    claims.nonce !== input.nonce ||
    !claims.sub ||
    !claims.email
  ) {
    throw new AppError("OAUTH_FAILED");
  }
  return {
    identity: {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
    },
    grant: {
      scope: typeof token.scope === "string" ? token.scope : null,
      refreshToken:
        typeof token.refresh_token === "string" && token.refresh_token ? token.refresh_token : null,
    },
  };
}
