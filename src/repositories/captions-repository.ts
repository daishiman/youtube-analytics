import { SCOPE_FORCE_SSL } from "../domain/google-scopes";
import type { CaptionMessage } from "../env";
import { currentLinkFrom, hasScope, isCurrentLink, linkArgs } from "./active-link";

export type CaptionAttemptStatus =
  | "reserved"
  | "listing"
  | "listed"
  | "no_track"
  | "downloading"
  | "stored"
  | "failed";

export interface CaptionAttempt {
  tenant_id: string;
  quota_date: string;
  video_id: string;
  channel_id: string;
  connected_at: string;
  token_updated_at: string;
  generation: number;
  status: CaptionAttemptStatus;
  caption_id: string | null;
  language: string | null;
  r2_key: string;
}

export interface CaptionRecord {
  video_id: string;
  channel_id: string;
  caption_id: string;
  language: string;
  r2_key: string;
  bytes: number;
  fetched_at: string;
}

/** 全D1書込の条件に埋め、通信中の OFF・解除・再連携を最後にも遮断する。 */
const captionConditions = [hasScope(SCOPE_FORCE_SSL), "t.captions_auto = 1"];
const activeConnection = currentLinkFrom(...captionConditions);

export class CaptionsRepository {
  constructor(private readonly db: D1Database) {}

  async isCurrent(message: CaptionMessage): Promise<boolean> {
    return isCurrentLink(this.db, message, ...captionConditions);
  }

  async candidates(message: Omit<CaptionMessage, "videoId">, limit: number): Promise<string[]> {
    const { results } = await this.db
      .prepare(
        `SELECT v.video_id FROM videos v
        WHERE v.tenant_id = ?1 AND v.channel_id = ?2
          AND EXISTS (SELECT 1 ${activeConnection})
          AND NOT EXISTS (SELECT 1 FROM caption_records r WHERE r.tenant_id = v.tenant_id
                          AND r.video_id = v.video_id)
          AND NOT EXISTS (SELECT 1 FROM caption_attempts a WHERE a.tenant_id = v.tenant_id
                          AND a.video_id = v.video_id AND a.quota_date = ?5)
        ORDER BY v.published_at DESC, v.video_id DESC LIMIT ?6`,
      )
      .bind(...linkArgs(message), message.quotaDate, limit)
      .all<{ video_id: string }>();
    return results.map((row) => row.video_id);
  }

  async reservedCount(tenantId: string, quotaDate: string): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM caption_attempts WHERE tenant_id = ?1 AND quota_date = ?2",
      )
      .bind(tenantId, quotaDate)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  /** SQLite の単一書込文で当日の件数・現行 OAuth・動画所属を判定して予約する。 */
  async reserve(message: CaptionMessage, now: string): Promise<CaptionAttempt | null> {
    const key = `tenants/${message.tenantId}/generations/`;
    await this.db
      .prepare(
        `INSERT INTO caption_attempts
          (tenant_id, quota_date, video_id, channel_id, connected_at, token_updated_at,
           generation, status, r2_key, created_at, updated_at)
         SELECT ?1, ?5, ?6, c.channel_id, c.connected_at, o.updated_at,
                t.import_generation, 'reserved',
                ?7 || 'g' || t.import_generation || '/captions/' || ?6 || '/' || ?5 || '.vtt',
                ?8, ?8
           ${activeConnection}
          AND EXISTS (SELECT 1 FROM videos v WHERE v.tenant_id = ?1 AND v.channel_id = ?2
                        AND v.video_id = ?6)
          AND (SELECT COUNT(*) FROM caption_attempts a
                WHERE a.tenant_id = ?1 AND a.quota_date = ?5) < 4
         ON CONFLICT (tenant_id, quota_date, video_id) DO NOTHING`,
      )
      .bind(...linkArgs(message), message.quotaDate, message.videoId, key, now)
      .run();
    return this.attempt(message);
  }

  async attempt(message: CaptionMessage): Promise<CaptionAttempt | null> {
    return this.db
      .prepare(
        `SELECT * FROM caption_attempts WHERE tenant_id = ?1 AND quota_date = ?2 AND video_id = ?3`,
      )
      .bind(message.tenantId, message.quotaDate, message.videoId)
      .first<CaptionAttempt>();
  }

  async transition(
    message: CaptionMessage,
    from: CaptionAttemptStatus,
    to: CaptionAttemptStatus,
    now: string,
    track?: { id: string; language: string },
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE caption_attempts SET status = ?7, caption_id = COALESCE(?8, caption_id),
          language = COALESCE(?9, language), updated_at = ?10
         WHERE tenant_id = ?1 AND quota_date = ?5 AND video_id = ?6
           AND channel_id = ?2 AND connected_at = ?3 AND token_updated_at = ?4
           AND status = ?11
           AND EXISTS (SELECT 1 ${activeConnection})`,
      )
      .bind(
        ...linkArgs(message),
        message.quotaDate,
        message.videoId,
        to,
        track?.id ?? null,
        track?.language ?? null,
        now,
        from,
      )
      .run();
    return result.meta.changes === 1;
  }

  async fail(message: CaptionMessage, now: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE caption_attempts SET status = 'failed', updated_at = ?4
           WHERE tenant_id = ?1 AND quota_date = ?2 AND video_id = ?3
             AND status IN ('listing', 'listed', 'downloading')`,
      )
      .bind(message.tenantId, message.quotaDate, message.videoId, now)
      .run();
  }

  /** channel cleanup は import_uploads が空になるまで完了しない。 */
  async beginUpload(
    message: CaptionMessage,
    attempt: CaptionAttempt,
    now: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO import_uploads (tenant_id, import_id, r2_key, started_at)
         SELECT ?1, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 ${activeConnection})
           AND EXISTS (SELECT 1 FROM caption_attempts a WHERE a.tenant_id = ?1
                         AND a.quota_date = ?8 AND a.video_id = ?9 AND a.status = 'downloading'
                         AND a.generation = ?10 AND a.r2_key = ?6)
         ON CONFLICT (tenant_id, import_id) DO NOTHING`,
      )
      .bind(
        ...linkArgs(message),
        this.uploadId(message),
        attempt.r2_key,
        now,
        message.quotaDate,
        message.videoId,
        attempt.generation,
      )
      .run();
    return result.meta.changes === 1;
  }

  async finishUpload(message: CaptionMessage): Promise<void> {
    await this.db
      .prepare("DELETE FROM import_uploads WHERE tenant_id = ?1 AND import_id = ?2")
      .bind(message.tenantId, this.uploadId(message))
      .run();
  }

  private uploadId(message: CaptionMessage): string {
    return `caption:${message.quotaDate}:${message.videoId}`;
  }

  async saveRecord(
    message: CaptionMessage,
    attempt: CaptionAttempt,
    bytes: number,
    now: string,
  ): Promise<boolean> {
    await this.db
      .prepare(
        `INSERT INTO caption_records
          (tenant_id, video_id, channel_id, caption_id, language, r2_key, bytes, fetched_at)
         SELECT ?1, ?6, ?2, a.caption_id, a.language, a.r2_key, ?7, ?8
           FROM caption_attempts a
          WHERE a.tenant_id = ?1 AND a.quota_date = ?5 AND a.video_id = ?6
            AND a.channel_id = ?2 AND a.connected_at = ?3 AND a.token_updated_at = ?4
            AND a.status = 'downloading' AND a.generation = ?9
            AND a.caption_id IS NOT NULL AND a.language IS NOT NULL
            AND EXISTS (SELECT 1 ${activeConnection})
            AND EXISTS (SELECT 1 FROM videos v WHERE v.tenant_id = ?1 AND v.video_id = ?6
                          AND v.channel_id = ?2)
         ON CONFLICT (tenant_id, video_id) DO NOTHING`,
      )
      .bind(
        ...linkArgs(message),
        message.quotaDate,
        message.videoId,
        bytes,
        now,
        attempt.generation,
      )
      .run();
    const row = await this.db
      .prepare("SELECT r2_key FROM caption_records WHERE tenant_id = ?1 AND video_id = ?2")
      .bind(message.tenantId, message.videoId)
      .first<{ r2_key: string }>();
    if (row?.r2_key !== attempt.r2_key) return false;
    await this.db
      .prepare(
        `UPDATE caption_attempts SET status = 'stored', updated_at = ?4
          WHERE tenant_id = ?1 AND quota_date = ?2 AND video_id = ?3
            AND status = 'downloading' AND r2_key = ?5`,
      )
      .bind(message.tenantId, message.quotaDate, message.videoId, now, attempt.r2_key)
      .run();
    return true;
  }

  async readableRecord(
    message: Pick<
      CaptionMessage,
      "tenantId" | "channelId" | "connectedAt" | "tokenUpdatedAt" | "videoId"
    >,
  ): Promise<CaptionRecord | null> {
    return this.db
      .prepare(
        `SELECT r.video_id, r.channel_id, r.caption_id, r.language, r.r2_key, r.bytes, r.fetched_at
           FROM caption_records r
          WHERE r.tenant_id = ?1 AND r.channel_id = ?2 AND r.video_id = ?5
            AND EXISTS (SELECT 1 ${activeConnection})`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        message.videoId,
      )
      .first<CaptionRecord>();
  }
}
