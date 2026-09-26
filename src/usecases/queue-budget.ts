// Queue の1日の操作予算の正本。Queues Free は1日1万操作で、1通 = 書込・読取・削除の3操作。
// 各処理の通数上限を変えたら QUEUE_MESSAGES_PER_CONNECTION も合わせて直す（tests/platform/queue-budget.test.ts）
export const QUEUE_DAILY_OPS_LIMIT = 10_000;
export const QUEUE_OPS_PER_MESSAGE = 3;
/** 再試行（max_retries=3）と手動の再取得に2割を残す */
export const QUEUE_DAILY_SAFE_OPS = Math.floor(QUEUE_DAILY_OPS_LIMIT * 0.8);

/**
 * 有効連携1件あたり1日の最大通数（thumbnail を除く）。
 * collect: 動画一覧の続きページを含めて20通（1ページ50本なので動画1,000本までの想定。コードの上限ではない）。
 * reporting: 定常時はジョブ約25件がそれぞれ1日1件の新しいレポートを出す。1通でダウンロード
 * REPORTS_PER_MESSAGE（5）件・一覧 REPORT_LISTS_PER_MESSAGE（10）回まで次のジョブへ進むので
 * 25 / 5 = 5通。枠の境目で1通、backfill の追加分で1通を見込んで7通。
 * dimensions: 次元別3通（ANALYTICS_DIMENSION_KEYS）。captions: 字幕4通（CAPTION_DAILY_LIMIT）。
 * 両者との一致は queue-budget.test.ts で確かめる（予算の定数から settings 系を import しないため）
 */
export const QUEUE_MESSAGES_PER_CONNECTION = {
  collect: 20,
  reporting: 7,
  dimensions: 3,
  captions: 4,
} as const;
/** 保持期限切れの削除と退会テナントの削除（全体で1日。続きの再送を含む予備込み） */
export const QUEUE_CLEANUP_MESSAGES_PER_DAY = 100;
/** thumbnail の1日の送信回数の上限（全テナント合計）。従来の固定値 = (8,000 − 6,000) / 9 */
export const THUMBNAIL_SENDS_PER_DAY_MAX = 222;

const messagesPerConnection = Object.values(QUEUE_MESSAGES_PER_CONNECTION).reduce(
  (sum, n) => sum + n,
  0,
);

/** thumbnail を除いた1日の見積もり操作数 */
export function fixedDailyOps(activeConnections: number): number {
  return (
    (activeConnections * messagesPerConnection + QUEUE_CLEANUP_MESSAGES_PER_DAY) *
    QUEUE_OPS_PER_MESSAGE
  );
}

/** 固定分を引いた残りから、thumbnail の1日の送信回数を決める（残りがなければ0 = 翌日以降も送らない） */
export function thumbnailSendsPerDay(activeConnections: number, messagesPerSend: number): number {
  const remaining = QUEUE_DAILY_SAFE_OPS - fixedDailyOps(activeConnections);
  const sends = Math.floor(remaining / (messagesPerSend * QUEUE_OPS_PER_MESSAGE));
  return Math.max(0, Math.min(THUMBNAIL_SENDS_PER_DAY_MAX, sends));
}

/** 固定分だけで安全予算に収まる有効連携数の上限 */
export function maxConnectionsWithinBudget(): number {
  const perConnection = messagesPerConnection * QUEUE_OPS_PER_MESSAGE;
  const cleanup = QUEUE_CLEANUP_MESSAGES_PER_DAY * QUEUE_OPS_PER_MESSAGE;
  return Math.max(0, Math.floor((QUEUE_DAILY_SAFE_OPS - cleanup) / perConnection));
}
