// チャンネル解除削除（channel-cleanup）とテナント全削除（tenant-cleanup）の共通部品。
// 予約の lease・取込アップロード台帳の回収・R2 の1ページ削除だけを共有し、削除順序は各ファイルに残す
import { DAY_MS } from "../domain/time";

export type DeletionScope = "channel" | "tenant";

export const DELETIONS_PER_RUN = 5;
/** R2 の1ページと D1 の1表あたりの削除上限 */
export const ROWS_PER_PASS = 100;
export const SWEEP_INTERVAL_MS = DAY_MS;
const LEASE_MS = 5 * 60 * 1000;
const STALE_UPLOAD_MS = 15 * 60 * 1000;

export async function hasObjects(media: R2Bucket, prefix: string): Promise<boolean> {
  const page = await media.list({ prefix, limit: 1 });
  return page.objects.length > 0 || page.truncated;
}

/**
 * prefix の先頭から1ページ消し、消した件数を返す。削除済みのキーは次の list に出ないため
 * cursor を持たずに毎回先頭から走査できる
 */
export async function deleteFirstObjectPage(media: R2Bucket, prefix: string): Promise<number> {
  const page = await media.list({ prefix, limit: ROWS_PER_PASS });
  if (page.truncated && page.objects.length === 0) {
    throw new Error("R2 list returned an empty truncated page");
  }
  if (page.objects.length > 0) await media.delete(page.objects.map((object) => object.key));
  return page.objects.length;
}

/**
 * 予約の前に始まった put が残る間は完了としない。落ちた Worker の台帳は時間を置いて回収する。
 * 台帳が空になったときだけ true
 */
export async function drainStaleUploads(
  db: D1Database,
  tenantId: string,
  now: string,
): Promise<boolean> {
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
          WHERE tenant_id = ?1 AND started_at <= ?2 LIMIT ${ROWS_PER_PASS}
       )`,
    )
    .bind(tenantId, staleBefore)
    .run();
  const remainingUploads = await db
    .prepare("SELECT 1 AS present FROM import_uploads WHERE tenant_id = ?1 LIMIT 1")
    .bind(tenantId)
    .first<{ present: number }>();
  return !remainingUploads;
}

/** 未完了の予約に lease を取る。他の通が処理中なら null */
export async function claimDeletionLease(
  db: D1Database,
  deletionId: string,
  scope: DeletionScope,
  now: Date,
): Promise<string | null> {
  const leaseToken = crypto.randomUUID();
  const claim = await db
    .prepare(
      `UPDATE data_deletions SET lease_token = ?2, lease_until = ?3
       WHERE deletion_id = ?1 AND scope = ?5 AND done_at IS NULL
         AND (lease_until IS NULL OR lease_until < ?4)`,
    )
    .bind(
      deletionId,
      leaseToken,
      new Date(now.getTime() + LEASE_MS).toISOString(),
      now.toISOString(),
      scope,
    )
    .run();
  return claim.meta.changes === 1 ? leaseToken : null;
}

/** 未完了・例外時も次の通で再試行できるよう lease を外す。完了済みならこの更新は無害 */
export async function releaseDeletionLease(
  db: D1Database,
  deletionId: string,
  leaseToken: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE data_deletions SET lease_token = NULL, lease_until = NULL
       WHERE deletion_id = ?1 AND lease_token = ?2`,
    )
    .bind(deletionId, leaseToken)
    .run();
}
