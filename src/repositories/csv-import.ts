// 業務CSV・Studio CSV の取込確定で共有する SQL 部品。
// ?1〜?4 は tenantId・importId・取込世代（import_generation）・channelId の順で束縛する
export type CsvImportKey = readonly [
  tenantId: string,
  importId: string,
  expectedGeneration: number,
  channelId: string,
];

/**
 * imports i・tenants t・channels c を結んだ行が、処理待ちのまま同じ取込世代・同じチャンネルで、
 * 削除予約もないときだけ書き込む。行の書き込みと履歴の完了更新で同じ条件を使う
 */
export const CSV_IMPORT_GUARD = `i.tenant_id = ?1 AND i.import_id = ?2 AND i.kind = 'csv'
      AND i.status = '処理待ち' AND t.import_generation = ?3
      AND c.channel_id = ?4
      AND NOT EXISTS (
        SELECT 1 FROM data_deletions d
         WHERE d.tenant_id = i.tenant_id AND d.scope IN ('channel', 'tenant') AND d.done_at IS NULL
      )`;

/** 取込履歴を完了にする文。行の書き込みと同じ batch の最後に置き、changes で確定を判定する */
export function completeCsvImport(
  db: D1Database,
  key: CsvImportKey,
  rows: number,
  period: string | null,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE imports SET status = '完了', error = NULL, rows = ?5, period = ?6
        WHERE tenant_id = ?1 AND import_id = ?2 AND kind = 'csv' AND status = '処理待ち'
          AND EXISTS (
            SELECT 1 FROM tenants t JOIN channels c ON c.tenant_id = t.tenant_id
             WHERE t.tenant_id = imports.tenant_id AND t.import_generation = ?3
               AND c.channel_id = ?4
          )
          AND NOT EXISTS (
            SELECT 1 FROM data_deletions d
             WHERE d.tenant_id = imports.tenant_id
               AND d.scope IN ('channel', 'tenant') AND d.done_at IS NULL
          )`,
    )
    .bind(...key, rows, period);
}

/** 取込履歴を失敗にする。世代が変わった・削除予約中なら何もせず false */
export async function failCsvImport(
  db: D1Database,
  tenantId: string,
  input: { importId: string; expectedGeneration: number; reason: string },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE imports SET status = '失敗', error = ?4, rows = NULL, period = NULL
        WHERE tenant_id = ?1 AND import_id = ?2 AND kind = 'csv' AND status = '処理待ち'
          AND EXISTS (
            SELECT 1 FROM tenants t
             WHERE t.tenant_id = imports.tenant_id AND t.import_generation = ?3
          )
          AND NOT EXISTS (
            SELECT 1 FROM data_deletions d
             WHERE d.tenant_id = imports.tenant_id
               AND d.scope IN ('channel', 'tenant') AND d.done_at IS NULL
          )`,
    )
    .bind(tenantId, input.importId, input.expectedGeneration, input.reason)
    .run();
  return result.meta.changes === 1;
}
