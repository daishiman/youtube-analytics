import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { reserveRevokedChannelDeletion } from "../../src/usecases/revoked-channel";
import { insertChannel } from "../helpers/channels";
import { newOwner } from "./helpers";

const NOW = new Date("2026-09-25T00:00:00.000Z");

async function connection(name: string) {
  const owner = await newOwner(name);
  const message = {
    tenantId: owner.tenantId,
    channelId: `UC_${owner.tenantId}`,
    connectedAt: NOW.toISOString(),
    tokenUpdatedAt: NOW.toISOString(),
  };
  await env.DB.batch([
    insertChannel({
      tenantId: owner.tenantId,
      channelId: message.channelId,
      title: "channel",
      connectedBy: owner.userId,
      connectedAt: message.connectedAt,
    }),
    env.DB.prepare(
      `INSERT INTO channel_oauth_tokens
       (tenant_id, channel_id, refresh_token_enc, granted_scopes, updated_at)
       VALUES (?1, ?2, 'encrypted', 'scope', ?3)`,
    ).bind(owner.tenantId, message.channelId, message.tokenUpdatedAt),
  ]);
  return message;
}

describe("失効した Google 認可", () => {
  it("現行世代だけを解除・削除予約し、古いQueue通では新しい連携を消さない", async () => {
    const current = await connection("revoked-current");
    const stale = await connection("revoked-stale");
    const send = vi.spyOn(env.CLEANUP_QUEUE, "send");
    try {
      expect(
        await reserveRevokedChannelDeletion(env, { ...stale, tokenUpdatedAt: "old" }, NOW),
      ).toBe(false);
      expect(await reserveRevokedChannelDeletion(env, current, NOW)).toBe(true);
      expect(await reserveRevokedChannelDeletion(env, current, NOW)).toBe(false);
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        await env.DB.prepare("SELECT 1 FROM channels WHERE tenant_id = ?1")
          .bind(current.tenantId)
          .first(),
      ).toBeNull();
      expect(
        await env.DB.prepare("SELECT 1 FROM channel_oauth_tokens WHERE tenant_id = ?1")
          .bind(current.tenantId)
          .first(),
      ).toBeNull();
      expect(
        await env.DB.prepare("SELECT 1 FROM channels WHERE tenant_id = ?1")
          .bind(stale.tenantId)
          .first(),
      ).not.toBeNull();
      const row = await env.DB.prepare(
        "SELECT scope, channel_id, done_at FROM data_deletions WHERE tenant_id = ?1",
      )
        .bind(current.tenantId)
        .first<{
          scope: string;
          channel_id: string;
          done_at: string | null;
        }>();
      expect(row).toMatchObject({ scope: "channel", channel_id: current.channelId, done_at: null });
    } finally {
      send.mockRestore();
    }
  });
});
