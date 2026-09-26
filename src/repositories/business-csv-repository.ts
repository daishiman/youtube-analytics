import type { BusinessCsv } from "../domain/business-csv";
import type { TenantContext } from "../domain/tenant-context";
import { CSV_IMPORT_GUARD, completeCsvImport, failCsvImport } from "./csv-import";

/** 全行のUPSERTと履歴の完了更新を同じD1 batch（単一トランザクション）で行う。 */
export class BusinessCsvRepository {
  constructor(
    private readonly db: D1Database,
    private readonly ctx: Pick<TenantContext, "tenantId">,
  ) {}

  async complete(input: {
    importId: string;
    expectedGeneration: number;
    channelId: string;
    csv: BusinessCsv;
    now: string;
  }): Promise<boolean> {
    const { tenantId } = this.ctx;
    const key = [tenantId, input.importId, input.expectedGeneration, input.channelId] as const;
    // JSON配列を1つの束縛値として渡し、無料枠の「1呼出あたり50クエリ」に収める。
    // 行の型と重複はusecase側で全件検証済み。SQLは連携・世代ガードを原子的に再確認する。
    const statements = [
      this.db
        .prepare(
          `INSERT INTO business_funnel_weekly
             (tenant_id, channel_id, week_start, route_label, route_visits, inquiries,
              closed_deals, revenue_jpy, imported_at, imported_by)
           SELECT i.tenant_id, c.channel_id,
                  json_extract(j.value, '$.weekStart'),
                  json_extract(j.value, '$.routeLabel'),
                  json_extract(j.value, '$.routeVisits'),
                  json_extract(j.value, '$.inquiries'),
                  json_extract(j.value, '$.closedDeals'),
                  json_extract(j.value, '$.revenueJpy'),
                  ?6, i.created_by
             FROM imports i
             JOIN tenants t ON t.tenant_id = i.tenant_id
             JOIN channels c ON c.tenant_id = i.tenant_id
             CROSS JOIN json_each(?5) j
            WHERE ${CSV_IMPORT_GUARD}
           ON CONFLICT(tenant_id, channel_id, week_start) DO UPDATE SET
             route_label = excluded.route_label,
             route_visits = excluded.route_visits,
             inquiries = excluded.inquiries,
             closed_deals = excluded.closed_deals,
             revenue_jpy = excluded.revenue_jpy,
             imported_at = excluded.imported_at,
             imported_by = excluded.imported_by`,
        )
        .bind(...key, JSON.stringify(input.csv.rows), input.now),
      completeCsvImport(this.db, key, input.csv.rows.length, input.csv.period),
    ];
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
}
