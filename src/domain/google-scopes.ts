// Google OAuth スコープの唯一の定義元。ログイン（login-consent）・YouTube 連携（adapters/google-youtube・usecases/youtube）・
// 有効連携の判定（repositories）が同じ文字列を使うため、層に依存しない domain に置く
export const SCOPE_YOUTUBE_READONLY = "https://www.googleapis.com/auth/youtube.readonly";
export const SCOPE_ANALYTICS_READONLY = "https://www.googleapis.com/auth/yt-analytics.readonly";
export const SCOPE_FORCE_SSL = "https://www.googleapis.com/auth/youtube.force-ssl";
/** 連携の基本スコープ（読み取り専用）。字幕 ON のときだけ force-ssl を追加する */
export const READONLY_SCOPES = [SCOPE_YOUTUBE_READONLY, SCOPE_ANALYTICS_READONLY];
