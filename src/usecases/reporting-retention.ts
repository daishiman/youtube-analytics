import { SCOPE_ANALYTICS_READONLY } from "../domain/google-scopes";
import type { Bindings } from "../env";
import { hasScope, noPendingDeletion } from "../repositories/active-link";
import { reportingAuthorizationCutoff } from "../repositories/reporting-repository";

const REPORTS_PER_PASS = 20;
const ORPHANS_PER_PASS = 20;
const STALE_UPLOADS_PER_PASS = 20;
const DERIVED_ROWS_PER_PASS = 250;
const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;

interface RawReport {
  tenant_id: string;
  channel_id: string;
  report_type_id: string;
  start_time: string;
  end_time: string;
  report_id: string;
  r2_key: string;
}

interface OrphanObject {
  tenant_id: string;
  r2_key: string;
}

interface StaleUpload extends OrphanObject {
  import_id: string;
  started_at: string;
}

/** 現在の連携世代で30日以内に Reporting API の許可を確認した場合のみ有効。 */
const validAuthorization = `EXISTS (
  SELECT 1 FROM channels c
    JOIN tenants t ON t.tenant_id = c.tenant_id
    JOIN channel_oauth_tokens tok ON tok.tenant_id = c.tenant_id AND tok.channel_id = c.channel_id
    JOIN reporting_authorizations auth ON auth.tenant_id = c.tenant_id AND auth.channel_id = c.channel_id
   WHERE c.tenant_id = r.tenant_id AND c.channel_id = r.channel_id
     AND c.status = '正常' AND t.deleted_at IS NULL
     AND c.connected_at = auth.connected_at AND tok.updated_at = auth.token_updated_at
     AND tok.refresh_token_enc IS NOT NULL
     AND ${hasScope(SCOPE_ANALYTICS_READONLY, "tok")}
     AND auth.revoked_at IS NULL AND auth.verified_at > ?1
     AND ${noPendingDeletion("r.tenant_id")}
)`;

export interface ReportingRetentionResult {
  rawDeleted: number;
  orphansDeleted: number;
  uploadsCleared: number;
  /** Queue consumer は true のとき次の cleanup 通を送る。Cron からも再入できる。 */
  remaining: boolean;
}

/** R2 を先に消し、同じキーの行だけ D1 から消す。失敗は Queue 再試行へ伝える。 */
export async function purgeReportingRetention(
  env: Pick<Bindings, "DB" | "MEDIA">,
  now: Date,
): Promise<ReportingRetentionResult> {
  const cutoff = reportingAuthorizationCutoff(now);
  const staleUploadBefore = new Date(now.getTime() - STALE_UPLOAD_MS).toISOString();
  const db = env.DB;
  const rawRows = await db
    .prepare(
      `SELECT r.tenant_id, r.channel_id, r.report_type_id, r.start_time, r.end_time,
              r.report_id, r.r2_key
         FROM reporting_raw_reports r
        WHERE NOT ${validAuthorization}
        ORDER BY r.stored_at, r.tenant_id LIMIT ${REPORTS_PER_PASS}`,
    )
    .bind(cutoff)
    .all<RawReport>();
  let rawDeleted = 0;
  for (const raw of rawRows.results) {
    // この通の途中で再認可された場合、次の同期で欠けた指標を原本から再正規化できる。
    await db
      .prepare(
        `UPDATE reporting_raw_reports SET normalized_at = NULL
          WHERE tenant_id = ?1 AND channel_id = ?2 AND report_type_id = ?3
            AND start_time = ?4 AND end_time = ?5 AND r2_key = ?6`,
      )
      .bind(
        raw.tenant_id,
        raw.channel_id,
        raw.report_type_id,
        raw.start_time,
        raw.end_time,
        raw.r2_key,
      )
      .run();
    // 原本由来の指標も同じ認可で保持する。大きいレポートは少量ずつ消す。
    await db
      .prepare(
        `DELETE FROM video_reach_daily WHERE rowid IN (
          SELECT rowid FROM video_reach_daily
           WHERE tenant_id = ?1 AND report_id = ?2 LIMIT ${DERIVED_ROWS_PER_PASS}
        )`,
      )
      .bind(raw.tenant_id, raw.report_id)
      .run();
    const derivedRemaining = await db
      .prepare(
        "SELECT 1 AS present FROM video_reach_daily WHERE tenant_id = ?1 AND report_id = ?2 LIMIT 1",
      )
      .bind(raw.tenant_id, raw.report_id)
      .first<{ present: number }>();
    if (derivedRemaining) continue;
    await db
      .prepare(
        "DELETE FROM reporting_reach_stage WHERE tenant_id = ?1 AND channel_id = ?2 AND report_id = ?3",
      )
      .bind(raw.tenant_id, raw.channel_id, raw.report_id)
      .run();
    await env.MEDIA.delete(raw.r2_key);
    const result = await db
      .prepare(
        `DELETE FROM reporting_raw_reports
          WHERE tenant_id = ?1 AND channel_id = ?2 AND report_type_id = ?3
            AND start_time = ?4 AND end_time = ?5 AND r2_key = ?6`,
      )
      .bind(
        raw.tenant_id,
        raw.channel_id,
        raw.report_type_id,
        raw.start_time,
        raw.end_time,
        raw.r2_key,
      )
      .run();
    rawDeleted += result.meta.changes;
  }

  const orphans = await db
    .prepare(
      `SELECT o.tenant_id, o.r2_key FROM reporting_orphan_objects o
        WHERE NOT EXISTS (
          SELECT 1 FROM reporting_raw_reports r
           WHERE r.tenant_id = o.tenant_id AND r.r2_key = o.r2_key
        )
        ORDER BY o.created_at, o.tenant_id LIMIT ${ORPHANS_PER_PASS}`,
    )
    .all<OrphanObject>();
  let orphansDeleted = 0;
  for (const orphan of orphans.results) {
    await env.MEDIA.delete(orphan.r2_key);
    const result = await db
      .prepare(
        `DELETE FROM reporting_orphan_objects
          WHERE tenant_id = ?1 AND r2_key = ?2
            AND NOT EXISTS (
              SELECT 1 FROM reporting_raw_reports r
               WHERE r.tenant_id = ?1 AND r.r2_key = ?2
            )`,
      )
      .bind(orphan.tenant_id, orphan.r2_key)
      .run();
    orphansDeleted += result.meta.changes;
  }

  const uploads = await db
    .prepare(
      `SELECT tenant_id, import_id, r2_key, started_at FROM import_uploads
        WHERE instr(r2_key, '/reporting/') > 0 AND started_at <= ?1
        ORDER BY started_at, tenant_id LIMIT ${STALE_UPLOADS_PER_PASS}`,
    )
    .bind(staleUploadBefore)
    .all<StaleUpload>();
  let uploadsCleared = 0;
  for (const upload of uploads.results) {
    const live = await db
      .prepare(
        "SELECT 1 AS present FROM reporting_raw_reports WHERE tenant_id = ?1 AND r2_key = ?2 LIMIT 1",
      )
      .bind(upload.tenant_id, upload.r2_key)
      .first<{ present: number }>();
    if (!live) await env.MEDIA.delete(upload.r2_key);
    const result = await db
      .prepare(
        `DELETE FROM import_uploads
          WHERE tenant_id = ?1 AND import_id = ?2 AND r2_key = ?3 AND started_at = ?4`,
      )
      .bind(upload.tenant_id, upload.import_id, upload.r2_key, upload.started_at)
      .run();
    uploadsCleared += result.meta.changes;
  }

  const [moreRaw, moreOrphans, moreUploads] = await Promise.all([
    db
      .prepare(
        `SELECT 1 AS present FROM reporting_raw_reports r WHERE NOT ${validAuthorization} LIMIT 1`,
      )
      .bind(cutoff)
      .first<{ present: number }>(),
    db
      .prepare(
        `SELECT 1 AS present FROM reporting_orphan_objects o
          WHERE NOT EXISTS (
            SELECT 1 FROM reporting_raw_reports r
             WHERE r.tenant_id = o.tenant_id AND r.r2_key = o.r2_key
          ) LIMIT 1`,
      )
      .first<{ present: number }>(),
    db
      .prepare(
        "SELECT 1 AS present FROM import_uploads WHERE instr(r2_key, '/reporting/') > 0 AND started_at <= ?1 LIMIT 1",
      )
      .bind(staleUploadBefore)
      .first<{ present: number }>(),
  ]);
  return {
    rawDeleted,
    orphansDeleted,
    uploadsCleared,
    remaining: Boolean(moreRaw || moreOrphans || moreUploads),
  };
}
