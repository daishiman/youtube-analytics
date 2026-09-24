// API 呼び出し。状態変更には CSRF 対策の X-Requested-With: yta を必ず付ける（requirements.md §5）
import type { ImportKind } from "../src/domain/import-rules";

export type { ImportKind } from "../src/domain/import-rules";

export type Role = "owner" | "editor" | "viewer";

export interface TenantSummary {
  tenantId: string;
  name: string;
  role: Role;
}

export interface Me {
  user: { userId: string; email: string };
  tenants: TenantSummary[];
  currentTenant: TenantSummary | null;
  signupClosed: boolean;
  /** 最終更新（収集・CSV取込の新しい方）。ヘッダーに出す */
  lastUpdatedAt: string | null;
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

export type ChannelStatus = "正常" | "要再連携" | "未連携";
export type UsageLevel = "ok" | "warn" | "danger" | "unknown";

export interface ImportRow {
  import_id: string;
  kind: ImportKind;
  file_name: string;
  period: string | null;
  rows: number | null;
  status: "処理待ち" | "完了" | "失敗";
  error: string | null;
  created_at: string;
}

export interface SkillToken {
  token_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface UsageItem {
  key: string;
  label: string;
  used: number | null;
  limit: number;
  unit: string;
  level: UsageLevel;
}

export interface GoogleClientSummary {
  configured: boolean;
  clientId: string | null;
  updatedAt: string | null;
}

/** GET /api/settings（画像の5カード分。メンバーは独立した API） */
export interface Settings {
  tenant: { tenantId: string; name: string };
  role: Role;
  permissions: { manageSettings: boolean; writeContent: boolean; manageMembers: boolean };
  youtube: {
    status: ChannelStatus;
    channel: {
      channelId: string;
      title: string;
      thumbnailUrl: string | null;
      subscriberCount: number | null;
      connectedAt: string;
    } | null;
    /** 表示用の文言（例「毎日 3:00 JST」）。日時ではない */
    nextCollection: string | null;
    lastCollectedAt: string | null;
    lastCsvImportAt: string | null;
    scopes: string[];
    captions: { enabled: boolean; availability: "available" | "preparing"; dailyLimit: number };
    /** テナントの Google Cloud OAuth クライアント（qa-087）。シークレットは返らない */
    googleClient: GoogleClientSummary;
    /** 連携解除後、旧チャンネルの削除が完了するまでの期限。未処理なら null */
    pendingDeletionDueAt: string | null;
  };
  imports: ImportRow[];
  tokens: SkillToken[];
  tokenLimit: number;
  usage: UsageItem[];
  deletion: { dueAt: string } | null;
}

export interface ChannelCandidate {
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  linkedElsewhere: boolean;
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
  return parseResponse<T>(res);
}

/** multipart（取込ファイル）。content-type はブラウザが boundary 付きで付ける */
export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "x-requested-with": "yta" },
    credentials: "same-origin",
    body: form,
  });
  return parseResponse<T>(res);
}

async function parseResponse<T>(res: Response): Promise<T> {
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
  OAUTH_STATE_MISMATCH: "ログインの確認に失敗しました。もう一度ログインしてください。",
  OAUTH_FAILED: "Googleとの通信に失敗しました。時間をおいてもう一度ログインしてください。",
  EMAIL_NOT_VERIFIED: "Googleアカウントのメールアドレスが確認されていません。",
  SIGNUP_CLOSED:
    "現在新規の受付を停止しています。既存ワークスペースのオーナーから招待を受けてください。",
  INVITE_NOT_USABLE:
    "この招待リンクは使えません（期限切れ・使用済み・取消済み）。オーナーに再発行を依頼してください。",
  INVITE_EMAIL_MISMATCH:
    "招待されたメールアドレスと異なるアカウントです。招待を受けたGoogleアカウントでログインし直してください。",
  ALREADY_MEMBER: "すでにこのワークスペースのメンバーです。",
  // YouTube 連携（/settings?error=CODE）
  NO_CHANNEL:
    "このGoogleアカウントにはYouTubeチャンネルがありません。ブランドアカウントのチャンネルは、Googleのアカウント選択画面でそのチャンネルを選んでください。",
  SCOPE_NOT_GRANTED:
    "必要な許可が付与されませんでした。Googleの同意画面で、すべての項目にチェックを入れて許可してください。",
  CHANNEL_MISMATCH:
    "連携中と別のチャンネルが選ばれました。再連携は同じチャンネルでだけできます。変更するときは先に連携解除してください。",
  CHANNEL_ALREADY_LINKED:
    "このチャンネルは別のワークスペースで連携済みです。先に連携している側で連携解除してください。",
  CHANNEL_DELETION_PENDING:
    "前のチャンネルのデータ削除が未完了です。削除が完了してから新しいチャンネルを連携してください。",
  CHANNEL_NOT_CONNECTED:
    "YouTubeチャンネルが連携されていません。「YouTubeと連携」から連携してください。",
  OAUTH_PENDING_EXPIRED:
    "連携の手続きの有効期限が切れました。もう一度「YouTubeと連携」からやり直してください。",
  FORBIDDEN: "この操作を行う権限がありません。ワークスペースのオーナーに依頼してください。",
  GOOGLE_CLIENT_NOT_CONFIGURED:
    "Google Cloud の接続情報が登録されていません。オーナーがクライアントIDとシークレットを登録してください。",
  GOOGLE_CLIENT_REJECTED:
    "Googleが登録済みのクライアントIDまたはシークレットを受け付けませんでした。Google Cloud Console の値を登録し直してください。",
};

/** 連携の完了（/settings?done=KEY）の表示文言 */
export const DONE_MESSAGES: Record<string, string> = {
  reconnected: "YouTubeと再連携しました。",
  captions_on: "字幕の自動取得をONにしました。次回の毎日収集から新着動画の字幕を取得します。",
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "オーナー",
  editor: "編集者",
  viewer: "閲覧者",
};
