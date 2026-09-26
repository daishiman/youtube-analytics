// Queue で送る通の型。env.ts（バインディング）と usecase の両方から参照するため中立位置に置く
import type { AnalyticsDimensionKey } from "../adapters/google-analytics-dimensions";

/** Cron 時点の連携世代。解除・再連携後に届いた古い通を無視する。 */
export type CollectMessage = {
  kind: "collect";
  tenantId: string;
  channelId: string;
  connectedAt: string;
  tokenUpdatedAt: string;
  /** Cron投入時刻。継続通にも引き継ぎ、同じ連携世代の古い通を識別する。 */
  cycleStartedAt?: string;
  /** uploads playlist の続き。両方とも存在するときだけ2ページ目以降。 */
  uploadsPlaylistId?: string;
  pageToken?: string;
  /** 同一収集サイクルで日付範囲を固定する。 */
  startDate?: string;
  endDate?: string;
};
/** OAuth 連携世代。解除・再連携で connectedAt / tokenUpdatedAt が変わる。 */
export type LinkIdentity = Pick<
  CollectMessage,
  "tenantId" | "channelId" | "connectedAt" | "tokenUpdatedAt"
>;
/** 連携世代と収集サイクル。収集系の通はすべてこの5項目を持つ。 */
export type LinkGeneration = LinkIdentity & Pick<CollectMessage, "cycleStartedAt">;
/** Reporting API の原本収集。Queue 受信時に OAuth 連携世代を再確認する。 */
export type ReportingMessage = LinkGeneration & {
  kind: "reporting";
  jobOffset?: number;
  reportPageToken?: string;
  /** jobOffset のジョブの取得位置。続きページと再試行で同じ値を使う（無ければ受信時に D1 から決める） */
  reportCursor?: ReportingCursor;
};
/**
 * Reporting ジョブごとの取得位置（jobs.reports.list の createdAfter）。jobId が違えば使わない。
 * createdAfter が null なら保存済みが無く、全件を取る
 */
export type ReportingCursor = { jobId: string; createdAfter: string | null };
/** Cron 時の連携世代を持つ。1通につき1種類のレポートで再試行を分離する。 */
export type AnalyticsDimensionsMessage = LinkGeneration & {
  kind: "analytics-dimensions";
  reportKey: AnalyticsDimensionKey;
};
export type CaptionMessage = LinkGeneration & {
  kind: "captions";
  quotaDate: string;
  videoId: string;
};
export type CleanupMessage =
  | { kind: "cleanup" }
  | { kind: "retention" }
  | { kind: "thumbnail-retention" }
  | { kind: "tenant-cleanup" };
/** サムネイルの取り直し（1通15件まで・qa-108）。収集の通とは別のキューで送る */
export type ThumbnailMessage = {
  kind: "thumbnail";
  tenantId: string;
  channelId: string;
  connectedAt: string;
  generation: number;
  items: { videoId: string; url: string }[];
};
