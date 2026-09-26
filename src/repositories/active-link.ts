// 有効な YouTube 連携を確かめる SQL 部品。収集・保存・読み出しの全経路で同じ条件を使う。
// 別名は c = channels・t = tenants・o = channel_oauth_tokens（トークンの別名だけ hasScope で変えられる）
import type { LinkIdentity } from "../env";

/** チャンネル削除・テナント削除の予約中は、どの経路も読み書きしない */
export function noPendingDeletion(tenantIdExpr: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM data_deletions d WHERE d.tenant_id = ${tenantIdExpr}
      AND d.scope IN ('channel', 'tenant') AND d.done_at IS NULL
  )`;
}

/** 空白区切りの granted_scopes に scope が含まれる */
export function hasScope(scope: string, tokenAlias = "o"): string {
  return `instr(' ' || ${tokenAlias}.granted_scopes || ' ', ' ${scope} ') > 0`;
}

/**
 * ?1〜?4（tenantId・channelId・connectedAt・tokenUpdatedAt）の連携世代が今も有効な行。
 * 経路ごとのスコープ・フラグ条件は conditions に渡し、AND で足す
 */
export function currentLinkFrom(...conditions: string[]): string {
  return `FROM channels c
    JOIN tenants t ON t.tenant_id = c.tenant_id
    JOIN channel_oauth_tokens o ON o.tenant_id = c.tenant_id AND o.channel_id = c.channel_id
   WHERE c.tenant_id = ?1 AND c.channel_id = ?2 AND c.connected_at = ?3
     AND o.updated_at = ?4 AND o.refresh_token_enc IS NOT NULL
     AND c.status = '正常' AND t.deleted_at IS NULL
     AND ${[noPendingDeletion("c.tenant_id"), ...conditions].join("\n     AND ")}`;
}

export function linkArgs(link: LinkIdentity): [string, string, string, string] {
  return [link.tenantId, link.channelId, link.connectedAt, link.tokenUpdatedAt];
}

/** 遅延した Queue の通が、解除・再連携・削除予約の後に書き込まないよう毎回確かめる */
export async function isCurrentLink(
  db: D1Database,
  link: LinkIdentity,
  ...conditions: string[]
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok ${currentLinkFrom(...conditions)}`)
    .bind(...linkArgs(link))
    .first();
  return row !== null;
}
