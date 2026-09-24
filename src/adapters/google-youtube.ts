// YouTube 連携の Google OAuth（incremental authorization）と channels.list mine=true・トークン失効。
// 外部通信はこのファイルに閉じ込め、テストは globalThis.fetch を差し替えて検証する
import { AppError } from "../lib/errors";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

export const SCOPE_YOUTUBE_READONLY = "https://www.googleapis.com/auth/youtube.readonly";
export const SCOPE_ANALYTICS_READONLY = "https://www.googleapis.com/auth/yt-analytics.readonly";
export const SCOPE_FORCE_SSL = "https://www.googleapis.com/auth/youtube.force-ssl";
/** 連携の基本スコープ（読み取り専用）。字幕 ON のときだけ force-ssl を追加する */
export const READONLY_SCOPES = [SCOPE_YOUTUBE_READONLY, SCOPE_ANALYTICS_READONLY];

export function buildYoutubeAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
  incremental: boolean;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scopes.join(" "),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    // ブランドアカウントのチャンネルはアカウント選択で選ぶため select_account、refresh token を確実に得るため consent
    prompt: "select_account consent",
  });
  if (input.incremental) params.set("include_granted_scopes", "true");
  url.search = params.toString();
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
}

export async function exchangeYoutubeCode(input: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const body = await postForm(GOOGLE_TOKEN_URL, {
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.codeVerifier,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) throw new AppError("OAUTH_FAILED");
  return {
    accessToken,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    scopes: typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [],
  };
}

export interface ChannelCandidate {
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
}

/** channels.list part=snippet,statistics mine=true（1 unit） */
export async function listMyChannels(accessToken: string): Promise<ChannelCandidate[]> {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.search = new URLSearchParams({
    part: "snippet,statistics",
    mine: "true",
    maxResults: "50",
  }).toString();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError("OAUTH_FAILED");
  }
  if (!res.ok) throw new AppError("OAUTH_FAILED");
  const data = (await res.json().catch(() => ({}))) as { items?: unknown[] };
  const items = Array.isArray(data.items) ? data.items : [];
  return items.flatMap((raw) => {
    const item = raw as {
      id?: unknown;
      snippet?: { title?: unknown; thumbnails?: Record<string, { url?: unknown }> };
      statistics?: { subscriberCount?: unknown; hiddenSubscriberCount?: unknown };
    };
    if (typeof item.id !== "string" || !item.id) return [];
    const thumbs = item.snippet?.thumbnails ?? {};
    const thumb = thumbs.default?.url ?? thumbs.medium?.url;
    const subs = Number(item.statistics?.subscriberCount);
    return [
      {
        channelId: item.id,
        title: typeof item.snippet?.title === "string" ? item.snippet.title : item.id,
        thumbnailUrl: typeof thumb === "string" && thumb.startsWith("https://") ? thumb : null,
        subscriberCount:
          item.statistics?.hiddenSubscriberCount === true || !Number.isFinite(subs) ? null : subs,
      },
    ];
  });
}

/** refresh token を失効する（Google 側の全スコープの許可が外れる）。失敗しても呼出元は処理を続ける */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function postForm(
  url: string,
  form: Record<string, string>,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError("OAUTH_FAILED");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // テナントが持ち込んだクライアント（qa-075）の誤りは、通信障害と分けて登録し直しを案内する
    const code = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
    if (code === "invalid_client" || code === "unauthorized_client") {
      throw new AppError("GOOGLE_CLIENT_REJECTED");
    }
    throw new AppError("OAUTH_FAILED");
  }
  if (!body || typeof body !== "object") throw new AppError("OAUTH_FAILED");
  return body as Record<string, unknown>;
}
