// Data API表示値と古いReportingジョブ定義を整理し、期限切れOAuth一時情報を消す。
// 指標テーブルとReportingの原本は別の保持規則なのでここでは触れない。
import { API_DATA_MAX_AGE_DAYS } from "../domain/data-retention";
import { DAY_MS } from "../domain/time";

export const METADATA_MAX_AGE_DAYS = API_DATA_MAX_AGE_DAYS;
export const METADATA_DELETE_BATCH = 250;

export async function purgeExpiredApiMetadata(
  db: D1Database,
  now: Date,
): Promise<{
  videos: number;
  jobs: number;
  channels: number;
  pending: number;
  remaining: boolean;
}> {
  const before = new Date(now.getTime() - METADATA_MAX_AGE_DAYS * DAY_MS).toISOString();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE videos
            SET title = '動画情報の再取得待ち', published_at = '', content_type = 'unknown',
                duration_seconds = NULL, live_broadcast_content = NULL,
                has_live_streaming_details = NULL, thumbnail_url = NULL
          WHERE rowid IN (
            SELECT rowid FROM videos
             WHERE fetched_at < ?1
               AND (title <> '動画情報の再取得待ち' OR published_at <> ''
                    OR content_type <> 'unknown' OR duration_seconds IS NOT NULL
                    OR live_broadcast_content IS NOT NULL OR has_live_streaming_details IS NOT NULL
                    OR thumbnail_url IS NOT NULL)
             ORDER BY fetched_at, rowid LIMIT ?2
          )`,
      )
      .bind(before, METADATA_DELETE_BATCH),
    db
      .prepare(
        `DELETE FROM reporting_jobs WHERE rowid IN (
           SELECT rowid FROM reporting_jobs WHERE last_seen_at < ?1
           ORDER BY last_seen_at, rowid LIMIT ?2
         )`,
      )
      .bind(before, METADATA_DELETE_BATCH),
    db
      .prepare(
        `UPDATE channels
            SET title = 'チャンネル情報の再取得待ち',
                thumbnail_url = NULL, subscriber_count = NULL
          WHERE COALESCE(metadata_fetched_at, connected_at) < ?1
            AND (title <> 'チャンネル情報の再取得待ち'
                 OR thumbnail_url IS NOT NULL OR subscriber_count IS NOT NULL)`,
      )
      .bind(before),
    db
      .prepare(
        `DELETE FROM oauth_pending WHERE rowid IN (
           SELECT rowid FROM oauth_pending WHERE expires_at <= ?1
           ORDER BY expires_at, rowid LIMIT ?2
         )`,
      )
      .bind(now.toISOString(), METADATA_DELETE_BATCH),
  ]);
  const videos = results[0]?.meta.changes ?? 0;
  const jobs = results[1]?.meta.changes ?? 0;
  const channels = results[2]?.meta.changes ?? 0;
  const pending = results[3]?.meta.changes ?? 0;
  return {
    videos,
    jobs,
    channels,
    pending,
    remaining:
      videos === METADATA_DELETE_BATCH ||
      jobs === METADATA_DELETE_BATCH ||
      pending === METADATA_DELETE_BATCH,
  };
}
