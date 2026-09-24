// API 呼び出し。状態変更には CSRF 対策の X-Requested-With: yta を必ず付ける（requirements.md §5）
export type Role = "owner" | "editor" | "viewer";

export type YoutubeLinkStatus = "none" | "partial" | "linked";

export interface TenantSummary {
  tenantId: string;
  name: string;
  role: Role;
  /** /api/me の currentTenant にだけ付く */
  youtubeLinkStatus?: YoutubeLinkStatus;
}

/** /api/auth/config。権限一覧はこの scopes からだけ描画する（要求スコープと同じ定義から出る） */
export interface AuthConfig {
  devLogin: boolean;
  mode: "signup" | "invite";
  scopes: { id: string; label: string; readOnly: boolean }[];
  termsVersion: string;
  privacyVersion: string;
  inviteTenantName?: string;
}

export interface Me {
  user: { userId: string; email: string };
  tenants: TenantSummary[];
  currentTenant: TenantSummary | null;
  signupClosed: boolean;
}

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  joined_at: string;
}

export interface PendingInvite {
  invite_id: string;
  email: string;
  role: Role;
  expires_at: string;
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["x-requested-with"] = "yta";
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string; hint: string };
  };
  if (!res.ok) {
    const e = data.error ?? { code: "INTERNAL", message: "通信に失敗しました", hint: "" };
    throw new ApiError(res.status, e.code, e.message, e.hint);
  }
  return data as T;
}

/** リダイレクトで戻るエラー（/login?error=CODE 等）の表示文言。API の JSON エラーはサーバの文言を使う */
export const REDIRECT_MESSAGES: Record<string, string> = {
  CONSENT_REQUIRED: "利用規約とプライバシーポリシーへの同意が必要です。",
  CONSENT_OUTDATED:
    "利用規約またはプライバシーポリシーが更新されました。内容を確認して、もう一度同意してください",
  OAUTH_STATE_MISMATCH: "ログインの確認に失敗しました。もう一度ログインしてください。",
  OAUTH_FAILED: "Googleとの通信に失敗しました。時間をおいてもう一度ログインしてください。",
  EMAIL_NOT_VERIFIED: "Googleアカウントのメールアドレスが確認されていません。",
  SIGNUP_CLOSED: "現在新規の受付を停止しています。既存テナントのオーナーから招待を受けてください。",
  INVITE_NOT_USABLE:
    "この招待リンクは使えません（期限切れ・使用済み・取消済み）。オーナーに再発行を依頼してください。",
  INVITE_EMAIL_MISMATCH:
    "招待されたメールアドレスと異なるアカウントです。招待を受けたGoogleアカウントでログインし直してください。",
  ALREADY_MEMBER: "すでにこのテナントのメンバーです。",
  YOUTUBE_LINK_MISMATCH:
    "ログイン中と別の Google アカウントで許可されたため、連携しませんでした。同じアカウントで「再連携」をやり直してください。",
};

/** ログイン画面の文言。未知のコードは内容を出さず汎用の文言にする（qa-066） */
export function loginErrorMessage(code: string): string {
  return Object.hasOwn(REDIRECT_MESSAGES, code)
    ? (REDIRECT_MESSAGES[code] as string)
    : "ログインできませんでした。もう一度お試しください";
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "オーナー",
  editor: "編集者",
  viewer: "閲覧者",
};
