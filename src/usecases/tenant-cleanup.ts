// テナント全削除。R2 を先に空にし、D1 は1通あたりの行数を抑えて消す。
// users・consent_records・sessions 本体は共有のため残し、テナント参照のみ外す。

import { CHANNEL_DATA_TABLES } from "../domain/deletion-tables";
import type { Bindings } from "../env";
import {
  claimDeletionLease,
  DELETIONS_PER_RUN,
  deleteFirstObjectPage,
  drainStaleUploads,
  hasObjects,
  ROWS_PER_PASS,
  releaseDeletionLease,
  SWEEP_INTERVAL_MS,
} from "./cleanup-common";

// チャンネル以外のテナント固有データを続けて消す。共有ユーザー・セッション本体は含めない。
export const TENANT_TABLES = [
  ...CHANNEL_DATA_TABLES,
  "imports",
  "oauth_pending",
  "channel_oauth_tokens",
  "oauth_tokens",
  "channels",
  "tenant_google_clients",
  "skill_tokens",
  "tenant_invites",
  "tenant_members",
  "audit_log",
] as const;

interface PendingDeletion {
  deletion_id: string;
  tenant_id: string;
}

interface CompletedDeletion extends PendingDeletion {
  last_swept_at: string | null;
}

export interface TenantCleanupResult {
  processed: number;
  completed: number;
  overdue: number;
  remaining: boolean;
}

async function hasTenantRows(db: D1Database, tenantId: string): Promise<boolean> {
  const checks = TENANT_TABLES.map(
    (table) => `EXISTS (SELECT 1 FROM ${table} WHERE tenant_id = ?1)`,
  );
  checks.push(
    "EXISTS (SELECT 1 FROM import_uploads WHERE tenant_id = ?1)",
    "EXISTS (SELECT 1 FROM sessions WHERE tenant_id = ?1)",
    "EXISTS (SELECT 1 FROM users WHERE last_tenant_id = ?1)",
    "EXISTS (SELECT 1 FROM data_deletions WHERE tenant_id = ?1 AND scope = 'channel')",
  );
  const row = await db
    .prepare(`SELECT 1 AS present WHERE ${checks.join(" OR ")}`)
    .bind(tenantId)
    .first<{ present: number }>();
  return Boolean(row);
}

async function processDeletion(
  env: Bindings,
  deletion: PendingDeletion,
  now: string,
  leaseToken: string,
): Promise<boolean> {
  const { DB: db, MEDIA: media } = env;
  const tenantId = deletion.tenant_id;
  const prefix = `tenants/${tenantId}/`;

  // 先に始まったアップロードやチャンネル削除のleaseを待ち、二つの削除処理を重ねない。
  const activeChannelDeletion = await db
    .prepare(
      `SELECT 1 AS present FROM data_deletions WHERE tenant_id = ?1 AND scope = 'channel'
       AND done_at IS NULL AND lease_until > ?2 LIMIT 1`,
    )
    .bind(tenantId, now)
    .first<{ present: number }>();
  if (activeChannelDeletion) return false;
  if (!(await drainStaleUploads(db, tenantId, now))) return false;

  // cursor に依存せず常に先頭から消す。台帳にない孤立キーも対象。
  await deleteFirstObjectPage(media, prefix);
  if (await hasObjects(media, prefix)) return false;

  // 子表を空にしてから親を削除。表ごとの上限で1通のD1負荷を抑える。
  for (const table of TENANT_TABLES) {
    await db
      .prepare(
        `DELETE FROM ${table} WHERE rowid IN
         (SELECT rowid FROM ${table} WHERE tenant_id = ?1 LIMIT ${ROWS_PER_PASS})`,
      )
      .bind(tenantId)
      .run();
    if (table === "analytics_raw_rows") {
      const children = await db
        .prepare("SELECT 1 AS present FROM analytics_raw_rows WHERE tenant_id = ?1 LIMIT 1")
        .bind(tenantId)
        .first<{ present: number }>();
      if (children) return false;
    }
  }
  await db.batch([
    db
      .prepare(
        `UPDATE sessions SET tenant_id = NULL WHERE rowid IN
         (SELECT rowid FROM sessions WHERE tenant_id = ?1 LIMIT ${ROWS_PER_PASS})`,
      )
      .bind(tenantId),
    db
      .prepare(
        `UPDATE users SET last_tenant_id = NULL WHERE rowid IN
         (SELECT rowid FROM users WHERE last_tenant_id = ?1 LIMIT ${ROWS_PER_PASS})`,
      )
      .bind(tenantId),
    db
      .prepare(
        `DELETE FROM data_deletions WHERE rowid IN
         (SELECT rowid FROM data_deletions WHERE tenant_id = ?1 AND deletion_id <> ?2 LIMIT ${ROWS_PER_PASS})`,
      )
      .bind(tenantId, deletion.deletion_id),
  ]);
  if (await hasTenantRows(db, tenantId)) return false;
  if (await hasObjects(media, prefix)) return false;

  // レシートは日付とランダムなtenant IDのみ保持。後着地R2の再掃除に使う。
  // UPDATEと親行削除は同じtransaction。FK漏れがあれば双方をrollbackする。
  const emptyChecks = TENANT_TABLES.map(
    (table) => `AND NOT EXISTS (SELECT 1 FROM ${table} WHERE tenant_id = data_deletions.tenant_id)`,
  ).join("\n         ");
  const [marked, removed] = await db.batch([
    db
      .prepare(
        `UPDATE data_deletions
         SET done_at = ?2, requested_by = '', channel_id = NULL,
             lease_token = NULL, lease_until = NULL, target_generation = NULL
         WHERE deletion_id = ?1 AND scope = 'tenant' AND done_at IS NULL AND lease_token = ?3
         AND NOT EXISTS (SELECT 1 FROM import_uploads WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM sessions WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM users WHERE last_tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM data_deletions d WHERE d.tenant_id = data_deletions.tenant_id AND d.deletion_id <> data_deletions.deletion_id)
         ${emptyChecks}`,
      )
      .bind(deletion.deletion_id, now, leaseToken),
    db
      .prepare(
        `DELETE FROM tenants WHERE tenant_id = ?1
         AND EXISTS (SELECT 1 FROM data_deletions WHERE deletion_id = ?2 AND done_at = ?3)`,
      )
      .bind(tenantId, deletion.deletion_id, now),
  ]);
  return marked?.meta.changes === 1 && removed?.meta.changes === 1;
}

async function sweepCompletedDeletion(
  env: Bindings,
  deletion: CompletedDeletion,
  now: string,
): Promise<boolean> {
  const prefix = `tenants/${deletion.tenant_id}/`;
  await deleteFirstObjectPage(env.MEDIA, prefix);
  if (await hasObjects(env.MEDIA, prefix)) return false;
  await env.DB.prepare(
    "UPDATE data_deletions SET last_swept_at = ?2 WHERE deletion_id = ?1 AND scope = 'tenant' AND done_at IS NOT NULL",
  )
    .bind(deletion.deletion_id, now)
    .run();
  return true;
}

/** Queue/Cronから呼ぶ。失敗は投げてQueueの再試行へ渡す。 */
export async function processPendingTenantDeletions(
  env: Bindings,
  now: Date,
): Promise<TenantCleanupResult> {
  const nowIso = now.toISOString();
  const pending = await env.DB.prepare(
    `SELECT deletion_id, tenant_id FROM data_deletions
     WHERE scope = 'tenant' AND done_at IS NULL
     ORDER BY requested_at, deletion_id LIMIT ${DELETIONS_PER_RUN}`,
  ).all<PendingDeletion>();
  let processed = 0;
  let completed = 0;
  for (const deletion of pending.results) {
    const leaseToken = await claimDeletionLease(env.DB, deletion.deletion_id, "tenant", now);
    if (!leaseToken) continue;
    processed += 1;
    try {
      if (await processDeletion(env, deletion, nowIso, leaseToken)) completed += 1;
    } finally {
      await releaseDeletionLease(env.DB, deletion.deletion_id, leaseToken);
    }
  }

  const sweepBefore = new Date(now.getTime() - SWEEP_INTERVAL_MS).toISOString();
  const sweepRows = await env.DB.prepare(
    `SELECT deletion_id, tenant_id, last_swept_at FROM data_deletions
     WHERE scope = 'tenant' AND done_at IS NOT NULL
       AND (last_swept_at IS NULL OR last_swept_at <= ?1)
     ORDER BY COALESCE(last_swept_at, ''), done_at, deletion_id LIMIT ${DELETIONS_PER_RUN}`,
  )
    .bind(sweepBefore)
    .all<CompletedDeletion>();
  let sweepIncomplete = false;
  for (const deletion of sweepRows.results) {
    if (!(await sweepCompletedDeletion(env, deletion, nowIso))) sweepIncomplete = true;
  }
  const remaining = await env.DB.prepare(
    `SELECT 1 AS present FROM data_deletions WHERE scope = 'tenant'
     AND (done_at IS NULL OR (done_at IS NOT NULL AND
       (last_swept_at IS NULL OR last_swept_at <= ?1))) LIMIT 1`,
  )
    .bind(sweepBefore)
    .first<{ present: number }>();
  const overdue = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM data_deletions WHERE scope = 'tenant' AND done_at IS NULL AND due_at < ?1",
  )
    .bind(nowIso)
    .first<{ n: number }>();
  return {
    processed,
    completed,
    overdue: overdue?.n ?? 0,
    remaining: Boolean(remaining) || sweepIncomplete,
  };
}
