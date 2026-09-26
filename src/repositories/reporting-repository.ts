import type { ReportingJob, ReportingReport } from "../adapters/google-reporting-jobs";
import { API_DATA_MAX_AGE_MS } from "../domain/data-retention";
import { SCOPE_ANALYTICS_READONLY } from "../domain/google-scopes";
import type { CollectMessage, LinkIdentity } from "../env";
import { currentLinkFrom, hasScope, linkArgs, noPendingDeletion } from "./active-link";

export type ReportingIdentity = LinkIdentity;

export interface StoredReportingReport {
  createTime: string;
  r2Key: string;
  reportId: string;
  normalizedAt: string | null;
}

export interface ReportingReportListing {
  reportId: string;
  reportTypeId: string;
  reportTypeVersion: string | null;
  startTime: string;
  endTime: string;
  createTime: string;
  header: string[];
  rowCount: number;
  byteCount: number;
  storedAt: string;
  normalizedAt: string | null;
}

/** GET /api/data/reporting-sync の集計 */
export interface ReportingSyncSummary {
  jobs: number;
  reports: number;
  lastStoredAt: string | null;
}

/** GET /api/data/reporting-reports の1ページ */
export interface ReportingReportsResponse {
  reports: ReportingReportListing[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReachStageRow {
  date: string;
  videoId: string;
  impressions: number | null;
  ctr: number | null;
}

/** Reporting の許可は OAuth 世代に紐付く。古い世代の確認は再連携後に流用しない。 */
export const REPORTING_AUTHORIZATION_MAX_AGE_MS = API_DATA_MAX_AGE_MS;

export function reportingAuthorizationCutoff(now: Date): string {
  return new Date(now.getTime() - REPORTING_AUTHORIZATION_MAX_AGE_MS).toISOString();
}

const analyticsLink = currentLinkFrom(hasScope(SCOPE_ANALYTICS_READONLY));
/** ?5 = 取込世代。世代が変わった後の書込も止める */
const allowedConnection = currentLinkFrom(
  "t.import_generation = ?5",
  hasScope(SCOPE_ANALYTICS_READONLY),
);

export class ReportingRepository {
  constructor(private readonly db: D1Database) {}

  async currentMessage(tenantId: string): Promise<CollectMessage | null> {
    const row = await this.db
      .prepare(
        `SELECT c.channel_id, c.connected_at, o.updated_at AS token_updated_at
         FROM channels c
         JOIN tenants t ON t.tenant_id = c.tenant_id
         JOIN channel_oauth_tokens o ON o.tenant_id = c.tenant_id AND o.channel_id = c.channel_id
        WHERE c.tenant_id = ?1 AND c.status = '正常' AND t.deleted_at IS NULL
          AND o.refresh_token_enc IS NOT NULL
          AND ${hasScope(SCOPE_ANALYTICS_READONLY)}
          AND ${noPendingDeletion("c.tenant_id")} LIMIT 1`,
      )
      .bind(tenantId)
      .first<{ channel_id: string; connected_at: string; token_updated_at: string }>();
    return row
      ? {
          kind: "collect",
          tenantId,
          channelId: row.channel_id,
          connectedAt: row.connected_at,
          tokenUpdatedAt: row.token_updated_at,
        }
      : null;
  }

  async generation(message: ReportingIdentity): Promise<number | null> {
    const row = await this.db
      .prepare(`SELECT t.import_generation AS generation ${analyticsLink}`)
      .bind(...linkArgs(message))
      .first<{ generation: number }>();
    return row?.generation ?? null;
  }

  async isCurrent(message: ReportingIdentity, generation: number): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT 1 AS ok ${allowedConnection} LIMIT 1`)
      .bind(...linkArgs(message), generation)
      .first<{ ok: number }>();
    return row !== null;
  }

  async recordAuthorization(
    message: ReportingIdentity,
    generation: number,
    now: string,
    revoked: boolean,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO reporting_authorizations
          (tenant_id, channel_id, connected_at, token_updated_at, verified_at, revoked_at)
         SELECT ?1, ?2, ?3, ?4, ?6, ?7 ${allowedConnection}
         ON CONFLICT (tenant_id, channel_id) DO UPDATE SET
           connected_at = excluded.connected_at,
           token_updated_at = excluded.token_updated_at,
           verified_at = excluded.verified_at,
           revoked_at = excluded.revoked_at`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        generation,
        revoked ? null : now,
        revoked ? now : null,
      )
      .run();
    return result.meta.changes === 1;
  }

  /** 原本キーを登録し、現行行から参照されなくなったら掃除できるようにする。 */
  async trackOrphan(tenantId: string, key: string, now: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO reporting_orphan_objects (tenant_id, r2_key, created_at)
         VALUES (?1, ?2, ?3)`,
      )
      .bind(tenantId, key, now)
      .run();
  }

  async forgetOrphan(tenantId: string, key: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM reporting_orphan_objects WHERE tenant_id = ?1 AND r2_key = ?2")
      .bind(tenantId, key)
      .run();
  }

  async saveJob(
    message: ReportingIdentity,
    generation: number,
    job: ReportingJob,
    now: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO reporting_jobs
         (tenant_id, channel_id, job_id, report_type_id, name, system_managed, job_created_at, last_seen_at)
       SELECT ?1, ?2, ?6, ?7, ?8, ?9, ?10, ?11 ${allowedConnection}
       ON CONFLICT (tenant_id, channel_id, job_id) DO UPDATE SET
         report_type_id = excluded.report_type_id,
         name = excluded.name,
         system_managed = excluded.system_managed,
         job_created_at = excluded.job_created_at,
         last_seen_at = excluded.last_seen_at`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        generation,
        job.id,
        job.reportTypeId,
        job.name,
        job.systemManaged ? 1 : 0,
        job.createTime,
        now,
      )
      .run();
    return result.meta.changes > 0;
  }

  async existing(
    message: ReportingIdentity,
    reportTypeId: string,
    report: ReportingReport,
  ): Promise<StoredReportingReport | null> {
    const row = await this.db
      .prepare(
        `SELECT create_time, r2_key, report_id, normalized_at FROM reporting_raw_reports
       WHERE tenant_id = ?1 AND channel_id = ?2 AND report_type_id = ?3
         AND start_time = ?4 AND end_time = ?5`,
      )
      .bind(message.tenantId, message.channelId, reportTypeId, report.startTime, report.endTime)
      .first<{
        create_time: string;
        r2_key: string;
        report_id: string;
        normalized_at: string | null;
      }>();
    return row
      ? {
          createTime: row.create_time,
          r2Key: row.r2_key,
          reportId: row.report_id,
          normalizedAt: row.normalized_at,
        }
      : null;
  }

  /** 種類ごとの保存済み原本で最も新しい create_time。Reporting 取得位置の基準にする */
  async latestCreateTime(message: ReportingIdentity, reportTypeId: string): Promise<string | null> {
    const row = await this.db
      .prepare(
        `SELECT MAX(create_time) AS latest FROM reporting_raw_reports
       WHERE tenant_id = ?1 AND channel_id = ?2 AND report_type_id = ?3 AND status = 'stored'`,
      )
      .bind(message.tenantId, message.channelId, reportTypeId)
      .first<{ latest: string | null }>();
    return row?.latest ?? null;
  }

  async beginUpload(
    message: ReportingIdentity,
    generation: number,
    uploadId: string,
    key: string,
    now: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO import_uploads (tenant_id, import_id, r2_key, started_at)
       SELECT ?1, ?6, ?7, ?8 ${allowedConnection}`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        generation,
        uploadId,
        key,
        now,
      )
      .run();
    return result.meta.changes === 1;
  }

  async finishUpload(message: ReportingIdentity, uploadId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM import_uploads WHERE tenant_id = ?1 AND import_id = ?2")
      .bind(message.tenantId, uploadId)
      .run();
  }

  async saveReport(input: {
    message: ReportingIdentity;
    generation: number;
    reportTypeId: string;
    report: ReportingReport;
    header: string[];
    rowCount: number;
    byteCount: number;
    r2Key: string;
    now: string;
  }): Promise<boolean> {
    const { message, generation, reportTypeId, report, header, rowCount, byteCount, r2Key, now } =
      input;
    const version = reportTypeId.match(/_([a-z]\d+)$/)?.[1] ?? null;
    const result = await this.db
      .prepare(
        `INSERT INTO reporting_raw_reports
         (tenant_id, channel_id, report_type_id, report_type_version, job_id, report_id,
          start_time, end_time, create_time, header_json, row_count, byte_count, r2_key, status, stored_at)
       SELECT ?1, ?2, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 'stored', ?17
         ${allowedConnection}
       ON CONFLICT (tenant_id, channel_id, report_type_id, start_time, end_time)
       DO UPDATE SET
         report_type_version = excluded.report_type_version,
         job_id = excluded.job_id,
         report_id = excluded.report_id,
         create_time = excluded.create_time,
         header_json = excluded.header_json,
         row_count = excluded.row_count,
         byte_count = excluded.byte_count,
         r2_key = excluded.r2_key,
         status = excluded.status,
         stored_at = excluded.stored_at,
         normalized_at = NULL
       WHERE excluded.create_time > reporting_raw_reports.create_time`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        generation,
        reportTypeId,
        version,
        report.jobId,
        report.id,
        report.startTime,
        report.endTime,
        report.createTime,
        JSON.stringify(header),
        rowCount,
        byteCount,
        r2Key,
        now,
      )
      .run();
    return result.meta.changes === 1;
  }

  async resetReachStage(
    message: ReportingIdentity,
    generation: number,
    reportId: string,
  ): Promise<boolean> {
    if (!(await this.isCurrent(message, generation))) return false;
    await this.db
      .prepare(
        `DELETE FROM reporting_reach_stage
        WHERE tenant_id = ?1 AND channel_id = ?2 AND report_id = ?6
          AND EXISTS (SELECT 1 ${allowedConnection})`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        generation,
        reportId,
      )
      .run();
    return this.isCurrent(message, generation);
  }

  async stageReachRows(
    message: ReportingIdentity,
    generation: number,
    reportId: string,
    rows: ReachStageRow[],
  ): Promise<boolean> {
    if (!rows.length) return true;
    const result = await this.db
      .prepare(
        `INSERT INTO reporting_reach_stage
         (tenant_id, channel_id, report_id, date, video_id,
          video_thumbnail_impressions, video_thumbnail_impressions_ctr)
       SELECT ?1, ?2, ?6,
         json_extract(j.value, '$.date'), json_extract(j.value, '$.videoId'),
         json_extract(j.value, '$.impressions'), json_extract(j.value, '$.ctr')
         FROM json_each(?7) j
        WHERE EXISTS (SELECT 1 ${allowedConnection})`,
      )
      .bind(
        message.tenantId,
        message.channelId,
        message.connectedAt,
        message.tokenUpdatedAt,
        generation,
        reportId,
        JSON.stringify(rows),
      )
      .run();
    return result.meta.changes === rows.length;
  }

  /** ステージ完了後だけ1 batchで旧日付を消し、新行を入れ、正規化完了を刻む。 */
  async commitReach(input: {
    message: ReportingIdentity;
    generation: number;
    reportId: string;
    reportDate: string;
    createTime: string;
    now: string;
  }): Promise<boolean> {
    const { message, generation, reportId, reportDate, createTime, now } = input;
    const currentRaw = `EXISTS (
      SELECT 1 FROM reporting_raw_reports rr
       WHERE rr.tenant_id = ?1 AND rr.channel_id = ?2 AND rr.report_id = ?6
         AND rr.report_type_id = 'channel_reach_basic_a1'
         AND rr.create_time = ?8 AND rr.normalized_at IS NULL
    )`;
    const args = [
      message.tenantId,
      message.channelId,
      message.connectedAt,
      message.tokenUpdatedAt,
      generation,
      reportId,
      reportDate,
      createTime,
      now,
    ];
    const result = await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM video_reach_daily WHERE tenant_id = ?1 AND date = ?7
          AND EXISTS (SELECT 1 ${allowedConnection}) AND ${currentRaw}`,
        )
        .bind(...args.slice(0, 8)),
      this.db
        .prepare(
          `INSERT INTO video_reach_daily
          (tenant_id, video_id, date, video_thumbnail_impressions,
           video_thumbnail_impressions_ctr, report_id, fetched_at)
         SELECT ?1, s.video_id, s.date, s.video_thumbnail_impressions,
           s.video_thumbnail_impressions_ctr, ?6, ?9
           FROM reporting_reach_stage s
          WHERE s.tenant_id = ?1 AND s.channel_id = ?2 AND s.report_id = ?6 AND s.date = ?7
            AND EXISTS (SELECT 1 ${allowedConnection}) AND ${currentRaw}`,
        )
        .bind(...args),
      this.db
        .prepare(
          `UPDATE reporting_raw_reports SET normalized_at = ?9
          WHERE tenant_id = ?1 AND channel_id = ?2 AND report_id = ?6
            AND report_type_id = 'channel_reach_basic_a1' AND create_time = ?8
            AND normalized_at IS NULL AND EXISTS (SELECT 1 ${allowedConnection})`,
        )
        .bind(...args),
      this.db
        .prepare(
          `DELETE FROM reporting_reach_stage WHERE tenant_id = ?1 AND channel_id = ?2 AND report_id = ?6`,
        )
        .bind(...args.slice(0, 6)),
    ]);
    return result[2]?.meta.changes === 1;
  }

  async summary(tenantId: string, now: Date = new Date()): Promise<ReportingSyncSummary> {
    const [jobs, reports] = await Promise.all([
      this.db
        .prepare("SELECT COUNT(*) AS n FROM reporting_jobs WHERE tenant_id = ?1")
        .bind(tenantId)
        .first<{ n: number }>(),
      this.db
        .prepare(`SELECT COUNT(*) AS n, MAX(r.stored_at) AS last_at ${this.readableReports()}`)
        .bind(tenantId, reportingAuthorizationCutoff(now))
        .first<{ n: number; last_at: string | null }>(),
    ]);
    return { jobs: jobs?.n ?? 0, reports: reports?.n ?? 0, lastStoredAt: reports?.last_at ?? null };
  }

  private readableReports(): string {
    return `FROM reporting_raw_reports r
      JOIN channels c ON c.tenant_id = r.tenant_id AND c.channel_id = r.channel_id
      JOIN tenants t ON t.tenant_id = r.tenant_id
      JOIN channel_oauth_tokens o ON o.tenant_id = c.tenant_id AND o.channel_id = c.channel_id
      JOIN reporting_authorizations a ON a.tenant_id = c.tenant_id AND a.channel_id = c.channel_id
      WHERE r.tenant_id = ?1 AND c.status = '正常' AND t.deleted_at IS NULL
        AND c.connected_at = a.connected_at AND o.updated_at = a.token_updated_at
        AND o.refresh_token_enc IS NOT NULL
        AND ${hasScope(SCOPE_ANALYTICS_READONLY)}
        AND a.revoked_at IS NULL AND a.verified_at > ?2
        AND ${noPendingDeletion("r.tenant_id")}`;
  }

  async listStoredReports(
    tenantId: string,
    page: number,
    now: Date = new Date(),
  ): Promise<ReportingReportsResponse> {
    const pageSize = 100;
    const [count, rows] = await Promise.all([
      this.db
        .prepare(`SELECT COUNT(*) AS n ${this.readableReports()}`)
        .bind(tenantId, reportingAuthorizationCutoff(now))
        .first<{ n: number }>(),
      this.db
        .prepare(
          `SELECT r.report_id, r.report_type_id, r.report_type_version, r.start_time, r.end_time,
                r.create_time, r.header_json, r.row_count, r.byte_count, r.stored_at, r.normalized_at
           ${this.readableReports()}
          ORDER BY r.create_time DESC, r.report_id DESC LIMIT ?3 OFFSET ?4`,
        )
        .bind(tenantId, reportingAuthorizationCutoff(now), pageSize, page * pageSize)
        .all<{
          report_id: string;
          report_type_id: string;
          report_type_version: string | null;
          start_time: string;
          end_time: string;
          create_time: string;
          header_json: string;
          row_count: number;
          byte_count: number;
          stored_at: string;
          normalized_at: string | null;
        }>(),
    ]);
    return {
      reports: rows.results.map((row) => ({
        reportId: row.report_id,
        reportTypeId: row.report_type_id,
        reportTypeVersion: row.report_type_version,
        startTime: row.start_time,
        endTime: row.end_time,
        createTime: row.create_time,
        header: JSON.parse(row.header_json) as string[],
        rowCount: row.row_count,
        byteCount: row.byte_count,
        storedAt: row.stored_at,
        normalizedAt: row.normalized_at,
      })),
      total: count?.n ?? 0,
      page,
      pageSize,
    };
  }

  async rawReportKey(
    tenantId: string,
    reportId: string,
    now: Date = new Date(),
  ): Promise<string | null> {
    const row = await this.db
      .prepare(`SELECT r.r2_key ${this.readableReports()} AND r.report_id = ?3 LIMIT 1`)
      .bind(tenantId, reportingAuthorizationCutoff(now), reportId)
      .first<{ r2_key: string }>();
    return row?.r2_key ?? null;
  }
}
