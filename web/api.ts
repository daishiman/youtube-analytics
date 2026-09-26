// API 呼び出し。状態変更には CSRF 対策の X-Requested-With: yta を必ず付ける（requirements.md §5）

import type { CreatedVia, RequestStatus } from "../src/domain/analysis";
import type { ImportKind } from "../src/domain/import-rules";
import { TENANT_LABEL } from "../src/domain/labels";
import type { CandidateRef, HistoryReview, ReportResults } from "../src/domain/report-schema";

export type { CreatedVia, RequestStatus } from "../src/domain/analysis";
export type { ImportKind } from "../src/domain/import-rules";

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
  /** 最終収集時刻。収集前は null。ヘッダーに出す */
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
  has_original: number;
  mapped_columns: number | null;
  unmapped_columns: number | null;
  unresolved_rows: number | null;
  period_status: "unknown" | "daily" | null;
  created_at: string;
}

export interface StudioImportMapping {
  importId: string;
  studioKind: "table" | "graph" | "total";
  mappedColumns: number;
  unmappedColumns: number;
  unresolvedRows: number;
  periodStatus: "unknown" | "daily";
  columns: {
    ordinal: number;
    header: string;
    mappingKey: string | null;
    unit: string | null;
    status: "mapped" | "unmapped";
  }[];
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
  /** managed はサーバー側で接続情報を用意する対象テナント。通常テナントでは省略される */
  source?: "managed";
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
    /** 収集の稼働状況を表す文言。日時ではない */
    collectionStatus: string | null;
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
    /** エラー本文の追加項目（例: 結果取込の line・issues） */
    readonly details: Record<string, unknown> = {},
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
    error?: { code: string; message: string; hint: string } & Record<string, unknown>;
  };
  if (!res.ok) {
    const e = data.error ?? { code: "INTERNAL", message: "通信に失敗しました", hint: "" };
    const { code, message, hint, ...details } = e;
    throw new ApiError(res.status, code, message, hint, details);
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
  SIGNUP_CLOSED: `現在新規の受付を停止しています。既存${TENANT_LABEL}のオーナーから招待を受けてください。`,
  INVITE_NOT_USABLE:
    "この招待リンクは使えません（期限切れ・使用済み・取消済み）。オーナーに再発行を依頼してください。",
  INVITE_EMAIL_MISMATCH:
    "招待されたメールアドレスと異なるアカウントです。招待を受けたGoogleアカウントでログインし直してください。",
  ALREADY_MEMBER: `すでにこの${TENANT_LABEL}のメンバーです。`,
  YOUTUBE_LINK_MISMATCH:
    "ログイン中と別の Google アカウントで許可されたため、連携しませんでした。同じアカウントで「再連携」をやり直してください。",
  // YouTube 連携（/settings?error=CODE）
  NO_CHANNEL:
    "このGoogleアカウントにはYouTubeチャンネルがありません。ブランドアカウントのチャンネルは、Googleのアカウント選択画面でそのチャンネルを選んでください。",
  SCOPE_NOT_GRANTED:
    "必要な許可が付与されませんでした。Googleの同意画面で、すべての項目にチェックを入れて許可してください。",
  CHANNEL_MISMATCH:
    "連携中と別のチャンネルが選ばれました。再連携は同じチャンネルでだけできます。変更するときは先に連携解除してください。",
  CHANNEL_ALREADY_LINKED: `このチャンネルは別の${TENANT_LABEL}で連携済みです。先に連携している側で連携解除してください。`,
  CHANNEL_DELETION_PENDING:
    "前のチャンネルのデータ削除が未完了です。削除が完了してから新しいチャンネルを連携してください。",
  CHANNEL_NOT_CONNECTED:
    "YouTubeチャンネルが連携されていません。「YouTubeと連携」から連携してください。",
  OAUTH_PENDING_EXPIRED:
    "連携の手続きの有効期限が切れました。もう一度「YouTubeと連携」からやり直してください。",
  FORBIDDEN: `この操作を行う権限がありません。${TENANT_LABEL}のオーナーに依頼してください。`,
  GOOGLE_CLIENT_NOT_CONFIGURED:
    "Google Cloud の接続情報が登録されていません。オーナーがクライアントIDとシークレットを登録してください。",
  GOOGLE_CLIENT_REJECTED:
    "Googleが登録済みのクライアントIDまたはシークレットを受け付けませんでした。Google Cloud Console の値を登録し直してください。",
};

/** 連携の完了（/settings?done=KEY）の表示文言 */
export const DONE_MESSAGES: Record<string, string> = {
  reconnected: "YouTubeと再連携しました。",
  captions_on: "字幕の追加許可を保存しました。",
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

export type { FunnelMetricResult, PendingReason } from "../src/domain/funnel";
// サーバの応答型をそのまま使う（画面側で再定義しない）。型だけなので画面の bundle には入らない
export type {
  AnalyticsRawResponse,
  AnalyticsReportRowsPage as AnalyticsRawRowsPage,
} from "../src/repositories/analytics-raw-repository";
export type {
  ReportingReportsResponse,
  ReportingSyncSummary,
} from "../src/repositories/reporting-repository";
export type { CsvPreviewResponse } from "../src/usecases/csv-preview";
export type {
  DashboardResponse,
  DashboardVideo,
  Kpi,
  ShareItem,
} from "../src/usecases/dashboard";
export type { FunnelResponse } from "../src/usecases/funnel";
export type { ReportTypesResponse } from "../src/usecases/report-types";

// ---- AI分析（feat-ai-analysis-screen）。/api/analysis-requests・/api/analysis/data-summary・/api/reports ----
// 状態・作成経路・結果 JSON の型は src/domain（analysis.ts・report-schema.ts）が正本

export interface AnalysisRequest {
  requestId: string;
  channelId: string;
  periodStart: string;
  periodEnd: string;
  instruction: string;
  status: RequestStatus;
  progress: number;
  /** 0:未着手 1:データ取得 2:分析・HTML生成 3:反映 */
  stage: number;
  error: string | null;
  reportId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  retryOf: string | null;
  canceledAt: string | null;
  canceledBy: string | null;
  /** web=画面 / skill=Claude Code が自動で作成 / import=結果の取り込みで作成 */
  createdVia: CreatedVia;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DataSummary {
  period: { start: string; end: string };
  channel: { channelId: string; title: string } | null;
  /** 依存 feature の表がまだ無い項目は null（未取得） */
  counts: {
    dailyMetrics: number | null;
    videos: number | null;
    transcripts: number | null;
    sceneImages: number | null;
    comments: number | null;
  };
  csvImports: { total: number; byKind: { key: string; n: number }[] } | null;
  exportRows: { total: number; bySource: { key: string; n: number }[] } | null;
}

export interface ReportSummary {
  reportId: string;
  requestId: string;
  version: number;
  title: string;
  summary: string;
  outcome: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  archived: boolean;
}

export interface ReportActionItem {
  key: string;
  title: string;
  stage: string;
  metric: string;
  baselineValue: number | null;
  targetValue: number | null;
  primary: boolean;
  registered: { actionId: string; status: string } | null;
}

export interface ReportFinding {
  no: number;
  kind: "factor" | "hypothesis";
  title: string;
  fact: string | null;
  interpretation: string | null;
  stage: string | null;
  metric: string | null;
  hypothesisId: string | null;
  falsifier: string | null;
  verdict: string | null;
  evidence: unknown;
}

export interface ReportDetail extends Omit<ReportSummary, "archived"> {
  conclusion: string;
  candidate: CandidateRef;
  isLatest: boolean;
  archived: boolean;
  createdVia: CreatedVia | null;
  requestStatus: RequestStatus | null;
  brief: Record<string, unknown>;
  /** 取込時に parseReport で検査した形（history-review.ts の変換関数だけが読む） */
  results: ReportResults;
  historyReview: HistoryReview;
  historyVersionsUsed: number[];
  ideas: unknown[];
  findings: ReportFinding[];
  psych: {
    no: number;
    layer: string;
    claim: string;
    evidence: unknown[];
    counterHypothesis: string | null;
    confidence: number;
  }[];
  emotions: { commentId: string; emotion: string; intent: string | null }[];
  actions: ReportActionItem[];
  versions: { reportId: string; version: number; createdAt: string; archived: boolean }[];
  reportHtml: string;
}

interface DiffSide extends Omit<ReportSummary, "archived"> {
  conclusion: string;
  candidate: CandidateRef;
  findings: { kind: string; title: string; verdict: string | null }[];
  actions: string[];
}

export interface ReportDiff {
  a: DiffSide;
  b: DiffSide;
  changed: Record<"title" | "summary" | "conclusion" | "outcome" | "candidate", boolean>;
  findings: { added: string[]; removed: string[] };
  actions: { added: string[]; removed: string[] };
}

export interface ImportedReport {
  reportId: string;
  version: number;
  requestId: string;
  requestCreated: boolean;
}

export interface RegisteredActions {
  reportId: string;
  created: string[];
  alreadyRegistered: string[];
  actions: { key: string; actionId: string; title: string; status: string }[];
}

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};
const rid = (id: string) => encodeURIComponent(id);

export const analysisApi = {
  createRequest: (body: { period_start: string; period_end: string; instruction: string }) =>
    api<AnalysisRequest>("/api/analysis-requests", { method: "POST", body }),
  listRequests: (cursor?: string, signal?: AbortSignal) =>
    api<Page<AnalysisRequest>>(`/api/analysis-requests${qs({ cursor })}`, { signal }),
  getRequest: (id: string, signal?: AbortSignal) =>
    api<AnalysisRequest>(`/api/analysis-requests/${rid(id)}`, { signal }),
  cancel: (id: string) =>
    api<AnalysisRequest>(`/api/analysis-requests/${rid(id)}/cancel`, { method: "POST" }),
  retry: (id: string) =>
    api<AnalysisRequest>(`/api/analysis-requests/${rid(id)}/retry`, { method: "POST" }),
  getPrompt: (id: string) =>
    api<{ requestId: string; prompt: string }>(`/api/analysis-requests/${rid(id)}/prompt`),
  getDataSummary: (from: string, to: string, signal?: AbortSignal) =>
    api<DataSummary>(`/api/analysis/data-summary${qs({ from, to })}`, { signal }),
  listReports: (q: { q?: string; archived?: boolean; cursor?: string }, signal?: AbortSignal) =>
    api<Page<ReportSummary>>(
      `/api/reports${qs({ q: q.q, archived: q.archived ? "1" : undefined, cursor: q.cursor })}`,
      { signal },
    ),
  getReport: (id: string, version?: number, signal?: AbortSignal) =>
    api<ReportDetail>(`/api/reports/${rid(id)}${qs({ version: version?.toString() })}`, {
      signal,
    }),
  diff: (a: string, b: string, signal?: AbortSignal) =>
    api<ReportDiff>(`/api/reports/diff${qs({ a, b })}`, { signal }),
  importResult: (body: Record<string, unknown>) =>
    api<ImportedReport>("/api/reports/import", { method: "POST", body }),
  archive: (id: string) =>
    api<{ reportId: string; archived: boolean }>(`/api/reports/${rid(id)}/archive`, {
      method: "PUT",
    }),
  unarchive: (id: string) =>
    api<{ reportId: string; archived: boolean }>(`/api/reports/${rid(id)}/archive`, {
      method: "DELETE",
    }),
  registerActions: (id: string, keys: string[]) =>
    api<RegisteredActions>(`/api/reports/${rid(id)}/actions`, {
      method: "POST",
      body: { keys },
    }),
};
