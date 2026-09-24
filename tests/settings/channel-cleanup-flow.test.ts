// HTTPの解除予約からQueue処理、旧データ消去、新チャンネル連携までを通す。
import { createMessageBatch } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bindings, CleanupMessage } from "../../src/env";
import worker from "../../src/index";
import { call, expectError, newOwner } from "../platform/helpers";
import { fakeGoogle, linkChannel, tenantName, upload } from "./helpers";

afterEach(() => vi.restoreAllMocks());

function cleanupEnv(): Bindings {
  return {
    ...env,
    CLEANUP_QUEUE: {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue<CleanupMessage>,
  };
}

async function deliverCleanup(bindings: Bindings) {
  await worker.queue(
    createMessageBatch<CleanupMessage>("channel-cleanup-queue", [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        attempts: 1,
        body: { kind: "cleanup" },
      },
    ]),
    bindings,
  );
}

describe("連携解除から旧データ消去まで", () => {
  it("旧履歴と孤立原本を消してから新連携を解放し、重複通は新世代に触れない", async () => {
    const owner = await newOwner("cleanup-flow");
    const oldChannel = `UC_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    fakeGoogle({ channels: [{ id: oldChannel }] });
    expect((await linkChannel(owner, oldChannel)).status).toBe(201);
    expect(
      (
        await upload(owner, "csv", {
          name: "old.csv",
          body: "date,views\n2026-09-01,10\n",
          type: "text/csv",
        })
      ).status,
    ).toBe(201);
    const oldImport = await env.DB.prepare(
      "SELECT r2_key FROM imports WHERE tenant_id = ?1 AND file_name = 'old.csv'",
    )
      .bind(owner.tenantId)
      .first<{ r2_key: string }>();
    expect(oldImport?.r2_key).toBeTruthy();
    const orphan = `tenants/${owner.tenantId}/imports/orphan-before-migration.csv`;
    await env.MEDIA.put(orphan, "orphan");

    const bindings = cleanupEnv();
    const disconnect = await call("/api/youtube/connection", {
      method: "DELETE",
      cookie: owner.cookie,
      body: { confirmName: await tenantName(owner.tenantId) },
      env: bindings,
    });
    expect(disconnect.status).toBe(200);
    await expectError(
      await upload(owner, "csv", { name: "blocked.csv", body: "date,views\n", type: "text/csv" }),
      409,
      "IMPORT_DELETION_PENDING",
    );
    await expectError(
      await call("/api/youtube/connect", { method: "POST", cookie: owner.cookie, body: {} }),
      409,
      "CHANNEL_DELETION_PENDING",
    );

    await deliverCleanup(bindings);
    const deletion = await env.DB.prepare(
      "SELECT done_at FROM data_deletions WHERE tenant_id = ?1 AND scope = 'channel'",
    )
      .bind(owner.tenantId)
      .first<{ done_at: string | null }>();
    expect(deletion?.done_at).toBeTruthy();
    expect(await env.MEDIA.get(oldImport?.r2_key ?? "")).toBeNull();
    expect(await env.MEDIA.get(orphan)).toBeNull();
    const beforeNewLink = (await (
      await call("/api/settings", { cookie: owner.cookie })
    ).json()) as {
      youtube: { lastCsvImportAt: string | null };
      imports: unknown[];
    };
    expect(beforeNewLink.youtube.lastCsvImportAt).toBeNull();
    expect(beforeNewLink.imports).toEqual([]);

    vi.restoreAllMocks();
    const newChannel = `UC_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    fakeGoogle({ channels: [{ id: newChannel }] });
    expect((await linkChannel(owner, newChannel)).status).toBe(201);
    expect(
      (
        await upload(owner, "csv", {
          name: "new.csv",
          body: "date,views\n2026-09-02,20\n",
          type: "text/csv",
        })
      ).status,
    ).toBe(201);
    const newImport = await env.DB.prepare(
      "SELECT r2_key FROM imports WHERE tenant_id = ?1 AND file_name = 'new.csv'",
    )
      .bind(owner.tenantId)
      .first<{ r2_key: string }>();
    expect(newImport?.r2_key).toBeTruthy();
    await deliverCleanup(bindings);
    expect(await env.MEDIA.get(newImport?.r2_key ?? "")).not.toBeNull();
    const final = (await (await call("/api/settings", { cookie: owner.cookie })).json()) as {
      youtube: { channel: { channelId: string } };
      imports: { file_name: string }[];
    };
    expect(final.youtube.channel.channelId).toBe(newChannel);
    expect(final.imports.map((row) => row.file_name)).toEqual(["new.csv"]);
  });

  it("migration 前に完了した予約は識別不能な legacy 新原本を後続掃除しない", async () => {
    const owner = await newOwner("cleanup-legacy-done");
    const deletionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO data_deletions
         (deletion_id, tenant_id, scope, channel_id, requested_by, requested_at, due_at)
       VALUES (?1, ?2, 'channel', 'UC_legacy', ?3, ?4, ?4)`,
    )
      .bind(deletionId, owner.tenantId, owner.userId, now)
      .run();
    // 0006適用前に完了済みだった予約と同じ状態。旧/新原本は同じlegacy形式で区別できない。
    await env.DB.prepare(
      "UPDATE data_deletions SET target_generation = NULL, done_at = ?2 WHERE deletion_id = ?1",
    )
      .bind(deletionId, now)
      .run();
    const currentKey = `tenants/${owner.tenantId}/imports/current-after-old-deletion.csv`;
    await env.MEDIA.put(currentKey, "current channel data");

    await deliverCleanup(cleanupEnv());

    expect(await env.MEDIA.get(currentKey)).not.toBeNull();
    const row = await env.DB.prepare(
      "SELECT done_at, last_swept_at FROM data_deletions WHERE deletion_id = ?1",
    )
      .bind(deletionId)
      .first<{ done_at: string | null; last_swept_at: string | null }>();
    expect(row?.done_at).toBe(now);
    expect(row?.last_swept_at).toBeNull();
  });
});
