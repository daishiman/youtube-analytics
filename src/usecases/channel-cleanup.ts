// チャンネル解除後の旧データを、Queue 1通で処理できる量ずつ消す。
// 未完了予約がある間は新連携・取込を別の入口で拒否することが前提。
import type { Bindings } from "../env";

const DELETIONS_PER_RUN = 5;
const OBJECTS_PER_DELETION = 100;
const IMPORTS_PER_DELETION = 100;
const LEASE_MS = 5 * 60 * 1000;
const STALE_UPLOAD_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

async function hasObjects(media: R2Bucket, prefix: string): Promise<boolean> {
  const page = await media.list({ prefix, limit: 1 });
  return page.objects.length > 0 || page.truncated;
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

  // 予約の前に始まった put が残る間は完了としない。落ちた Worker の台帳は
  // 時間を置いて回収する。極端に遅い put の後着地は旧世代の定期再掃除で拾う。
  const staleBefore = new Date(Date.parse(now) - STALE_UPLOAD_MS).toISOString();
  const activeUpload = await db
    .prepare(
      "SELECT 1 AS present FROM import_uploads WHERE tenant_id = ?1 AND started_at > ?2 LIMIT 1",
    )
    .bind(tenantId, staleBefore)
    .first<{ present: number }>();
  if (activeUpload) return false;
  await db
    .prepare(
      `DELETE FROM import_uploads WHERE rowid IN (
         SELECT rowid FROM import_uploads
          WHERE tenant_id = ?1 AND started_at <= ?2 LIMIT ${IMPORTS_PER_DELETION}
       )`,
    )
    .bind(tenantId, staleBefore)
    .run();
  const remainingUploads = await db
    .prepare("SELECT 1 AS present FROM import_uploads WHERE tenant_id = ?1 LIMIT 1")
    .bind(tenantId)
    .first<{ present: number }>();
  if (remainingUploads) return false;

  // 毎回先頭から走査する。削除済みのキーは次回の list に出ず、cursor の失効や
  // 短いページでの取りこぼしがない。DBに載らない孤立ファイルも対象になる。
  const page = await media.list({ prefix, limit: OBJECTS_PER_DELETION });
  if (page.truncated && page.objects.length === 0) {
    throw new Error("R2 list returned an empty truncated page");
  }
  if (page.objects.length > 0) {
    await media.delete(page.objects.map((object) => object.key));
    if (await hasObjects(media, prefix)) return false;
  }

  // D1 も bounded に消す。R2 が先に空になっても、履歴が残る間は連携を解放しない。
  await db
    .prepare(
      `DELETE FROM imports WHERE rowid IN (
         SELECT rowid FROM imports WHERE tenant_id = ?1 LIMIT ${IMPORTS_PER_DELETION}
       )`,
    )
    .bind(tenantId)
    .run();

  // 解除時に通常は消える行も、途中失敗や古い状態からの再実行に備えて掃除する。
  await db.batch([
    db.prepare("DELETE FROM oauth_pending WHERE tenant_id = ?1").bind(tenantId),
    db.prepare("DELETE FROM channel_oauth_tokens WHERE tenant_id = ?1").bind(tenantId),
    db.prepare("DELETE FROM channels WHERE tenant_id = ?1").bind(tenantId),
    db.prepare("UPDATE tenants SET captions_auto = 0 WHERE tenant_id = ?1").bind(tenantId),
  ]);

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
  if (remainingRows || (await hasObjects(media, prefix))) return false;

  // DB側も同じ予約がまだ pending かを条件にする。重複した Queue 通でも冪等。
  await db
    .prepare(
      `UPDATE data_deletions SET done_at = ?2, lease_token = NULL, lease_until = NULL
       WHERE deletion_id = ?1 AND scope = 'channel' AND done_at IS NULL AND lease_token = ?3
         AND NOT EXISTS (SELECT 1 FROM imports WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM oauth_pending WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM channel_oauth_tokens WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM channels WHERE tenant_id = data_deletions.tenant_id)
         AND NOT EXISTS (SELECT 1 FROM import_uploads WHERE tenant_id = data_deletions.tenant_id)`,
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
  const oldGeneration = await env.MEDIA.list({
    prefix: generationPrefix,
    limit: OBJECTS_PER_DELETION,
  });
  if (oldGeneration.truncated && oldGeneration.objects.length === 0) {
    throw new Error("R2 list returned an empty truncated page");
  }
  if (oldGeneration.objects.length > 0) {
    await env.MEDIA.delete(oldGeneration.objects.map((object) => object.key));
    if (await hasObjects(env.MEDIA, generationPrefix)) return;
  }

  // 移行前のキーは共通 tenant prefix にある。cursor で全体を辿り、
  // generations/ 配下を除外する（再連携後のファイルを削除しない）。
  if (deletion.target_generation === 0) {
    const page = await env.MEDIA.list({
      prefix: tenantPrefix,
      cursor: deletion.sweep_cursor ?? undefined,
      limit: OBJECTS_PER_DELETION,
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
     ORDER BY requested_at, deletion_id LIMIT ${DELETIONS_PER_RUN}`,
  ).all<PendingDeletion>();
  let completed = 0;
  let processed = 0;
  for (const deletion of pending.results) {
    const leaseToken = crypto.randomUUID();
    const claim = await env.DB.prepare(
      `UPDATE data_deletions SET lease_token = ?2, lease_until = ?3
       WHERE deletion_id = ?1 AND scope = 'channel' AND done_at IS NULL
         AND (lease_until IS NULL OR lease_until < ?4)`,
    )
      .bind(
        deletion.deletion_id,
        leaseToken,
        new Date(now.getTime() + LEASE_MS).toISOString(),
        now.toISOString(),
      )
      .run();
    if (claim.meta.changes !== 1) continue;
    processed += 1;
    try {
      if (await processDeletion(env, deletion, now.toISOString(), leaseToken)) completed += 1;
    } finally {
      // 未完了・例外時も次の通で再試行できる。完了済みならこの更新は無害。
      await env.DB.prepare(
        `UPDATE data_deletions SET lease_token = NULL, lease_until = NULL
         WHERE deletion_id = ?1 AND lease_token = ?2`,
      )
        .bind(deletion.deletion_id, leaseToken)
        .run();
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
       done_at IS NULL OR (done_at IS NOT NULL AND target_generation IS NOT NULL AND
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
