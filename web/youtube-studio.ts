// YouTube Studio の「アナリティクス → 詳細モード」を、連携中チャンネルで開く URL を組み立てる。
// データ取込の CSV の取得元として設定画面に表示する（チャンネル ID を差し替えるだけで全テナントに使える）

/** 取込 CSV に入れたい列（Studio の t_metrics）。視聴回数で並べ、動画ごと・日ごとに見る */
export const STUDIO_CSV_METRICS = [
  "EXTERNAL_VIEWS",
  "EXTERNAL_WATCH_TIME",
  "SUBSCRIBERS_NET_CHANGE",
  "TOTAL_ESTIMATED_EARNINGS",
  "VIDEO_THUMBNAIL_IMPRESSIONS",
  "VIDEO_THUMBNAIL_IMPRESSIONS_VTR",
] as const;

/** 連携中チャンネルの Studio 詳細モード（直近4週間・動画別の表とグラフ）の URL */
export function studioAnalyticsUrl(channelId: string): string {
  const id = encodeURIComponent(channelId);
  const query = new URLSearchParams({
    entity_type: "CHANNEL",
    entity_id: channelId,
    time_period: "4_weeks",
    explore_type: "TABLE_AND_CHART",
    metric: "EXTERNAL_VIEWS",
    granularity: "DAY",
  });
  for (const m of STUDIO_CSV_METRICS) query.append("t_metrics", m);
  query.set("dimension", "VIDEO");
  query.set("o_column", "EXTERNAL_VIEWS");
  query.set("o_direction", "ANALYTICS_ORDER_DIRECTION_DESC");
  return `https://studio.youtube.com/channel/${id}/analytics/tab-overview/period-default/explore?${query}`;
}
