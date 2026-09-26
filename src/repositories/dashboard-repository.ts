// ダッシュボードの読み取り専用クエリ（qa-103〜qa-108）。生成時に tenant_id を固定し、全クエリの WHERE に入れる。
// 選んだ動画は JSON 配列1個を json_each で展開して1パラメータでバインドする
// （D1 は1クエリのバインド上限が100・件数の上限を設けないため・qa-108）

import { channelMetadataExpired, EXPIRED_CHANNEL_TITLE } from "../domain/channel-metadata";
import type { TenantContext } from "../domain/tenant-context";
import type { VideoContentType } from "../domain/video-content-type";

// レポート版は追記のみで、アーカイブは report_archives の行の有無で表す（AI分析の一覧と同じ見え方にする）
const NOT_ARCHIVED =
  "NOT EXISTS (SELECT 1 FROM report_archives a WHERE a.tenant_id = r.tenant_id AND a.report_id = r.report_id)";

export interface ChannelRow {
  channel_id: string;
  title: string;
  status: string;
  last_collected_at: string | null;
  latest_analytics_date: string | null;
  collection_failed: number;
}

export interface VideoRow {
  video_id: string;
  title: string;
  published_at: string;
  content_type: VideoContentType;
  angle: string | null;
  thumbnail_fetched_at: string | null;
}

export interface DailySumRow {
  date: string;
  views: number | null;
  minutes: number | null;
  subscribers_gained: number | null;
  subscribers_lost: number | null;
  views_count?: number;
  minutes_count?: number;
}

export interface RetentionDailyRow {
  date: string;
  weighted: number | null;
  views: number | null;
  sourced_count?: number;
}

export interface FunnelRetentionRow extends RetentionDailyRow {
  m1_rows: number;
  m1_sourced_rows: number;
  oldest_imported_at: string | null;
}

export interface VideoTotalRow {
  video_id: string;
  views: number | null;
  minutes: number | null;
}

export interface VideoRetentionRow {
  video_id: string;
  weighted: number | null;
  views: number | null;
}

export interface VideoDailyRow {
  video_id: string;
  date: string;
  views: number | null;
}

export interface CtrRow {
  video_id: string;
  date: string;
  ctr: number | null;
}

export interface ReportRow {
  report_id: string;
  version: number;
  title: string;
  conclusion: string | null;
  created_at: string;
}

/** actions は main の AI分析（0010）の表。指標の表示名と単位は CAUSE_METRIC_INFO から引く */
export interface ActionRow {
  action_id: string;
  title: string;
  status: "実施中" | "効果測定中";
  metric: string;
  baseline_value: number | null;
  result_value: number | null;
}

export interface FunnelDailyRow {
  date: string;
  views: number | null;
  engaged_views: number | null;
  impressions: number | null;
  ctr_weighted: number | null;
  imported_at: string | null;
}

export interface BusinessWeekRow {
  week_start: string;
  route_label: string;
  route_visits: number | null;
  inquiries: number | null;
  closed_deals: number | null;
  revenue_jpy: number | null;
  imported_at: string;
}

export interface FunnelTargetRow {
  metric_id: string;
  target_value: number | null;
  min_sample: number;
  effective_from: string;
}

/** batch の i 番目の結果行（noUncheckedIndexedAccess 下で undefined を空配列にそろえる） */
function rowsOf<T>(result: D1Result | undefined): T[] {
  return (result?.results ?? []) as T[];
}

export class DashboardRepository {
  readonly tenantId: string;

  constructor(
    private readonly db: D1Database,
    ctx: Pick<TenantContext, "tenantId">,
  ) {
    this.tenantId = ctx.tenantId;
  }

  async channel(now = new Date()): Promise<ChannelRow | null> {
    const row = await this.db
      .prepare(
        `SELECT c.channel_id, c.title, c.status, c.last_collected_at,
                (SELECT MAX(m.date) FROM daily_metrics m
                  WHERE m.tenant_id = c.tenant_id AND m.channel_id = c.channel_id
                    AND m.content_type = 'all' AND m.views IS NOT NULL
                ) AS latest_analytics_date,
                c.connected_at, c.metadata_fetched_at,
                EXISTS (
                  SELECT 1 FROM collection_series_status f
                   WHERE f.tenant_id = c.tenant_id AND f.channel_id = c.channel_id
                     AND f.connected_at = c.connected_at AND f.token_updated_at = o.updated_at
                     AND f.status = 'failed'
                ) AS collection_failed
           FROM channels c
           LEFT JOIN channel_oauth_tokens o ON o.tenant_id = c.tenant_id AND o.channel_id = c.channel_id
          WHERE c.tenant_id = ?1`,
      )
      .bind(this.tenantId)
      .first<ChannelRow & { connected_at: string; metadata_fetched_at: string | null }>();
    if (!row) return null;
    const { metadata_fetched_at: fetchedAt, connected_at: connectedAt, ...channel } = row;
    return channelMetadataExpired(fetchedAt ?? connectedAt, now)
      ? { ...channel, title: EXPIRED_CHANNEL_TITLE }
      : channel;
  }

  /** チャンネルの全動画。30日超のData API表示値とサムネイルは読取時にも隠す。 */
  async videos(channelId: string, freshSince: string): Promise<VideoRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT v.video_id,
                CASE WHEN v.fetched_at < ?3 THEN '動画情報の再取得待ち' ELSE v.title END AS title,
                CASE WHEN v.fetched_at < ?3 THEN '' ELSE v.published_at END AS published_at,
                CASE WHEN v.fetched_at < ?3 THEN 'unknown' ELSE v.content_type END AS content_type,
                a.angle,
                CASE WHEN m.fetched_at > ?3 THEN m.fetched_at END AS thumbnail_fetched_at
           FROM videos v
           LEFT JOIN video_angles a ON a.tenant_id = v.tenant_id AND a.video_id = v.video_id
           LEFT JOIN media_assets m
             ON m.tenant_id = v.tenant_id AND m.asset_id = 'thumbnail:' || v.video_id
          WHERE v.tenant_id = ?1 AND v.channel_id = ?2
          ORDER BY CASE WHEN v.fetched_at < ?3 THEN '' ELSE v.published_at END DESC, v.video_id`,
      )
      .bind(this.tenantId, channelId, freshSince)
      .all<VideoRow>();
    return results;
  }

  /**
   * 期間の集計をまとめて1回の batch で読む（D1 の呼び出しを1回に抑える）。
   * - 動画別の合計・M1・CTR はチャンネルの全動画ぶん（構成比の分母にするため）
   * - 日次の合計と M1 は scope に合わせる（channel はチャンネル全体、videos は選んだ動画だけ）
   * range は前期の開始日〜今期の終了日、current は今期だけ
   */
  async periodAggregates(args: {
    channelId: string;
    selectedIds: string[];
    scope: "channel" | "videos";
    range: { from: string; to: string };
    current: { from: string; to: string };
  }) {
    const { channelId, range, current } = args;
    const t = this.tenantId;
    const selected = JSON.stringify(args.selectedIds);
    // ?4 は channel_id（チャンネルの全動画）か JSON 配列（選んだ動画）
    const byChannel =
      "JOIN videos v ON v.tenant_id = m.tenant_id AND v.video_id = m.video_id AND v.channel_id = ?4";
    const bySelection =
      "JOIN json_each(?4) j ON j.value = m.video_id JOIN videos v ON v.tenant_id = m.tenant_id AND v.video_id = m.video_id";
    const dailyJoin = args.scope === "channel" ? byChannel : bySelection;
    const dailyParam = args.scope === "channel" ? channelId : selected;

    const res = await this.db.batch([
      // 0: API のチャンネル日次（チャンネル全体の KPI と推移。削除済み動画の分も含む公式値）
      // all 系列だけを読む。形式別の行が加わっても all と二重に数えない
      this.db
        .prepare(
          `SELECT date, SUM(views) AS views, SUM(estimated_minutes_watched) AS minutes,
                  SUM(subscribers_gained) AS subscribers_gained, SUM(subscribers_lost) AS subscribers_lost
             FROM daily_metrics
            WHERE tenant_id = ?1 AND channel_id = ?2 AND content_type = 'all'
              AND date BETWEEN ?3 AND ?4
            GROUP BY date ORDER BY date`,
        )
        .bind(t, channelId, range.from, range.to),
      // 1: API の動画別日次を日ごとに合計（選んだ動画の KPI と推移）
      this.db
        .prepare(
          `SELECT m.date, SUM(m.views) AS views, SUM(m.estimated_minutes_watched) AS minutes,
                  COUNT(m.views) AS views_count,
                  COUNT(m.estimated_minutes_watched) AS minutes_count,
                  NULL AS subscribers_gained, NULL AS subscribers_lost
             FROM video_metrics m ${bySelection}
            WHERE m.tenant_id = ?1 AND m.date BETWEEN ?2 AND ?3
            GROUP BY m.date ORDER BY m.date`,
        )
        .bind(t, range.from, range.to, selected),
      // 2: CSV の長尺動画だけを対象にした暫定平均視聴率。
      // Studio CSV の同一期間のエンゲージビュー・再生時間・動画長が揃わず、正式 M1 ではない。
      this.db
        .prepare(
          `SELECT m.date, SUM(m.average_view_percentage * m.views) AS weighted,
                  SUM(CASE WHEN m.average_view_percentage IS NOT NULL THEN m.views END) AS views,
                  COUNT(CASE WHEN m.average_view_percentage IS NOT NULL AND m.views IS NOT NULL
                    THEN 1 END) AS sourced_count
             FROM video_daily_metrics m ${dailyJoin}
            WHERE m.tenant_id = ?1 AND m.date BETWEEN ?2 AND ?3
              AND v.content_type = 'long'
            GROUP BY m.date ORDER BY m.date`,
        )
        .bind(t, range.from, range.to, dailyParam),
      // 3: 今期の動画ごとの合計（表と構成比）
      this.db
        .prepare(
          `SELECT m.video_id, SUM(m.views) AS views, SUM(m.estimated_minutes_watched) AS minutes
             FROM video_metrics m ${byChannel}
            WHERE m.tenant_id = ?1 AND m.date BETWEEN ?2 AND ?3
            GROUP BY m.video_id`,
        )
        .bind(t, current.from, current.to, channelId),
      // 4: 今期の長尺動画ごとの暫定平均視聴率（CSV）。Shorts は対象外。
      this.db
        .prepare(
          `SELECT m.video_id, SUM(m.average_view_percentage * m.views) AS weighted,
                  SUM(CASE WHEN m.average_view_percentage IS NOT NULL THEN m.views END) AS views
             FROM video_daily_metrics m ${byChannel}
            WHERE m.tenant_id = ?1 AND m.date BETWEEN ?2 AND ?3
              AND v.content_type = 'long'
            GROUP BY m.video_id`,
        )
        .bind(t, current.from, current.to, channelId),
      // 5: 期間内で最新日の CTR（Reporting API の値をそのまま。期間平均は自前計算になるので出さない）
      this.db
        .prepare(
          `SELECT m.video_id, m.date, m.video_thumbnail_impressions_ctr AS ctr
             FROM video_reach_daily m ${byChannel}
            WHERE m.tenant_id = ?1 AND m.date = (
                    SELECT MAX(r.date) FROM video_reach_daily r
                     WHERE r.tenant_id = m.tenant_id AND r.video_id = m.video_id
                       AND r.date BETWEEN ?2 AND ?3 AND r.video_thumbnail_impressions_ctr IS NOT NULL)`,
        )
        .bind(t, current.from, current.to, channelId),
      // 6: 選んだ動画ごとの今期の日次視聴回数（推移に動画ごとの線を重ねる）
      this.db
        .prepare(
          `SELECT m.video_id, m.date, m.views
             FROM video_metrics m ${bySelection}
            WHERE m.tenant_id = ?1 AND m.date BETWEEN ?2 AND ?3
            ORDER BY m.video_id, m.date`,
        )
        .bind(t, current.from, current.to, selected),
    ]);
    return {
      channelDaily: rowsOf<DailySumRow>(res[0]),
      selectionDaily: rowsOf<DailySumRow>(res[1]),
      retentionDaily: rowsOf<RetentionDailyRow>(res[2]),
      videoTotals: rowsOf<VideoTotalRow>(res[3]),
      videoRetention: rowsOf<VideoRetentionRow>(res[4]),
      ctr: rowsOf<CtrRow>(res[5]),
      perVideoDaily: rowsOf<VideoDailyRow>(res[6]),
    };
  }

  /** 最新のレポート版（アーカイブを除く）・主な発見3つ・実施中/効果測定中のアクション・APIデータ有無を1回の batch で読む */
  async sideData(channelId: string) {
    const t = this.tenantId;
    const res = await this.db.batch([
      this.db
        .prepare(
          `SELECT report_id, version, title, conclusion, created_at FROM reports r
            WHERE tenant_id = ?1 AND channel_id = ?2 AND ${NOT_ARCHIVED}
            ORDER BY version DESC LIMIT 1`,
        )
        .bind(t, channelId),
      this.db
        .prepare(
          `SELECT f.report_id, f.title FROM findings f
            WHERE f.tenant_id = ?1 AND f.report_id = (
                    SELECT report_id FROM reports r
                     WHERE tenant_id = ?1 AND channel_id = ?2 AND ${NOT_ARCHIVED}
                     ORDER BY version DESC LIMIT 1)
            ORDER BY f.finding_no LIMIT 3`,
        )
        .bind(t, channelId),
      this.db
        .prepare(
          `SELECT action_id, title, status, metric, baseline_value, result_value
             FROM actions
            WHERE tenant_id = ?1 AND channel_id = ?2 AND status IN ('実施中', '効果測定中')
            ORDER BY CASE status WHEN '実施中' THEN 0 ELSE 1 END, updated_at DESC, action_id`,
        )
        .bind(t, channelId),
      this.db
        .prepare(
          `SELECT EXISTS (
             SELECT 1 FROM daily_metrics WHERE tenant_id = ?1 AND channel_id = ?2
           ) AS has_api`,
        )
        .bind(t, channelId),
    ]);
    return {
      report: rowsOf<ReportRow>(res[0])[0] ?? null,
      findings: rowsOf<{ title: string }>(res[1]).map((r) => r.title),
      actions: rowsOf<ActionRow>(res[2]),
      hasApi: Boolean(rowsOf<{ has_api: number }>(res[3])[0]?.has_api),
    };
  }

  /** 週次ファネルの入力を1回の batch で読む（range は対象週を含む複数週） */
  async funnelInputs(channelId: string, range: { from: string; to: string }) {
    const t = this.tenantId;
    const res = await this.db.batch([
      this.db
        .prepare(
          `SELECT date, views, engaged_views, impressions, impressions_ctr * impressions AS ctr_weighted, imported_at
             FROM channel_daily_metrics
            WHERE tenant_id = ?1 AND channel_id = ?2 AND date BETWEEN ?3 AND ?4
            ORDER BY date`,
        )
        .bind(t, channelId, range.from, range.to),
      this.db
        .prepare(
          `SELECT m.date, SUM(m.average_view_percentage * m.views) AS weighted,
                  SUM(CASE WHEN m.average_view_percentage IS NOT NULL THEN m.views END) AS views,
                  SUM(CASE WHEN m.average_view_percentage IS NOT NULL AND m.views IS NOT NULL
                           THEN 1 ELSE 0 END) AS m1_rows,
                  SUM(CASE WHEN m.average_view_percentage IS NOT NULL AND m.views IS NOT NULL
                            AND vi.imported_at IS NOT NULL AND ai.imported_at IS NOT NULL
                           THEN 1 ELSE 0 END) AS m1_sourced_rows,
                  MIN(CASE WHEN m.average_view_percentage IS NOT NULL AND m.views IS NOT NULL
                            AND vi.imported_at IS NOT NULL AND ai.imported_at IS NOT NULL
                           THEN MIN(vi.imported_at, ai.imported_at) END) AS oldest_imported_at
             FROM video_daily_metrics m
             JOIN videos v ON v.tenant_id = m.tenant_id AND v.video_id = m.video_id AND v.channel_id = ?2
             LEFT JOIN studio_csv_imports vi ON vi.tenant_id = m.tenant_id
               AND vi.import_id = m.views_csv_import_id AND vi.channel_id = v.channel_id
             LEFT JOIN studio_csv_imports ai ON ai.tenant_id = m.tenant_id
               AND ai.import_id = m.average_view_percentage_csv_import_id
               AND ai.channel_id = v.channel_id
            WHERE m.tenant_id = ?1 AND m.date BETWEEN ?3 AND ?4
              AND v.content_type = 'long'
            GROUP BY m.date ORDER BY m.date`,
        )
        .bind(t, channelId, range.from, range.to),
      this.db
        .prepare(
          `SELECT week_start, route_label, route_visits, inquiries, closed_deals, revenue_jpy, imported_at
             FROM business_funnel_weekly
            WHERE tenant_id = ?1 AND channel_id = ?2 AND week_start BETWEEN ?3 AND ?4
            ORDER BY week_start`,
        )
        .bind(t, channelId, range.from, range.to),
      this.db
        .prepare(
          `SELECT metric_id, target_value, min_sample, effective_from FROM funnel_targets
            WHERE tenant_id = ?1 AND channel_id = ?2 AND effective_from <= ?3
            ORDER BY effective_from DESC`,
        )
        .bind(t, channelId, range.to),
      this.db
        .prepare(
          `SELECT date, SUM(subscribers_gained) AS subscribers_gained, SUM(subscribers_lost) AS subscribers_lost
             FROM daily_metrics
            WHERE tenant_id = ?1 AND channel_id = ?2 AND content_type = 'all'
              AND date BETWEEN ?3 AND ?4
            GROUP BY date`,
        )
        .bind(t, channelId, range.from, range.to),
    ]);
    return {
      daily: rowsOf<FunnelDailyRow>(res[0]),
      retention: rowsOf<FunnelRetentionRow>(res[1]),
      business: rowsOf<BusinessWeekRow>(res[2]),
      targets: rowsOf<FunnelTargetRow>(res[3]),
      subscribers: rowsOf<Pick<DailySumRow, "date" | "subscribers_gained" | "subscribers_lost">>(
        res[4],
      ),
    };
  }

  /** サムネイル（自テナントの行だけ） */
  async thumbnail(videoId: string): Promise<{ r2_key: string; fetched_at: string } | null> {
    return this.db
      .prepare(
        `SELECT r2_key, fetched_at FROM media_assets
          WHERE tenant_id = ?1 AND asset_id = ?2 AND kind = 'thumbnail'`,
      )
      .bind(this.tenantId, `thumbnail:${videoId}`)
      .first();
  }
}
