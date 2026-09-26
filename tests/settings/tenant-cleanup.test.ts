import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Bindings } from "../../src/env";
import { processPendingTenantDeletions, TENANT_TABLES } from "../../src/usecases/tenant-cleanup";
import { insertChannel } from "../helpers/channels";
import { addMember, count, newOwner } from "../platform/helpers";

const NOW = new Date("2026-09-25T00:00:00.000Z");

async function reserve(tenantId: string, userId: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO audit_log (audit_id, tenant_id, user_id, action, at)
       VALUES (?1, ?2, ?3, 'tenant.delete', ?4)`,
    ).bind(crypto.randomUUID(), tenantId, userId, NOW.toISOString()),
    env.DB.prepare(
      `INSERT INTO data_deletions
       (deletion_id, tenant_id, scope, requested_by, requested_at, due_at)
       VALUES (?1, ?2, 'tenant', ?3, ?4, ?5)`,
    ).bind(id, tenantId, userId, NOW.toISOString(), "2026-10-02T00:00:00.000Z"),
    env.DB.prepare("UPDATE tenants SET deleted_at = ?2 WHERE tenant_id = ?1").bind(
      tenantId,
      NOW.toISOString(),
    ),
  ]);
  return id;
}

async function receipt(id: string) {
  return env.DB.prepare(
    "SELECT done_at, requested_by, last_swept_at FROM data_deletions WHERE deletion_id = ?1",
  )
    .bind(id)
    .first<{ done_at: string | null; requested_by: string; last_swept_at: string | null }>();
}

describe("テナント全削除", () => {
  it("現行schemaのtenant_id表を削除一覧と書込ゲートがすべて扱う", async () => {
    const tables = await env.DB.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ).all<{ name: string; sql: string }>();
    const tenantTables = tables.results
      .filter(({ sql }) => /\btenant_id\s+TEXT\b/i.test(sql))
      .map(({ name }) => name);
    expect(tenantTables.sort()).toEqual(
      [...TENANT_TABLES, "data_deletions", "import_uploads", "sessions", "tenants"].sort(),
    );
    for (const table of TENANT_TABLES) {
      expect(
        await count(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name = ?1",
          `${table}_block_tenant_deletion_insert`,
        ),
        table,
      ).toBe(1);
    }
  });

  it("R2と全種のテナント情報を消し、共有ユーザー・セッションと別テナントを保つ", async () => {
    const owner = await newOwner("tenant-cleanup");
    const member = await addMember(owner, "editor");
    const other = await newOwner("tenant-cleanup-other");
    const tenantId = owner.tenantId;
    const ownerKey = `tenants/${tenantId}/orphan.txt`;
    const otherKey = `tenants/${other.tenantId}/keep.txt`;
    await Promise.all([env.MEDIA.put(ownerKey, "delete"), env.MEDIA.put(otherKey, "keep")]);
    await env.DB.batch([
      insertChannel({
        tenantId,
        channelId: `UC_${tenantId}`,
        title: "old",
        connectedBy: owner.userId,
        connectedAt: NOW.toISOString(),
      }),
      env.DB.prepare(
        `INSERT INTO caption_attempts
         (tenant_id, quota_date, video_id, channel_id, connected_at, token_updated_at,
          generation, status, r2_key, created_at, updated_at)
         VALUES (?1, '2026-09-24', 'video', ?2, ?3, ?3, 0, 'stored', ?4, ?3, ?3)`,
      ).bind(tenantId, `UC_${tenantId}`, NOW.toISOString(), ownerKey),
      env.DB.prepare(
        `INSERT INTO caption_records
         (tenant_id, video_id, channel_id, caption_id, language, r2_key, bytes, fetched_at)
         VALUES (?1, 'video', ?2, 'caption', 'ja', ?3, 6, ?4)`,
      ).bind(tenantId, `UC_${tenantId}`, ownerKey, NOW.toISOString()),
      env.DB.prepare(
        `INSERT INTO reporting_authorizations
         (tenant_id, channel_id, connected_at, token_updated_at, verified_at)
         VALUES (?1, ?2, ?3, ?3, ?3)`,
      ).bind(tenantId, `UC_${tenantId}`, NOW.toISOString()),
      env.DB.prepare(
        `INSERT INTO reporting_orphan_objects (tenant_id, r2_key, created_at)
         VALUES (?1, ?2, ?3)`,
      ).bind(tenantId, ownerKey, NOW.toISOString()),
      env.DB.prepare(
        `INSERT INTO daily_metrics (tenant_id, channel_id, date, content_type, fetched_at)
         VALUES (?1, ?2, '2026-09-24', 'all', ?3)`,
      ).bind(tenantId, `UC_${tenantId}`, NOW.toISOString()),
      env.DB.prepare(
        `INSERT INTO daily_metrics (tenant_id, channel_id, date, content_type, fetched_at)
         VALUES (?1, ?2, '2026-09-24', 'all', ?3)`,
      ).bind(other.tenantId, `UC_${other.tenantId}`, NOW.toISOString()),
    ]);
    expect(await count("SELECT COUNT(*) AS n FROM sessions WHERE tenant_id = ?1", tenantId)).toBe(
      2,
    );
    const id = await reserve(tenantId, owner.userId);

    expect(await processPendingTenantDeletions(env, NOW)).toMatchObject({
      processed: 1,
      completed: 1,
      overdue: 0,
    });
    expect(await receipt(id)).toMatchObject({
      done_at: NOW.toISOString(),
      requested_by: "",
      last_swept_at: NOW.toISOString(),
    });
    expect(await env.MEDIA.get(ownerKey)).toBeNull();
    expect(await env.MEDIA.get(otherKey)).not.toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM tenants WHERE tenant_id = ?1", tenantId)).toBe(0);
    for (const table of [
      "tenant_members",
      "tenant_invites",
      "channels",
      "caption_attempts",
      "caption_records",
      "reporting_authorizations",
      "reporting_orphan_objects",
      "daily_metrics",
      "audit_log",
    ]) {
      expect(
        await count(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?1`, tenantId),
        table,
      ).toBe(0);
    }
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM users WHERE user_id IN (?1, ?2)",
        owner.userId,
        member.userId,
      ),
    ).toBe(2);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM sessions WHERE user_id IN (?1, ?2)",
        owner.userId,
        member.userId,
      ),
    ).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM sessions WHERE tenant_id = ?1", tenantId)).toBe(
      0,
    );
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE last_tenant_id = ?1", tenantId)).toBe(
      0,
    );
    expect(
      await count("SELECT COUNT(*) AS n FROM daily_metrics WHERE tenant_id = ?1", other.tenantId),
    ).toBe(1);
  });

  it("R2とD1の上限を守り、残件を再試行してから完了する", async () => {
    const owner = await newOwner("tenant-bounded");
    const prefix = `tenants/${owner.tenantId}/`;
    await Promise.all(
      Array.from({ length: 101 }, (_, i) => env.MEDIA.put(`${prefix}${i}.txt`, "old")),
    );
    await env.DB.batch(
      Array.from({ length: 101 }, (_, i) =>
        env.DB.prepare(
          `INSERT INTO daily_metrics (tenant_id, channel_id, date, content_type, fetched_at)
           VALUES (?1, 'channel', ?2, 'all', ?3)`,
        ).bind(
          owner.tenantId,
          new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
          NOW.toISOString(),
        ),
      ),
    );
    const id = await reserve(owner.tenantId, owner.userId);
    expect((await processPendingTenantDeletions(env, NOW)).completed).toBe(0);
    expect(await receipt(id)).toMatchObject({ done_at: null });
    expect((await env.MEDIA.list({ prefix })).objects).toHaveLength(1);
    expect((await processPendingTenantDeletions(env, NOW)).completed).toBe(0);
    expect(
      await count("SELECT COUNT(*) AS n FROM daily_metrics WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(1);
    expect((await processPendingTenantDeletions(env, NOW)).completed).toBe(1);
    expect((await receipt(id))?.done_at).toBe(NOW.toISOString());
  });

  it("予約後の書込と重複予約をDBで拒否し、完了後のR2後着地も回収する", async () => {
    const owner = await newOwner("tenant-gate");
    const id = await reserve(owner.tenantId, owner.userId);
    await expect(
      env.DB.prepare(
        "INSERT INTO caption_records (tenant_id, video_id, channel_id, caption_id, language, r2_key, bytes, fetched_at) VALUES (?1, 'v', 'c', 't', 'ja', 'k', 1, ?2)",
      )
        .bind(owner.tenantId, NOW.toISOString())
        .run(),
    ).rejects.toThrow("TENANT_DELETION_PENDING");
    await expect(
      env.DB.prepare(
        "INSERT INTO data_deletions (deletion_id, tenant_id, scope, requested_by, requested_at, due_at) VALUES (?1, ?2, 'tenant', ?3, ?4, ?4)",
      )
        .bind(crypto.randomUUID(), owner.tenantId, owner.userId, NOW.toISOString())
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare("UPDATE users SET last_tenant_id = ?2 WHERE user_id = ?1")
        .bind(owner.userId, owner.tenantId)
        .run(),
    ).rejects.toThrow("TENANT_DELETION_PENDING");
    expect((await processPendingTenantDeletions(env, NOW)).completed).toBe(1);
    const lateKey = `tenants/${owner.tenantId}/late.txt`;
    await env.MEDIA.put(lateKey, "late");
    const nextDay = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect((await processPendingTenantDeletions(env, nextDay)).remaining).toBe(false);
    expect(await env.MEDIA.get(lateKey)).toBeNull();
    expect((await receipt(id))?.last_swept_at).toBe(nextDay.toISOString());
  });

  it("進行中アップロードとR2削除失敗を待ち、再実行時に完了する", async () => {
    const owner = await newOwner("tenant-retry");
    const key = `tenants/${owner.tenantId}/in-flight.csv`;
    await env.DB.prepare(
      "INSERT INTO import_uploads (tenant_id, import_id, r2_key, started_at) VALUES (?1, 'in-flight', ?2, ?3)",
    )
      .bind(owner.tenantId, key, NOW.toISOString())
      .run();
    await env.MEDIA.put(key, "old");
    const id = await reserve(owner.tenantId, owner.userId);
    expect((await processPendingTenantDeletions(env, NOW)).completed).toBe(0);
    expect(await env.MEDIA.get(key)).not.toBeNull();
    await env.DB.prepare("DELETE FROM import_uploads WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    const failingMedia = new Proxy(env.MEDIA, {
      get(target, property) {
        if (property === "delete")
          return async () => {
            throw new Error("simulated R2 failure");
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      processPendingTenantDeletions({ ...env, MEDIA: failingMedia } as Bindings, NOW),
    ).rejects.toThrow("simulated R2 failure");
    expect((await receipt(id))?.done_at).toBeNull();
    expect((await processPendingTenantDeletions(env, NOW)).completed).toBe(1);
  });
});
