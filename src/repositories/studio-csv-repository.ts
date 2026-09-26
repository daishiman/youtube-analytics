import type { StudioColumn, StudioCsv, StudioKind } from "../domain/studio-csv";
import type { TenantContext } from "../domain/tenant-context";
import { CSV_IMPORT_GUARD, completeCsvImport, failCsvImport } from "./csv-import";

export interface StudioImportSummaryRow {
  import_id: string;
  studio_kind: StudioKind;
  mapped_columns: number;
  unmapped_columns: number;
  unresolved_rows: number;
  period_status: "unknown" | "daily";
}

interface StudioColumnRow {
  ordinal: number;
  header: string;
  mapping_key: string | null;
  unit: string | null;
  status: StudioColumn["status"];
}

export class StudioCsvRepository {
  constructor(
    private readonly db: D1Database,
    private readonly ctx: Pick<TenantContext, "tenantId">,
  ) {}

  /** 全データ行と取込履歴をD1の同じbatchで確定する。原本は既にR2に保存済み。 */
  async complete(input: {
    importId: string;
    expectedGeneration: number;
    channelId: string;
    csv: StudioCsv;
    now: string;
  }): Promise<boolean> {
    const { tenantId } = this.ctx;
    const common = [tenantId, input.importId, input.expectedGeneration, input.channelId] as const;
    // A missing metric column means this import has no opinion about its prior value.
    // A present column with an empty cell intentionally replaces the value with NULL.
    const mapped = new Set(
      input.csv.columns
        .filter((column) => column.status === "mapped")
        .map((column) => column.mappingKey),
    );
    const hasViews = mapped.has("views") ? 1 : 0;
    const hasEngagedViews = mapped.has("engagedViews") ? 1 : 0;
    const hasAverageViewPercentage = mapped.has("averageViewPercentage") ? 1 : 0;
    const guard = CSV_IMPORT_GUARD;
    const source = `FROM imports i
      JOIN tenants t ON t.tenant_id = i.tenant_id
      JOIN channels c ON c.tenant_id = i.tenant_id`;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO studio_csv_imports
             (tenant_id, import_id, channel_id, studio_kind, mapped_columns, unmapped_columns,
              normalized_rows, unresolved_rows, period_status, imported_at)
           SELECT i.tenant_id, i.import_id, c.channel_id, ?5, ?6, ?7, ?8, ?9, ?10, ?11
             ${source} WHERE ${guard}`,
        )
        .bind(
          ...common,
          input.csv.studioKind,
          input.csv.mappedColumns,
          input.csv.unmappedColumns,
          input.csv.periodRows.length + input.csv.dailyRows.length,
          input.csv.unresolvedRows.length,
          input.csv.periodStatus,
          input.now,
        ),
      this.db
        .prepare(
          `INSERT INTO studio_csv_columns
             (tenant_id, import_id, ordinal, header, mapping_key, unit, status)
           SELECT i.tenant_id, i.import_id,
                  json_extract(j.value, '$.ordinal'), json_extract(j.value, '$.header'),
                  json_extract(j.value, '$.mappingKey'), json_extract(j.value, '$.unit'),
                  json_extract(j.value, '$.status')
             ${source} CROSS JOIN json_each(?5) j WHERE ${guard}`,
        )
        .bind(...common, JSON.stringify(input.csv.columns)),
    ];
    if (input.csv.studioKind === "table") {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO video_period_metrics
               (tenant_id, import_id, row_index, channel_id, video_id, is_total,
                period_from, period_to, title, metrics_json, imported_at)
             SELECT i.tenant_id, i.import_id, json_extract(j.value, '$.rowIndex'), c.channel_id,
                    json_extract(j.value, '$.videoId'), json_extract(j.value, '$.isTotal'),
                    NULL, NULL, json_extract(j.value, '$.title'),
                    json_extract(j.value, '$.metrics'), ?6
               ${source} CROSS JOIN json_each(?5) j WHERE ${guard}`,
          )
          .bind(...common, JSON.stringify(input.csv.periodRows), input.now),
      );
    } else if (input.csv.studioKind === "graph") {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO video_daily_metrics
               (tenant_id, video_id, date, views, engaged_views, average_view_percentage,
                csv_import_id, views_csv_import_id, engaged_views_csv_import_id,
                average_view_percentage_csv_import_id)
             SELECT i.tenant_id, json_extract(j.value, '$.videoId'),
                    json_extract(j.value, '$.date'),
                    CASE WHEN ?6 = 1 THEN json_extract(j.value, '$.views') END,
                    CASE WHEN ?7 = 1 THEN json_extract(j.value, '$.engagedViews') END,
                    CASE WHEN ?8 = 1 THEN json_extract(j.value, '$.averageViewPercentage') END,
                    i.import_id,
                    CASE WHEN ?6 = 1 THEN i.import_id END,
                    CASE WHEN ?7 = 1 THEN i.import_id END,
                    CASE WHEN ?8 = 1 THEN i.import_id END
               ${source} CROSS JOIN json_each(?5) j WHERE ${guard}
             ON CONFLICT(tenant_id, video_id, date) DO UPDATE SET
               views = CASE WHEN ?6 = 1 THEN excluded.views ELSE video_daily_metrics.views END,
               engaged_views = CASE WHEN ?7 = 1 THEN excluded.engaged_views ELSE video_daily_metrics.engaged_views END,
               average_view_percentage = CASE WHEN ?8 = 1 THEN excluded.average_view_percentage
                                              ELSE video_daily_metrics.average_view_percentage END,
               views_csv_import_id = CASE WHEN ?6 = 1 THEN excluded.views_csv_import_id
                                          ELSE video_daily_metrics.views_csv_import_id END,
               engaged_views_csv_import_id = CASE WHEN ?7 = 1 THEN excluded.engaged_views_csv_import_id
                                                  ELSE video_daily_metrics.engaged_views_csv_import_id END,
               average_view_percentage_csv_import_id = CASE WHEN ?8 = 1
                 THEN excluded.average_view_percentage_csv_import_id
                 ELSE video_daily_metrics.average_view_percentage_csv_import_id END,
               csv_import_id = excluded.csv_import_id`,
          )
          .bind(
            ...common,
            JSON.stringify(input.csv.dailyRows),
            hasViews,
            hasEngagedViews,
            hasAverageViewPercentage,
          ),
      );
    } else {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO channel_daily_metrics
               (tenant_id, channel_id, date, views, engaged_views, csv_import_id, imported_at,
                views_csv_import_id, engaged_views_csv_import_id)
             SELECT i.tenant_id, c.channel_id, json_extract(j.value, '$.date'),
                    CASE WHEN ?7 = 1 THEN json_extract(j.value, '$.views') END,
                    CASE WHEN ?8 = 1 THEN json_extract(j.value, '$.engagedViews') END,
                    i.import_id, ?6,
                    CASE WHEN ?7 = 1 THEN i.import_id END,
                    CASE WHEN ?8 = 1 THEN i.import_id END
               ${source} CROSS JOIN json_each(?5) j WHERE ${guard}
             ON CONFLICT(tenant_id, channel_id, date) DO UPDATE SET
               views = CASE WHEN ?7 = 1 THEN excluded.views ELSE channel_daily_metrics.views END,
               engaged_views = CASE WHEN ?8 = 1 THEN excluded.engaged_views
                                    ELSE channel_daily_metrics.engaged_views END,
               views_csv_import_id = CASE WHEN ?7 = 1 THEN excluded.views_csv_import_id
                                          ELSE channel_daily_metrics.views_csv_import_id END,
               engaged_views_csv_import_id = CASE WHEN ?8 = 1 THEN excluded.engaged_views_csv_import_id
                                                  ELSE channel_daily_metrics.engaged_views_csv_import_id END,
               csv_import_id = excluded.csv_import_id,
               imported_at = excluded.imported_at`,
          )
          .bind(
            ...common,
            JSON.stringify(input.csv.dailyRows),
            input.now,
            hasViews,
            hasEngagedViews,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `INSERT INTO studio_csv_unresolved_rows (tenant_id, import_id, row_index, reason)
           SELECT i.tenant_id, i.import_id, json_extract(j.value, '$.rowIndex'),
                  json_extract(j.value, '$.reason')
             ${source} CROSS JOIN json_each(?5) j WHERE ${guard}`,
        )
        .bind(...common, JSON.stringify(input.csv.unresolvedRows)),
      completeCsvImport(this.db, common, input.csv.totalRows, input.csv.period),
    );
    const results = await this.db.batch(statements);
    return results.at(-1)?.meta.changes === 1;
  }

  async fail(input: {
    importId: string;
    expectedGeneration: number;
    reason: string;
  }): Promise<boolean> {
    return failCsvImport(this.db, this.ctx.tenantId, input);
  }

  async summaries(importIds: string[]): Promise<Map<string, StudioImportSummaryRow>> {
    if (importIds.length === 0) return new Map();
    const placeholders = importIds.map((_, i) => `?${i + 2}`).join(",");
    const { results } = await this.db
      .prepare(
        `SELECT import_id, studio_kind, mapped_columns, unmapped_columns, unresolved_rows,
                period_status FROM studio_csv_imports
          WHERE tenant_id = ?1 AND import_id IN (${placeholders})`,
      )
      .bind(this.ctx.tenantId, ...importIds)
      .all<StudioImportSummaryRow>();
    return new Map(results.map((row) => [row.import_id, row]));
  }

  async mapping(importId: string): Promise<{
    summary: StudioImportSummaryRow;
    columns: StudioColumnRow[];
  } | null> {
    const summary = await this.db
      .prepare(
        `SELECT import_id, studio_kind, mapped_columns, unmapped_columns, unresolved_rows,
                period_status FROM studio_csv_imports WHERE tenant_id = ?1 AND import_id = ?2`,
      )
      .bind(this.ctx.tenantId, importId)
      .first<StudioImportSummaryRow>();
    if (!summary) return null;
    const { results } = await this.db
      .prepare(
        `SELECT ordinal, header, mapping_key, unit, status FROM studio_csv_columns
          WHERE tenant_id = ?1 AND import_id = ?2 ORDER BY ordinal`,
      )
      .bind(this.ctx.tenantId, importId)
      .all<StudioColumnRow>();
    return { summary, columns: results };
  }
}
