import type {
  AnalyticsDimensionKey,
  AnalyticsRawReport,
} from "../adapters/google-analytics-dimensions";
import { SCOPE_ANALYTICS_READONLY, SCOPE_YOUTUBE_READONLY } from "../domain/google-scopes";
import type { AnalyticsDimensionsMessage } from "../env";
import { currentLinkFrom, hasScope, isCurrentLink, noPendingDeletion } from "./active-link";

interface StoredReport {
  report_key: AnalyticsDimensionKey;
  period_start: string;
  period_end: string;
  availability: AnalyticsRawReport["availability"];
  column_headers_json: string;
  row_count: number;
  fetched_at: string;
}

export interface AnalyticsReportView {
  reportKey: AnalyticsDimensionKey;
  periodStart: string;
  periodEnd: string;
  fetchedAt: string;
  availability: AnalyticsRawReport["availability"];
  columnHeaders: Record<string, unknown>[];
  rows: unknown[][];
  rowCount: number;
  hasMore: boolean;
  source: "youtube_analytics_api";
}

export interface AnalyticsReportRowsPage {
  reportKey: AnalyticsDimensionKey;
  offset: number;
  limit: number;
  rowCount: number;
  hasMore: boolean;
  rows: unknown[][];
}

const READ_PREVIEW_LIMIT = 100;
const ROW_WRITE_CHUNK = 250;
const scopeConditions = [hasScope(SCOPE_YOUTUBE_READONLY), hasScope(SCOPE_ANALYTICS_READONLY)];
const allowedConnection = currentLinkFrom(...scopeConditions);

/** OAuth 世代・削除予約を SQL 自体でも確認し、遅延 Queue からの再生成を防ぐ。 */
/** GET /api/data/analytics-raw の応答 */
export interface AnalyticsRawResponse {
  reports: AnalyticsReportView[];
}

export class AnalyticsRawRepository {
  constructor(private readonly db: D1Database) {}

  async isCurrent(message: AnalyticsDimensionsMessage): Promise<boolean> {
    return isCurrentLink(this.db, message, ...scopeConditions);
  }

  async replaceReport(
    message: AnalyticsDimensionsMessage,
    dates: { startDate: string; endDate: string },
    report: AnalyticsRawReport,
    fetchedAt: string,
  ): Promise<void> {
    const guards = [
      message.tenantId,
      message.channelId,
      message.connectedAt,
      message.tokenUpdatedAt,
    ];
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO analytics_raw_reports
             (tenant_id, channel_id, report_key, connected_at, token_updated_at,
              period_start, period_end, availability,
              column_headers_json, row_count, fetched_at)
           SELECT ?1, ?2, ?5, ?3, ?4, ?6, ?7, ?8, ?9, ?10, ?11
            WHERE EXISTS (SELECT 1 ${allowedConnection})
           ON CONFLICT (tenant_id, channel_id, report_key) DO UPDATE SET
             connected_at = excluded.connected_at,
             token_updated_at = excluded.token_updated_at,
             period_start = excluded.period_start,
             period_end = excluded.period_end,
             availability = excluded.availability,
             column_headers_json = excluded.column_headers_json,
             row_count = excluded.row_count,
             fetched_at = excluded.fetched_at`,
        )
        .bind(
          ...guards,
          message.reportKey,
          dates.startDate,
          dates.endDate,
          report.availability,
          JSON.stringify(report.columnHeaders),
          report.rows.length,
          fetchedAt,
        ),
      this.db
        .prepare(
          `DELETE FROM analytics_raw_rows
            WHERE tenant_id = ?1 AND channel_id = ?2 AND report_key = ?5
              AND EXISTS (SELECT 1 ${allowedConnection})`,
        )
        .bind(...guards, message.reportKey),
    ];
    for (let offset = 0; offset < report.rows.length; offset += ROW_WRITE_CHUNK) {
      const batch = report.rows.slice(offset, offset + ROW_WRITE_CHUNK).map((row, index) => ({
        key: row.rowKey,
        ordinal: offset + index,
        values: row.values,
      }));
      statements.push(
        this.db
          .prepare(
            `INSERT INTO analytics_raw_rows
               (tenant_id, channel_id, report_key, row_key, ordinal, values_json)
             SELECT ?1, ?2, ?5,
                    json_extract(j.value, '$.key'),
                    json_extract(j.value, '$.ordinal'),
                    json_extract(j.value, '$.values')
               FROM json_each(?6) j
              WHERE EXISTS (SELECT 1 ${allowedConnection})`,
          )
          .bind(...guards, message.reportKey, JSON.stringify(batch)),
      );
    }
    await this.db.batch(statements);
  }

  private readableConnection(): string {
    return `FROM analytics_raw_reports r
      JOIN channels c ON c.tenant_id = r.tenant_id AND c.channel_id = r.channel_id
        AND c.connected_at = r.connected_at
      JOIN channel_oauth_tokens o ON o.tenant_id = r.tenant_id AND o.channel_id = r.channel_id
        AND o.updated_at = r.token_updated_at
      JOIN tenants t ON t.tenant_id = r.tenant_id
      WHERE r.tenant_id = ?1 AND c.status = '正常' AND t.deleted_at IS NULL
        AND ${noPendingDeletion("r.tenant_id")}`;
  }

  /** 一覧は各レポートの冒頭100行だけ。全行は getReportRows でページ取得する。 */
  async listReports(tenantId: string): Promise<AnalyticsRawResponse> {
    const { results } = await this.db
      .prepare(
        `SELECT r.report_key, r.period_start, r.period_end, r.availability,
                r.column_headers_json, r.row_count, r.fetched_at
           ${this.readableConnection()} ORDER BY r.report_key`,
      )
      .bind(tenantId)
      .all<StoredReport>();
    const reports: AnalyticsReportView[] = [];
    for (const row of results) {
      const page = await this.getReportRows(tenantId, row.report_key, 0, READ_PREVIEW_LIMIT);
      reports.push({
        reportKey: row.report_key,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        fetchedAt: row.fetched_at,
        availability: row.availability,
        columnHeaders: JSON.parse(row.column_headers_json) as Record<string, unknown>[],
        rows: page?.rows ?? [],
        rowCount: row.row_count,
        hasMore: row.row_count > READ_PREVIEW_LIMIT,
        source: "youtube_analytics_api",
      });
    }
    return { reports };
  }

  async getReportRows(
    tenantId: string,
    reportKey: AnalyticsDimensionKey,
    offset: number,
    limit: number,
  ): Promise<AnalyticsReportRowsPage | null> {
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
    const report = await this.db
      .prepare(`SELECT r.row_count ${this.readableConnection()} AND r.report_key = ?2`)
      .bind(tenantId, reportKey)
      .first<{ row_count: number }>();
    if (!report) return null;
    const { results } = await this.db
      .prepare(
        `SELECT a.values_json FROM analytics_raw_rows a
          JOIN analytics_raw_reports r ON r.tenant_id = a.tenant_id
            AND r.channel_id = a.channel_id AND r.report_key = a.report_key
          JOIN channels c ON c.tenant_id = a.tenant_id AND c.channel_id = a.channel_id
            AND c.connected_at = r.connected_at
          JOIN channel_oauth_tokens o ON o.tenant_id = a.tenant_id AND o.channel_id = a.channel_id
            AND o.updated_at = r.token_updated_at
          JOIN tenants t ON t.tenant_id = a.tenant_id
         WHERE a.tenant_id = ?1 AND a.report_key = ?2
           AND c.status = '正常' AND t.deleted_at IS NULL
           AND ${noPendingDeletion("a.tenant_id")}
         ORDER BY a.ordinal LIMIT ?3 OFFSET ?4`,
      )
      .bind(tenantId, reportKey, safeLimit, safeOffset)
      .all<{ values_json: string }>();
    return {
      reportKey,
      offset: safeOffset,
      limit: safeLimit,
      rowCount: report.row_count,
      hasMore: safeOffset + results.length < report.row_count,
      rows: results.map((row) => JSON.parse(row.values_json) as unknown[]),
    };
  }
}
