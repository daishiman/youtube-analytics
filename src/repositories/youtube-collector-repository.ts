import type { DiscoveredVideo } from "../adapters/google-data-videos";
import { API_DATA_REFRESH_DAYS } from "../domain/data-retention";
import { READONLY_SCOPES } from "../domain/google-scopes";
import { DAY_MS } from "../domain/time";
import type { CollectMessage, LinkGeneration } from "../env";
import { currentLinkFrom, noPendingDeletion } from "./active-link";

type CollectionFailureMessage = LinkGeneration &
  (
    | { kind: "collect" | "reporting"; reportKey?: never }
    | { kind: "analytics-dimensions"; reportKey: string }
  );

export interface ChannelDailyRow {
  date: string;
  views: number;
  estimatedMinutesWatched: number;
  subscribersGained: number;
  subscribersLost: number;
}

export interface VideoDailyRow {
  videoId: string;
  date: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewPercentage: number | null;
}

interface ActiveConnection {
  tenant_id: string;
  channel_id: string;
  connected_at: string;
  token_updated_at: string;
  granted_scopes: string;
}

function hasScopes(scopes: string): boolean {
  const granted = new Set(scopes.split(" ").filter(Boolean));
  return READONLY_SCOPES.every((scope) => granted.has(scope));
}

const allowedConnection = currentLinkFrom();

/** チャンネル管理（テナント）の境界と OAuth 連携世代を D1 で確認してから収集する。 */
export class YoutubeCollectorRepository {
  constructor(private readonly db: D1Database) {}

  async listActiveConnections(): Promise<CollectMessage[]> {
    const { results } = await this.db
      .prepare(
        `SELECT c.tenant_id, c.channel_id, c.connected_at,
                o.updated_at AS token_updated_at, o.granted_scopes
           FROM channels c
           JOIN tenants t ON t.tenant_id = c.tenant_id
           JOIN channel_oauth_tokens o ON o.tenant_id = c.tenant_id AND o.channel_id = c.channel_id
          WHERE t.deleted_at IS NULL AND c.status = '正常' AND o.refresh_token_enc IS NOT NULL
            AND ${noPendingDeletion("c.tenant_id")}
          ORDER BY c.tenant_id`,
      )
      .all<ActiveConnection>();
    return results
      .filter((row) => hasScopes(row.granted_scopes))
      .map((row) => ({
        kind: "collect",
        tenantId: row.tenant_id,
        channelId: row.channel_id,
        connectedAt: row.connected_at,
        tokenUpdatedAt: row.token_updated_at,
      }));
  }

  /** Queue 予算の見積もり用。権限（scope）の不足は数え分けないので listActiveConnections 以上になる */
  async countActiveConnections(): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS n
           FROM channels c
           JOIN tenants t ON t.tenant_id = c.tenant_id
           JOIN channel_oauth_tokens o ON o.tenant_id = c.tenant_id AND o.channel_id = c.channel_id
          WHERE t.deleted_at IS NULL AND c.status = '正常' AND o.refresh_token_enc IS NOT NULL
            AND ${noPendingDeletion("c.tenant_id")}`,
      )
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async isCurrent(message: CollectMessage): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT o.granted_scopes ${allowedConnection}`)
      .bind(message.tenantId, message.channelId, message.connectedAt, message.tokenUpdatedAt)
      .first<{ granted_scopes: string }>();
    return row !== null && hasScopes(row.granted_scopes);
  }

  /** 日次チャンネル行を保存。動画全ページが終わるまで収集完了日時は進めない。 */
  async saveDaily(message: CollectMessage, rows: ChannelDailyRow[], now: string): Promise<void> {
    if (!rows.length) return;
    await this.db
      .prepare(
        `INSERT INTO daily_metrics
             (tenant_id, channel_id, date, content_type, views, estimated_minutes_watched,
              subscribers_gained, subscribers_lost, fetched_at)
           SELECT ?1, ?2, json_extract(j.value, '$.date'), 'all',
                  json_extract(j.value, '$.views'),
                  json_extract(j.value, '$.estimatedMinutesWatched'),
                  json_extract(j.value, '$.subscribersGained'),
                  json_extract(j.value, '$.subscribersLost'), ?6
             FROM json_each(?5) j
            WHERE EXISTS (SELECT 1 ${allowedConnection})
           ON CONFLICT (tenant_id, channel_id, date, content_type) DO UPDATE SET
             views = excluded.views,
             estimated_minutes_watched = excluded.estimated_minutes_watched,
             subscribers_gained = excluded.subscribers_gained,
             subscribers_lost = excluded.subscribers_lost,
             fetched_at = excluded.fetched_at
           WHERE daily_metrics.views IS NOT excluded.views
              OR daily_metrics.estimated_minutes_watched IS NOT excluded.estimated_minutes_watched
              OR daily_metrics.subscribers_gained IS NOT excluded.subscribers_gained
              OR daily_metrics.subscribers_lost IS NOT excluded.subscribers_lost`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        JSON.stringify(rows),
        now,
      )
      .run();
  }

  /** 同じchannels.list応答の表示情報だけを更新。旧連携世代の通は効果なし。 */
  async saveChannelMetadata(
    message: CollectMessage,
    metadata: { title: string; thumbnailUrl: string | null; subscriberCount: number | null },
    now: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE channels SET title = ?5, thumbnail_url = ?6, subscriber_count = ?7,
                             metadata_fetched_at = ?8
          WHERE tenant_id = ?1 AND channel_id = ?2 AND connected_at = ?3
            AND EXISTS (SELECT 1 ${allowedConnection})
            AND (metadata_fetched_at IS NULL OR metadata_fetched_at <= ?8)`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        metadata.title,
        metadata.thumbnailUrl,
        metadata.subscriberCount,
        now,
      )
      .run();
  }

  /** Data API が返した動画のみ保存。既存の shorts 確定値は unknown 推定で上書きしない。 */
  async saveVideos(message: CollectMessage, videos: DiscoveredVideo[], now: string): Promise<void> {
    if (!videos.length) return;
    await this.db
      .prepare(
        `INSERT INTO videos
                (tenant_id, video_id, channel_id, title, published_at, content_type,
                 duration_seconds, live_broadcast_content, has_live_streaming_details,
                 thumbnail_url, fetched_at)
               SELECT ?1, json_extract(j.value, '$.videoId'), ?2,
                      json_extract(j.value, '$.title'),
                      json_extract(j.value, '$.publishedAt'),
                      json_extract(j.value, '$.contentType'),
                      json_extract(j.value, '$.durationSeconds'),
                      json_extract(j.value, '$.liveBroadcastContent'),
                      json_extract(j.value, '$.hasLiveStreamingDetails'),
                      json_extract(j.value, '$.thumbnailUrl'), ?6
                 FROM json_each(?5) j
                WHERE EXISTS (SELECT 1 ${allowedConnection})
               ON CONFLICT (tenant_id, video_id) DO UPDATE SET
                 title = excluded.title,
                 published_at = excluded.published_at,
                 content_type = CASE
                   WHEN videos.content_type = 'shorts' AND excluded.content_type = 'unknown'
                   THEN 'shorts' ELSE excluded.content_type END,
                 duration_seconds = excluded.duration_seconds,
                 live_broadcast_content = excluded.live_broadcast_content,
                 has_live_streaming_details = excluded.has_live_streaming_details,
                 thumbnail_url = excluded.thumbnail_url,
                 fetched_at = excluded.fetched_at
               WHERE videos.channel_id = excluded.channel_id
                 AND (
                   videos.title IS NOT excluded.title
                   OR videos.published_at IS NOT excluded.published_at
                   OR (videos.content_type IS NOT excluded.content_type
                       AND NOT (videos.content_type = 'shorts' AND excluded.content_type = 'unknown'))
                   OR videos.duration_seconds IS NOT excluded.duration_seconds
                   OR videos.live_broadcast_content IS NOT excluded.live_broadcast_content
                   OR videos.has_live_streaming_details IS NOT excluded.has_live_streaming_details
                   OR videos.thumbnail_url IS NOT excluded.thumbnail_url
                   OR videos.fetched_at < ?7
                 )`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        JSON.stringify(videos),
        now,
        new Date(Date.parse(now) - API_DATA_REFRESH_DAYS * DAY_MS).toISOString(),
      )
      .run();
  }

  /** API が返さない動画/日には行を作らない。保存前に世代と動画の所有チャンネルを D1 で照合する。 */
  async saveVideoDaily(message: CollectMessage, rows: VideoDailyRow[], now: string): Promise<void> {
    if (!rows.length) return;
    // Free Workers の D1 上限50クエリ/実行を超えないよう、250行を JSON1 で1クエリにまとめる。
    for (let offset = 0; offset < rows.length; offset += 250) {
      await this.db
        .prepare(
          `INSERT INTO video_metrics
                (tenant_id, video_id, date, views, estimated_minutes_watched,
                 average_view_percentage, fetched_at)
               SELECT ?1, json_extract(j.value, '$.videoId'),
                      json_extract(j.value, '$.date'),
                      json_extract(j.value, '$.views'),
                      json_extract(j.value, '$.estimatedMinutesWatched'),
                      json_extract(j.value, '$.averageViewPercentage'), ?6
                 FROM json_each(?5) j
                WHERE EXISTS (SELECT 1 ${allowedConnection})
                  AND EXISTS (
                   SELECT 1 FROM videos v WHERE v.tenant_id = ?1
                     AND v.video_id = json_extract(j.value, '$.videoId') AND v.channel_id = ?2
                 )
               ON CONFLICT (tenant_id, video_id, date) DO UPDATE SET
                 views = excluded.views,
                 estimated_minutes_watched = excluded.estimated_minutes_watched,
                 average_view_percentage = excluded.average_view_percentage,
                 fetched_at = excluded.fetched_at
               WHERE video_metrics.views IS NOT excluded.views
                  OR video_metrics.estimated_minutes_watched IS NOT excluded.estimated_minutes_watched
                  OR video_metrics.average_view_percentage IS NOT excluded.average_view_percentage`,
        )
        .bind(
          message.tenantId,
          message.channelId,
          message.connectedAt,
          message.tokenUpdatedAt,
          JSON.stringify(rows.slice(offset, offset + 250)),
          now,
        )
        .run();
    }
  }

  /** 全 uploads ページ成功後だけ更新。世代違い・削除予約中なら効果なし。 */
  async markCompleted(message: CollectMessage, now: string): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE channels SET last_collected_at = ?5
          WHERE tenant_id = ?1 AND channel_id = ?2 AND connected_at = ?3
            AND EXISTS (SELECT 1 ${allowedConnection})
            AND NOT EXISTS (
              SELECT 1 FROM collection_series_status s
               WHERE s.tenant_id = ?1 AND s.kind = 'collect' AND s.report_key = ''
                 AND s.channel_id = ?2 AND s.connected_at = ?3 AND s.token_updated_at = ?4
                 AND s.cycle_started_at > ?6
            )`,
        )
        .bind(
          message.tenantId,
          message.channelId,
          message.connectedAt,
          message.tokenUpdatedAt,
          now,
          message.cycleStartedAt ?? message.connectedAt,
        ),
      this.statusStatement(message, "ok", now),
    ]);
  }

  private statusStatement(
    message: CollectionFailureMessage,
    status: "ok" | "failed",
    now: string,
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO collection_series_status
          (tenant_id, kind, report_key, channel_id, connected_at, token_updated_at,
           cycle_started_at, status, changed_at)
          SELECT ?1, ?5, ?6, ?2, ?3, ?4, ?7, ?8, ?9
           WHERE EXISTS (SELECT 1 ${allowedConnection})
          ON CONFLICT (tenant_id, kind, report_key) DO UPDATE SET
            channel_id = excluded.channel_id,
            connected_at = excluded.connected_at,
            token_updated_at = excluded.token_updated_at,
            cycle_started_at = excluded.cycle_started_at,
            status = excluded.status,
            changed_at = excluded.changed_at
          WHERE collection_series_status.channel_id IS NOT excluded.channel_id
             OR collection_series_status.connected_at IS NOT excluded.connected_at
             OR collection_series_status.token_updated_at IS NOT excluded.token_updated_at
             OR excluded.cycle_started_at > collection_series_status.cycle_started_at
             OR (excluded.cycle_started_at = collection_series_status.cycle_started_at
                 AND (excluded.status = 'ok' OR collection_series_status.status = 'failed'))`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        message.kind,
        message.kind === "analytics-dimensions" ? message.reportKey : "",
        message.cycleStartedAt ?? message.connectedAt,
        status,
        now,
      );
  }

  /** 現行連携の完了した系列だけ失敗を解除する。 */
  async clearFailure(message: CollectionFailureMessage, now: string): Promise<void> {
    await this.statusStatement(message, "ok", now).run();
  }

  /** 失敗を現行 OAuth 連携の該当系列だけ記録する。古い Queue 通は効果なし。 */
  async markFailed(message: CollectionFailureMessage, now: string): Promise<void> {
    await this.statusStatement(message, "failed", now).run();
  }
}
