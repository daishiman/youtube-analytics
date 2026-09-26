// ダッシュボードのテスト用データ。日付は実行日（JST）からの相対で作り、期間の境界を固定値に依存させない
import { env } from "cloudflare:workers";
import { addDays, jstStartIso, jstToday } from "../../src/domain/dashboard-period";
import { insertChannel } from "../helpers/channels";

export interface SeedOptions {
  tenantId: string;
  userId: string;
  channelId?: string;
  videos?: number;
  days?: number;
  /** 1日の視聴回数（チャンネル合計）。前期との比較用に古い日ほど少なくする */
  csv?: boolean;
  report?: boolean;
  actions?: boolean;
}

export const yesterday = () => addDays(jstToday(new Date()), -1);

/** 動画 i（0 が最新）の ID。テナントごとに重複しないよう tenantId の頭を付ける */
export const videoId = (tenantId: string, i: number) =>
  `v${tenantId.slice(0, 6)}${String(i).padStart(3, "0")}`;

/**
 * チャンネル1つ・動画 N 本・日次指標 days 日分を入れる。
 * - 動画 i は i*3 日前に公開。日次の動画別視聴回数は (N - i) * 10
 * - チャンネル日次の視聴回数 = 動画別の合計 + 5（削除済み動画の分を模す）
 */
export async function seedDashboard(opts: SeedOptions) {
  const t = opts.tenantId;
  const channelId = opts.channelId ?? `UC${t.slice(0, 20)}`;
  const n = opts.videos ?? 12;
  const days = opts.days ?? 60;
  const today = jstToday(new Date());
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    insertChannel({
      tenantId: t,
      channelId,
      title: "テストチャンネル",
      connectedBy: opts.userId,
      connectedAt: now,
      lastCollectedAt: now,
    }),
  ];
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = videoId(t, i);
    ids.push(id);
    const published = jstStartIso(addDays(today, -(i * 3 + 1)));
    stmts.push(
      env.DB.prepare(
        `INSERT INTO videos (tenant_id, video_id, channel_id, title, published_at, content_type, thumbnail_url, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(
        t,
        id,
        channelId,
        `動画${i}`,
        published,
        i % 3 === 0 ? "shorts" : "long",
        `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        now,
      ),
    );
    if (i % 2 === 0) {
      stmts.push(
        env.DB.prepare(
          "INSERT INTO video_angles (tenant_id, video_id, angle) VALUES (?1, ?2, ?3)",
        ).bind(t, id, i % 4 === 0 ? "つまずき解決型" : "是非・意見型"),
      );
    }
  }
  for (let d = 1; d <= days; d++) {
    const date = addDays(today, -d);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const views = (n - i) * 10;
      total += views;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO video_metrics (tenant_id, video_id, date, views, estimated_minutes_watched, average_view_percentage, fetched_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 40, ?6)`,
        ).bind(t, ids[i], date, views, views * 2, now),
      );
      if (opts.csv) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO video_daily_metrics (tenant_id, video_id, date, views, engaged_views, average_view_percentage)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
          ).bind(t, ids[i], date, views, views, i === 0 ? 60 : 30),
        );
      }
    }
    stmts.push(
      env.DB.prepare(
        `INSERT INTO daily_metrics (tenant_id, channel_id, date, content_type, views, estimated_minutes_watched, subscribers_gained, subscribers_lost, fetched_at)
         VALUES (?1, ?2, ?3, 'all', ?4, ?5, 3, 1, ?6)`,
      ).bind(t, channelId, date, total + 5, (total + 5) * 2, now),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO video_reach_daily (tenant_id, video_id, date, video_thumbnail_impressions, video_thumbnail_impressions_ctr, fetched_at)
         VALUES (?1, ?2, ?3, 1000, ?4, ?5)`,
      ).bind(t, ids[0], date, d === 1 ? 5.5 : 4.0, now),
    );
    if (opts.csv) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO channel_daily_metrics (tenant_id, channel_id, date, views, engaged_views, impressions, impressions_ctr, imported_at)
           VALUES (?1, ?2, ?3, ?4, ?4, 10000, 5, ?5)`,
        ).bind(t, channelId, date, total, now),
      );
    }
  }
  if (opts.report) {
    // reports/findings/actions は main の AI分析（0009・0010）の列。r3 はアーカイブ済みなので最新から外れる
    const report = (id: string, version: number, title: string, conclusion: string, at: string) =>
      env.DB.prepare(
        `INSERT INTO reports (tenant_id, report_id, channel_id, request_id, version, title, conclusion, outcome,
           period_start, period_end, brief_json, results_json, history_review_json, report_html,
           idempotency_key, created_by, created_at)
         VALUES (?1, ?2, ?3, ?2, ?4, ?5, ?6, '判定保留', '2026-01-01', '2026-01-28', '{}', '{}', '{}', '', ?2, ?7, ?8)`,
      ).bind(t, id, channelId, version, title, conclusion, opts.userId, at);
    stmts.push(
      report("r1", 1, "古いレポート", "古い結論", "2026-01-01T00:00:00Z"),
      report("r2", 2, "最新レポート", "<b>結論</b>です", "2026-02-01T00:00:00Z"),
      report("r3", 3, "アーカイブしたレポート", "外す", "2026-03-01T00:00:00Z"),
      env.DB.prepare(
        `INSERT INTO report_archives (tenant_id, report_id, archived_by, archived_at)
         VALUES (?1, 'r3', ?2, '2026-03-02T00:00:00Z')`,
      ).bind(t, opts.userId),
      env.DB.prepare(
        `INSERT INTO findings (tenant_id, report_id, finding_no, kind, title) VALUES
           (?1, 'r2', 1, 'factor', '発見1'), (?1, 'r2', 2, 'factor', '発見2'),
           (?1, 'r2', 3, 'hypothesis', '発見3'), (?1, 'r2', 4, 'factor', '発見4')`,
      ).bind(t),
    );
  }
  if (opts.actions) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO actions (tenant_id, action_id, channel_id, report_id, title, stage, metric, baseline_value,
           result_value, status, created_by, created_at, updated_at)
         VALUES (?1, 'a1', ?2, 'r2', 'サムネの文字を大きく', '流入', 'ctr', 4.0, 5.5, '実施中', ?3, ?4, ?4),
                (?1, 'a2', ?2, 'r2', '冒頭を短く', '維持', 'm1', 30, 35, '効果測定中', ?3, ?4, ?4),
                (?1, 'a3', ?2, 'r2', '完了したもの', '露出', 'impressions', NULL, NULL, '完了', ?3, ?4, ?4),
                (?1, 'a4', ?2, 'r2', '未着手のもの', '露出', 'impressions', NULL, NULL, '未着手', ?3, ?4, ?4)`,
      ).bind(t, channelId, opts.userId, now),
    );
  }
  // D1 の batch は1回あたりの文数に余裕を持たせて分割する
  for (let i = 0; i < stmts.length; i += 400) await env.DB.batch(stmts.slice(i, i + 400));
  return { channelId, videoIds: ids };
}
