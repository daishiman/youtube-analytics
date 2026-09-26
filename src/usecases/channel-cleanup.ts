// チャンネル解除後の旧データを、Queue 1通で処理できる量ずつ消す。
// 未完了予約がある間は新連携・取込を別の入口で拒否することが前提。

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

interface PendingDeletion {
  deletion_id: string;
  tenant_id: string;
}

interface CompletedDeletion extends PendingDeletion {
  target_generation: number;
  sweep_cursor: string | null;
}

export interface ChannelCleanupResult {
  processed: number;
  completed: number;
  overdue: number;
  /** true の場合、consumer は cleanup 通をもう1通送る。翌日の Cron でも再試行できる。 */
  remaining: boolean;
}

/** 1予約の削除。R2 と D1 の双方が空と分かった場合だけ done_at を入れる。 */
async function processDeletion(
  env: Bindings,
  deletion: PendingDeletion,
  now: string,
  leaseToken: string,
): Promise<boolean> {
  const { DB: db, MEDIA: media } = env;
  const { deletion_id: deletionId, tenant_id: tenantId } = deletion;
  const prefix = `tenants/${tenantId}/`;

  // 極端に遅い put の後着地は旧世代の定期再掃除で拾う。
  if (!(await drainStaleUploads(db, tenantId, now))) return false;

  // 毎回先頭から走査する。cursor の失効や短いページでの取りこぼしがなく、
  // DBに載らない孤立ファイルも対象になる。
  if ((await deleteFirstObjectPage(media, prefix)) > 0 && (await hasObjects(media, prefix))) {
    return false;
  }

  // D1 も bounded に消す。R2 が先に空になっても、履歴が残る間は連携を解放しない。
  await db
    .prepare(
      `DELETE FROM imports WHERE rowid IN (
         SELECT rowid FROM imports WHERE tenant_id = ?1 LIMIT ${ROWS_PER_PASS}
       )`,
    )
    .bind(tenantId)
    .run();

  // 全テーブルを同じ上限で少しずつ削除する。途中で落ちても次の Queue 通で続きから消せる。
  await db.batch(
    CHANNEL_DATA_TABLES.map((table) =>
      db
        .prepare(
          `DELETE FROM ${table} WHERE rowid IN (
             SELECT rowid FROM ${table} WHERE tenant_id = ?1 LIMIT ${ROWS_PER_PASS}
           )`,
        )
        .bind(tenantId),
    ),
  );

  // 解除時に通常は消える行も、途中失敗や古い状態からの再実行に備えて掃除する。
  await db.batch([
    db.prepare("DELETE FROM oauth_pending WHERE tenant_id = ?1").bind(tenantId),
    db.prepare("DELETE FROM channel_oauth_tokens WHERE tenant_id = ?1").bind(tenantId),
    db.prepare("DELETE FROM channels WHERE tenant_id = ?1").bind(tenantId),
    db.prepare("UPDATE tenants SET captions_auto = 0 WHERE tenant_id = ?1").bind(tenantId),
  ]);

  const remainingChannelData = await db
    .prepare(
      `SELECT 1 AS present WHERE ${CHANNEL_DATA_TABLES.map(
        (table) => `EXISTS (SELECT 1 FROM ${table} WHERE tenant_id = ?1)`,
      ).join(" OR ")}`,
    )
    .bind(tenantId)
    .first<{ present: number }>();
  const remainingRows = await db
    .prepare(
      `SELECT 1 AS present FROM imports WHERE tenant_id = ?1
       UNION ALL SELECT 1 FROM oauth_pending WHERE tenant_id = ?1
       UNION ALL SELECT 1 FROM channel_oauth_tokens WHERE tenant_id = ?1
       UNION ALL SELECT 1 FROM channels WHERE tenant_id = ?1
       UNION ALL SELECT 1 FROM import_uploads WHERE tenant_id = ?1
       LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ present: number }>();
  if (remainingRows || remainingChannelData || (await hasObjects(media, prefix))) return false;

  // DB側も同じ予約がまだ pending かを条件にする。重複した Queue 通でも冪等。
  await db
    .prepare(
      `UPDATE data_deletions SET done_at = ?2, lease_token = NULL, lease_until = NULL
       WHERE deletion_id = ?1 AND scope = 'channel' AND done_at IS NULL AND lease_token = ?3
         AND NOT EXISTS (SELECT 1 FROM imports WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM oauth_pending WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM channel_oauth_tokens WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM channels WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM import_uploads WHERE tenant_id = data_deletions.tenant_id)
         ${CHANNEL_DATA_TABLES.map(
           (table) =>
             `AND NOT EXISTS (SELECT 1 FROM ${table} WHERE tenant_id = data_deletions.tenant_id)`,
         ).join("\n         ")}`,
    )
    .bind(deletionId, now, leaseToken)
    .run();
  const row = await db
    .prepare("SELECT done_at FROM data_deletions WHERE deletion_id = ?1")
    .bind(deletionId)
    .first<{ done_at: string | null }>();
  return row?.done_at !== null && row?.done_at !== undefined;
}

/** 完了後に旧世代へ遅れて着地したオブジェクトを再掃除する。新世代は触れない。 */
async function sweepCompletedDeletion(
  env: Bindings,
  deletion: CompletedDeletion,
  now: string,
): Promise<void> {
  const tenantPrefix = `tenants/${deletion.tenant_id}/`;
  const generationPrefix = `${tenantPrefix}generations/g${deletion.target_generation}/`;
  if (
    (await deleteFirstObjectPage(env.MEDIA, generationPrefix)) > 0 &&
    (await hasObjects(env.MEDIA, generationPrefix))
  ) {
    return;
  }

  // 移行前のキーは共通 tenant prefix にある。cursor で全体を辿り、
  // generations/ 配下を除外する（再連携後のファイルを削除しない）。
  if (deletion.target_generation === 0) {
    const page = await env.MEDIA.list({
      prefix: tenantPrefix,
      cursor: deletion.sweep_cursor ?? undefined,
      limit: ROWS_PER_PASS,
    });
    const legacyKeys = page.objects
      .map((object) => object.key)
      .filter((key) => !key.startsWith(`${tenantPrefix}generations/`));
    if (legacyKeys.length > 0) await env.MEDIA.delete(legacyKeys);
    if (page.truncated) {
      if (!page.cursor) throw new Error("R2 list returned a truncated page without cursor");
      await env.DB.prepare(
        "UPDATE data_deletions SET sweep_cursor = ?2 WHERE deletion_id = ?1 AND done_at IS NOT NULL",
      )
        .bind(deletion.deletion_id, page.cursor)
        .run();
      return;
    }
  }
  await env.DB.prepare(
    `UPDATE data_deletions SET last_swept_at = ?2, sweep_cursor = NULL
     WHERE deletion_id = ?1 AND done_at IS NOT NULL`,
  )
    .bind(deletion.deletion_id, now)
    .run();
}

/** 期限を待たず、古い予約から少量ずつ実行する。失敗は投げて Queue の再試行に任せる。 */
export async function processPendingChannelDeletions(
  env: Bindings,
  now: Date,
): Promise<ChannelCleanupResult> {
  const pending = await env.DB.prepare(
    `SELECT deletion_id, tenant_id FROM data_deletions
     WHERE scope = 'channel' AND done_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM data_deletions tenant_deletion
         WHERE tenant_deletion.tenant_id = data_deletions.tenant_id
           AND tenant_deletion.scope = 'tenant' AND tenant_deletion.done_at IS NULL
       )
     ORDER BY requested_at, deletion_id LIMIT ${DELETIONS_PER_RUN}`,
  ).all<PendingDeletion>();
  let completed = 0;
  let processed = 0;
  for (const deletion of pending.results) {
    const leaseToken = await claimDeletionLease(env.DB, deletion.deletion_id, "channel", now);
    if (!leaseToken) continue;
    processed += 1;
    try {
      if (await processDeletion(env, deletion, now.toISOString(), leaseToken)) completed += 1;
    } finally {
      await releaseDeletionLease(env.DB, deletion.deletion_id, leaseToken);
    }
  }
  const sweepBefore = new Date(now.getTime() - SWEEP_INTERVAL_MS).toISOString();
  const completedRows = await env.DB.prepare(
    `SELECT deletion_id, tenant_id, target_generation, sweep_cursor
     FROM data_deletions
     WHERE scope = 'channel' AND done_at IS NOT NULL AND target_generation IS NOT NULL
       AND (last_swept_at IS NULL OR last_swept_at <= ?1 OR sweep_cursor IS NOT NULL)
     ORDER BY COALESCE(last_swept_at, ''), done_at, deletion_id
     LIMIT ${DELETIONS_PER_RUN}`,
  )
    .bind(sweepBefore)
    .all<CompletedDeletion>();
  for (const deletion of completedRows.results) {
    await sweepCompletedDeletion(env, deletion, now.toISOString());
  }
  const remaining = await env.DB.prepare(
    `SELECT 1 AS present FROM data_deletions
     WHERE scope = 'channel' AND (
       (done_at IS NULL AND NOT EXISTS (
         SELECT 1 FROM data_deletions tenant_deletion
         WHERE tenant_deletion.tenant_id = data_deletions.tenant_id
           AND tenant_deletion.scope = 'tenant' AND tenant_deletion.done_at IS NULL
       )) OR (done_at IS NOT NULL AND target_generation IS NOT NULL AND
         (last_swept_at IS NULL OR last_swept_at <= ?1 OR sweep_cursor IS NOT NULL))
     ) LIMIT 1`,
  )
    .bind(sweepBefore)
    .first<{ present: number }>();
  const overdue = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM data_deletions WHERE scope = 'channel' AND done_at IS NULL AND due_at < ?1",
  )
    .bind(now.toISOString())
    .first<{ n: number }>();
  return { processed, completed, overdue: overdue?.n ?? 0, remaining: Boolean(remaining) };
}
