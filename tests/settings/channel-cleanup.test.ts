import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Bindings } from "../../src/env";
import { processPendingChannelDeletions } from "../../src/usecases/channel-cleanup";
import { type LoggedIn, newOwner } from "../platform/helpers";

const NOW = new Date("2026-09-24T00:00:00.000Z");

async function reserve(
  owner: LoggedIn & { tenantId: string },
  scope: "channel" | "tenant" = "channel",
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO data_deletions
       (deletion_id, tenant_id, scope, channel_id, requested_by, requested_at, due_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      id,
      owner.tenantId,
      scope,
      scope === "channel" ? `UC_${owner.tenantId}` : null,
      owner.userId,
      "2026-09-23T00:00:00.000Z",
      "2026-09-30T00:00:00.000Z",
    )
    .run();
  return id;
}

async function addImport(owner: LoggedIn & { tenantId: string }, key: string) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO imports
       (tenant_id, import_id, kind, file_name, status, r2_key, created_by, created_at)
     VALUES (?1, ?2, 'csv', 'old.csv', '完了', ?3, ?4, ?5)`,
  )
    .bind(owner.tenantId, id, key, owner.userId, "2026-09-20T00:00:00.000Z")
    .run();
  return id;
}

async function doneAt(id: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT done_at FROM data_deletions WHERE deletion_id = ?1")
    .bind(id)
    .first<{ done_at: string | null }>();
  return row?.done_at ?? null;
}

describe("チャンネル解除後の旧データ削除", () => {
  it("履歴・孤立R2・古いOAuth行を消し、他テナントとGoogle設定と監査履歴を保つ", async () => {
    const owner = await newOwner("cleanup-complete");
    const other = await newOwner("cleanup-other");
    const key = `tenants/${owner.tenantId}/imports/old.csv`;
    const orphan = `tenants/${owner.tenantId}/images/orphan.webp`;
    const otherKey = `tenants/${other.tenantId}/imports/keep.csv`;
    await Promise.all([
      env.MEDIA.put(key, "old"),
      env.MEDIA.put(orphan, "orphan"),
      env.MEDIA.put(otherKey, "keep"),
    ]);
    await addImport(owner, key);
    await addImport(other, otherKey);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO oauth_pending
          (state, tenant_id, user_id, purpose, verifier_enc, created_at, expires_at)
         VALUES (?1, ?2, ?3, 'connect', 'encrypted', ?4, ?5)`,
      ).bind(
        crypto.randomUUID(),
        owner.tenantId,
        owner.userId,
        NOW.toISOString(),
        NOW.toISOString(),
      ),
      env.DB.prepare(
        `INSERT INTO channel_oauth_tokens (tenant_id, channel_id, granted_scopes, updated_at)
         VALUES (?1, ?2, '', ?3)`,
      ).bind(owner.tenantId, `UC_${owner.tenantId}`, NOW.toISOString()),
      env.DB.prepare(
        `INSERT INTO tenant_google_clients
          (tenant_id, client_id, client_secret_enc, updated_by, updated_at)
         VALUES (?1, 'client', 'encrypted', ?2, ?3)`,
      ).bind(owner.tenantId, owner.userId, NOW.toISOString()),
      env.DB.prepare(
        `INSERT INTO audit_log (audit_id, tenant_id, user_id, action, at)
         VALUES (?1, ?2, ?3, 'youtube.disconnect', ?4)`,
      ).bind(crypto.randomUUID(), owner.tenantId, owner.userId, NOW.toISOString()),
    ]);
    const id = await reserve(owner);

    const result = await processPendingChannelDeletions(env, NOW);
    expect(result).toEqual({ processed: 1, completed: 1, overdue: 0, remaining: false });
    expect(await doneAt(id)).toBe(NOW.toISOString());
    expect(await env.MEDIA.get(key)).toBeNull();
    expect(await env.MEDIA.get(orphan)).toBeNull();
    expect(await env.MEDIA.get(otherKey)).not.toBeNull();
    for (const table of ["imports", "oauth_pending", "channel_oauth_tokens", "channels"]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?1`)
        .bind(owner.tenantId)
        .first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
    const kept = await env.DB.prepare("SELECT COUNT(*) AS n FROM imports WHERE tenant_id = ?1")
      .bind(other.tenantId)
      .first<{ n: number }>();
    expect(kept?.n).toBe(1);
    const google = await env.DB.prepare(
      "SELECT client_id FROM tenant_google_clients WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ client_id: string }>();
    expect(google?.client_id).toBe("client");
    const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(audit?.n).toBe(1);

    // 古い cleanup 通が遅れて再配信されても、新チャンネルのデータは消えない。
    await env.DB.prepare(
      `INSERT INTO channels
        (tenant_id, channel_id, title, status, connected_by, connected_at)
       VALUES (?1, ?2, 'new channel', '正常', ?3, ?4)`,
    )
      .bind(owner.tenantId, `UC_new_${owner.tenantId}`, owner.userId, NOW.toISOString())
      .run();
    const newKey = `tenants/${owner.tenantId}/generations/g1/imports/new.csv`;
    await env.MEDIA.put(newKey, "new");
    await addImport(owner, newKey);
    expect(await processPendingChannelDeletions(env, NOW)).toEqual({
      processed: 0,
      completed: 0,
      overdue: 0,
      remaining: false,
    });
    expect(await doneAt(id)).toBe(NOW.toISOString());
    expect(await env.MEDIA.get(newKey)).not.toBeNull();
    const current = await env.DB.prepare("SELECT channel_id FROM channels WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .first<{ channel_id: string }>();
    expect(current?.channel_id).toBe(`UC_new_${owner.tenantId}`);
  });

  it("R2 が一部削除後に失敗しても完了にせず、次回の再試行で完了する", async () => {
    const owner = await newOwner("cleanup-retry");
    const first = `tenants/${owner.tenantId}/a.txt`;
    const second = `tenants/${owner.tenantId}/b.txt`;
    await env.MEDIA.put(first, "a");
    await env.MEDIA.put(second, "b");
    await addImport(owner, first);
    const id = await reserve(owner);

    const failingMedia = new Proxy(env.MEDIA, {
      get(target, property) {
        if (property === "delete") {
          return async (keys: string | string[]) => {
            await target.delete(Array.isArray(keys) ? (keys[0] ?? "") : keys);
            throw new Error("simulated R2 interruption");
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      processPendingChannelDeletions({ ...env, MEDIA: failingMedia } as Bindings, NOW),
    ).rejects.toThrow("simulated R2 interruption");
    expect(await doneAt(id)).toBeNull();
    const kept = await env.DB.prepare("SELECT COUNT(*) AS n FROM imports WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(kept?.n).toBe(1);
    expect(await env.MEDIA.get(second)).not.toBeNull();

    expect(await processPendingChannelDeletions(env, NOW)).toEqual({
      processed: 1,
      completed: 1,
      overdue: 0,
      remaining: false,
    });
    expect(await doneAt(id)).toBe(NOW.toISOString());
    expect(await env.MEDIA.get(second)).toBeNull();
  });

  it("進行中アップロードの台帳がある間は完了にせず、補償後に再試行する", async () => {
    const owner = await newOwner("cleanup-upload");
    const key = `tenants/${owner.tenantId}/generations/g0/imports/in-flight.csv`;
    await env.DB.prepare(
      `INSERT INTO import_uploads (tenant_id, import_id, r2_key, started_at)
       VALUES (?1, 'in-flight', ?2, ?3)`,
    )
      .bind(owner.tenantId, key, NOW.toISOString())
      .run();
    await env.MEDIA.put(key, "in-flight");
    const id = await reserve(owner);

    expect(await processPendingChannelDeletions(env, NOW)).toEqual({
      processed: 1,
      completed: 0,
      overdue: 0,
      remaining: true,
    });
    expect(await doneAt(id)).toBeNull();
    expect(await env.MEDIA.get(key)).not.toBeNull();
    await env.MEDIA.delete(key);
    await env.DB.prepare("DELETE FROM import_uploads WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    expect(await processPendingChannelDeletions(env, NOW)).toEqual({
      processed: 1,
      completed: 1,
      overdue: 0,
      remaining: false,
    });
  });

  it("完了後の旧世代の後着地を cursor 越しに消し、新世代100件超は保つ", async () => {
    const owner = await newOwner("cleanup-late");
    const id = await reserve(owner);
    expect((await processPendingChannelDeletions(env, NOW)).completed).toBe(1);
    expect(await doneAt(id)).toBe(NOW.toISOString());
    const tenantPrefix = `tenants/${owner.tenantId}/`;
    const newPrefix = `${tenantPrefix}generations/g1/`;
    await Promise.all(
      Array.from({ length: 101 }, (_, i) =>
        env.MEDIA.put(`${newPrefix}${String(i).padStart(3, "0")}.txt`, "new"),
      ),
    );
    const lateGeneration = `${tenantPrefix}generations/g0/late.txt`;
    const lateLegacy = `${tenantPrefix}imports/late.csv`;
    await env.MEDIA.put(lateGeneration, "old");
    await env.MEDIA.put(lateLegacy, "old");

    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const firstSweep = await processPendingChannelDeletions(env, tomorrow);
    expect(firstSweep).toMatchObject({ processed: 0, completed: 0, remaining: true });
    const cursor = await env.DB.prepare(
      "SELECT sweep_cursor FROM data_deletions WHERE deletion_id = ?1",
    )
      .bind(id)
      .first<{ sweep_cursor: string | null }>();
    expect(cursor?.sweep_cursor).toBeTruthy();
    for (let i = 0; i < 5; i += 1) {
      const result = await processPendingChannelDeletions(env, tomorrow);
      if (!result.remaining) break;
    }
    expect(await env.MEDIA.get(lateGeneration)).toBeNull();
    expect(await env.MEDIA.get(lateLegacy)).toBeNull();
    expect((await env.MEDIA.list({ prefix: newPrefix })).objects).toHaveLength(101);
    expect(await doneAt(id)).toBe(NOW.toISOString());
  });

  it("1回の処理量を制限し、残りを次の通で消してから完了にする", async () => {
    const owner = await newOwner("cleanup-bounded");
    const id = await reserve(owner);
    const prefix = `tenants/${owner.tenantId}/`;
    await Promise.all(
      Array.from({ length: 101 }, (_, i) => env.MEDIA.put(`${prefix}${i}.txt`, String(i))),
    );
    expect(await processPendingChannelDeletions(env, NOW)).toEqual({
      processed: 1,
      completed: 0,
      overdue: 0,
      remaining: true,
    });
    expect(await doneAt(id)).toBeNull();
    expect((await env.MEDIA.list({ prefix })).objects).toHaveLength(1);
    expect(await processPendingChannelDeletions(env, NOW)).toEqual({
      processed: 1,
      completed: 1,
      overdue: 0,
      remaining: false,
    });
    expect(await doneAt(id)).toBe(NOW.toISOString());
  });

  it("同じ予約を並列実行しても、lease を取れた1通だけが削除する", async () => {
    const owner = await newOwner("cleanup-lease");
    const id = await reserve(owner);
    const key = `tenants/${owner.tenantId}/old.txt`;
    await env.MEDIA.put(key, "old");
    let overlapping: Awaited<ReturnType<typeof processPendingChannelDeletions>> | null = null;
    const interleavedMedia = new Proxy(env.MEDIA, {
      get(target, property) {
        if (property === "delete") {
          return async (keys: string | string[]) => {
            overlapping = await processPendingChannelDeletions(env, NOW);
            await target.delete(keys);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    expect(
      await processPendingChannelDeletions({ ...env, MEDIA: interleavedMedia } as Bindings, NOW),
    ).toEqual({ processed: 1, completed: 1, overdue: 0, remaining: false });
    expect(overlapping).toEqual({ processed: 0, completed: 0, overdue: 0, remaining: true });
    expect(await doneAt(id)).toBe(NOW.toISOString());
  });

  it("テナント全体の削除予約には触れない", async () => {
    const owner = await newOwner("cleanup-tenant-scope");
    const id = await reserve(owner, "tenant");
    const key = `tenants/${owner.tenantId}/keep.txt`;
    await env.MEDIA.put(key, "keep");
    expect(await processPendingChannelDeletions(env, NOW)).toEqual({
      processed: 0,
      completed: 0,
      overdue: 0,
      remaining: false,
    });
    expect(await doneAt(id)).toBeNull();
    expect(await env.MEDIA.get(key)).not.toBeNull();
  });
});
