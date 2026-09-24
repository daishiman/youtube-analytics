// ログイン時の「何を要求し、何に同意したか」の唯一の定義元（正本 auth 章 qa-064・qa-065・qa-073）。
// 画面の権限一覧（/api/auth/config）と Google へ要求するスコープは、どちらもこの SCOPE_SETS から作る
import { newId } from "../lib/crypto";
import { type Deps, iso, platform } from "./common";
import { encryptToken } from "./token-crypto";

export const YOUTUBE_READONLY = "https://www.googleapis.com/auth/youtube.readonly";
export const YT_ANALYTICS_READONLY = "https://www.googleapis.com/auth/yt-analytics.readonly";

export interface ScopeSet {
  scopes: readonly string[];
  /** refresh token を受け取り、許可済みスコープを引き継ぐ（access_type=offline・include_granted_scopes） */
  offline: boolean;
}

/** signup=新規・オーナーのログインと再連携、invite=招待でのログイン（メールだけ） */
export const SCOPE_SETS = {
  signup: { scopes: ["openid", "email", YOUTUBE_READONLY, YT_ANALYTICS_READONLY], offline: true },
  invite: { scopes: ["openid", "email"], offline: false },
} as const satisfies Record<string, ScopeSet>;

export type LoginMode = keyof typeof SCOPE_SETS;

/** 画面に出す権限の行（表示順）。openid は利用者に見せる権限ではないので行にしない */
const SCOPE_ROWS: readonly { id: string; label: string }[] = [
  { id: YOUTUBE_READONLY, label: "YouTubeチャンネル情報の閲覧" },
  { id: YT_ANALYTICS_READONLY, label: "YouTube Analyticsレポートの閲覧" },
  { id: "email", label: "メールアドレス" },
];

export function scopeRows(mode: LoginMode) {
  const requested = new Set<string>(SCOPE_SETS[mode].scopes);
  return SCOPE_ROWS.filter((r) => requested.has(r.id)).map((r) => ({
    ...r,
    readOnly: true as const,
  }));
}

/** 規約の現行版。規約ページの data-version と一致させる。変えると次回ログインで再同意になる */
export const LEGAL_VERSIONS = { terms: "2026-09-24", privacy: "2026-09-24" } as const;

export function isCurrentLegalVersion(terms: unknown, privacy: unknown): boolean {
  return terms === LEGAL_VERSIONS.terms && privacy === LEGAL_VERSIONS.privacy;
}

export type YoutubeLinkStatus = "none" | "partial" | "linked";

/** Google が返した実スコープに読み取り2権限が含まれるか確認する */
export function hasYoutubeReadScopes(scope: string | null): boolean {
  const granted = new Set((scope ?? "").split(/\s+/).filter(Boolean));
  return granted.has(YOUTUBE_READONLY) && granted.has(YT_ANALYTICS_READONLY);
}

export interface Grant {
  scope: string | null;
  refreshToken: string | null;
}

/** 付与スコープと暗号化した refresh token を保存し、テナントの連携状態を更新する */
export async function saveGrant(
  deps: Deps,
  input: { tenantId: string; userId: string; grant: Grant },
): Promise<YoutubeLinkStatus> {
  return platform(deps).saveOAuthGrant({
    tenantId: input.tenantId,
    userId: input.userId,
    scope: input.grant.scope ?? "",
    refreshTokenEnc: input.grant.refreshToken
      ? await encryptToken(deps.env.TOKEN_ENC_KEY, input.grant.refreshToken)
      : null,
    hasYoutubeReadScopes: hasYoutubeReadScopes(input.grant.scope),
    now: iso(deps.now),
  });
}

export interface ConsentVersions {
  termsVersion: string;
  privacyVersion: string;
}

/** 同意を1行追記する。直前の同意と版が違えば reconsent（規約改定後の再同意） */
export async function recordConsent(
  deps: Deps,
  userId: string,
  versions: ConsentVersions,
): Promise<void> {
  const repo = platform(deps);
  const last = await repo.lastConsent(userId);
  const changed =
    last !== null &&
    (last.terms_version !== versions.termsVersion ||
      last.privacy_version !== versions.privacyVersion);
  await repo.insertConsent({
    id: newId(),
    userId,
    termsVersion: versions.termsVersion,
    privacyVersion: versions.privacyVersion,
    consentedAt: iso(deps.now),
    source: changed ? "reconsent" : "login",
  });
}
