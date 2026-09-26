// Google が refresh token を失効と返した連携だけを解除し、認可済みデータの削除を予約する。
import type { Bindings, LinkIdentity } from "../env";
import { newId } from "../lib/crypto";
import { DELETION_GRACE_MS } from "./settings-common";

/** 古い Queue 通では現在の連携に触れない。予約と連携解除は1つのD1 transaction。 */
export async function reserveRevokedChannelDeletion(
  env: Bindings,
  connection: LinkIdentity,
  now: Date,
): Promise<boolean> {
  const deletionId = newId();
  const auditId = newId();
  const at = now.toISOString();
  const dueAt = new Date(now.getTime() + DELETION_GRACE_MS).toISOString();
  const db = env.DB;
  const current = `c.tenant_id = ?2 AND c.channel_id = ?3 AND c.connected_at = ?4
    AND EXISTS (SELECT 1 FROM channel_oauth_tokens token
      WHERE token.tenant_id = c.tenant_id AND token.channel_id = c.channel_id
        AND token.updated_at = ?5)
    AND EXISTS (SELECT 1 FROM tenants t WHERE t.tenant_id = c.tenant_id AND t.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM data_deletions d
      WHERE d.tenant_id = c.tenant_id AND d.scope = 'channel' AND d.done_at IS NULL)`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO data_deletions
       (deletion_id, tenant_id, scope, channel_id, requested_by, requested_at, due_at)
       SELECT ?1, c.tenant_id, 'channel', c.channel_id, c.connected_by, ?6, ?7
       FROM channels c WHERE ${current}`,
      )
      .bind(
        deletionId,
        connection.tenantId,
        connection.channelId,
        connection.connectedAt,
        connection.tokenUpdatedAt,
        at,
        dueAt,
      ),
    db
      .prepare(
        `INSERT INTO audit_log (audit_id, tenant_id, user_id, action, detail, at)
       SELECT ?1, c.tenant_id, c.connected_by, 'youtube.authorization_revoked', c.channel_id, ?2
       FROM channels c WHERE c.tenant_id = ?3 AND c.channel_id = ?4 AND c.connected_at = ?5
         AND EXISTS (SELECT 1 FROM data_deletions d WHERE d.deletion_id = ?6)`,
      )
      .bind(
        auditId,
        at,
        connection.tenantId,
        connection.channelId,
        connection.connectedAt,
        deletionId,
      ),
    db
      .prepare(
        `DELETE FROM oauth_pending WHERE tenant_id = ?1
       AND EXISTS (SELECT 1 FROM data_deletions WHERE deletion_id = ?2)`,
      )
      .bind(connection.tenantId, deletionId),
    db
      .prepare(
        `DELETE FROM channel_oauth_tokens WHERE tenant_id = ?1 AND channel_id = ?2 AND updated_at = ?3
       AND EXISTS (SELECT 1 FROM data_deletions WHERE deletion_id = ?4)`,
      )
      .bind(connection.tenantId, connection.channelId, connection.tokenUpdatedAt, deletionId),
    db
      .prepare(
        `DELETE FROM channels WHERE tenant_id = ?1 AND channel_id = ?2 AND connected_at = ?3
       AND EXISTS (SELECT 1 FROM data_deletions WHERE deletion_id = ?4)`,
      )
      .bind(connection.tenantId, connection.channelId, connection.connectedAt, deletionId),
    db
      .prepare(
        `UPDATE tenants SET captions_auto = 0 WHERE tenant_id = ?1
       AND EXISTS (SELECT 1 FROM data_deletions WHERE deletion_id = ?2)`,
      )
      .bind(connection.tenantId, deletionId),
  ]);
  const reserved = await db
    .prepare("SELECT 1 AS present FROM data_deletions WHERE deletion_id = ?1")
    .bind(deletionId)
    .first<{ present: number }>();
  if (!reserved) return false;
  try {
    await env.CLEANUP_QUEUE.send({ kind: "cleanup" });
  } catch (cause) {
    // 予約は確定済み。Cron が回収する。
    console.error("revoked channel cleanup enqueue failed", cause);
  }
  return true;
}
