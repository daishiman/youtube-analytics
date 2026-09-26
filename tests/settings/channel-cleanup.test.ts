import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Bindings } from "../../src/env";
import { processPendingChannelDeletions } from "../../src/usecases/channel-cleanup";
import { insertChannel } from "../helpers/channels";
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

const CHANNEL_DATA_TABLES = [
  "video_angles",
  "videos",
  "daily_metrics",
  "video_metrics",
  "video_reach_daily",
  "video_daily_metrics",
  "channel_daily_metrics",
  "reports",
  "findings",
  "actions",
  "media_assets",
  "business_funnel_weekly",
  "funnel_targets",
  "reporting_raw_reports",
  "reporting_jobs",
  "reporting_reach_stage",
  "analytics_raw_rows",
  "analytics_raw_reports",
  "studio_csv_columns",
  "studio_csv_unresolved_rows",
  "video_period_metrics",
  "studio_csv_imports",
  "collection_series_status",
] as const;

async function addChannelData(owner: LoggedIn & { tenantId: string }) {
  const t = owner.tenantId;
  const channel = `UC_${t}`;
  const video = `video_${t}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO videos (tenant_id, video_id, channel_id, title, published_at, fetched_at) VALUES (?1, ?2, ?3, 'old', ?4, ?4)",
    ).bind(t, video, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO video_angles (tenant_id, video_id, angle) VALUES (?1, ?2, '追加型')",
    ).bind(t, video),
    env.DB.prepare(
      "INSERT INTO daily_metrics (tenant_id, channel_id, date, content_type, fetched_at) VALUES (?1, ?2, '2026-09-20', 'all', ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO video_metrics (tenant_id, video_id, date, fetched_at) VALUES (?1, ?2, '2026-09-20', ?3)",
    ).bind(t, video, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO video_reach_daily (tenant_id, video_id, date, fetched_at) VALUES (?1, ?2, '2026-09-20', ?3)",
    ).bind(t, video, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO video_daily_metrics (tenant_id, video_id, date) VALUES (?1, ?2, '2026-09-20')",
    ).bind(t, video),
    env.DB.prepare(
      "INSERT INTO channel_daily_metrics (tenant_id, channel_id, date) VALUES (?1, ?2, '2026-09-20')",
    ).bind(t, channel),
    env.DB.prepare(
      "INSERT INTO reports (tenant_id, report_id, channel_id, version, title, created_at) VALUES (?1, 'old-report', ?2, 1, 'old', ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO findings (tenant_id, finding_id, report_id, ordinal, claim) VALUES (?1, 'old-finding', 'old-report', 0, 'old')",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO actions (tenant_id, action_id, channel_id, title, status, created_at) VALUES (?1, 'old-action', ?2, 'old', '実施中', ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO media_assets (tenant_id, asset_id, video_id, kind, r2_key) VALUES (?1, 'old-scene', ?2, 'scene', 'old-key')",
    ).bind(t, video),
    env.DB.prepare(
      "INSERT INTO business_funnel_weekly (tenant_id, channel_id, week_start, imported_at) VALUES (?1, ?2, '2026-09-21', ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO funnel_targets (tenant_id, channel_id, metric_id, effective_from) VALUES (?1, ?2, 'impressions', '2026-09-21')",
    ).bind(t, channel),
    env.DB.prepare(
      "INSERT INTO reporting_jobs (tenant_id, channel_id, job_id, report_type_id, name, last_seen_at) VALUES (?1, ?2, 'old-job', 'channel_basic_a2', 'old', ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO reporting_raw_reports (tenant_id, channel_id, report_type_id, job_id, report_id, start_time, end_time, create_time, header_json, row_count, byte_count, r2_key, status, stored_at) VALUES (?1, ?2, 'channel_basic_a2', 'old-job', 'old-report', ?3, ?3, ?3, '[]', 0, 0, 'old-key', 'stored', ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO reporting_reach_stage (tenant_id, channel_id, report_id, date, video_id, video_thumbnail_impressions, video_thumbnail_impressions_ctr) VALUES (?1, ?2, 'old-report', '2026-09-20', ?3, 100, 5.2)",
    ).bind(t, channel, video),
    env.DB.prepare(
      "INSERT INTO analytics_raw_reports (tenant_id, channel_id, report_key, connected_at, token_updated_at, period_start, period_end, availability, column_headers_json, row_count, fetched_at) VALUES (?1, ?2, 'traffic_daily', ?3, ?3, '2026-09-20', '2026-09-20', 'available', '[]', 1, ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO analytics_raw_rows (tenant_id, channel_id, report_key, row_key, ordinal, values_json) VALUES (?1, ?2, 'traffic_daily', 'one', 0, '[]')",
    ).bind(t, channel),
    env.DB.prepare(
      "INSERT INTO studio_csv_imports (tenant_id, import_id, channel_id, studio_kind, mapped_columns, unmapped_columns, normalized_rows, unresolved_rows, period_status, imported_at) VALUES (?1, 'old-studio', ?2, 'table', 1, 1, 1, 1, 'unknown', ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      "INSERT INTO studio_csv_columns (tenant_id, import_id, ordinal, header, status) VALUES (?1, 'old-studio', 0, 'unknown', 'unmapped')",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO studio_csv_unresolved_rows (tenant_id, import_id, row_index, reason) VALUES (?1, 'old-studio', 0, 'old')",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO video_period_metrics (tenant_id, import_id, row_index, channel_id, is_total, metrics_json, imported_at) VALUES (?1, 'old-studio', 0, ?2, 0, '{}', ?3)",
    ).bind(t, channel, NOW.toISOString()),
    env.DB.prepare(
      `INSERT INTO collection_series_status
       (tenant_id, kind, report_key, channel_id, connected_at, token_updated_at,
        cycle_started_at, status, changed_at)
       VALUES (?1, 'collect', '', ?2, ?3, ?3, ?3, 'ok', ?3)`,
    ).bind(t, channel, NOW.toISOString()),
  ]);
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
    await addChannelData(owner);
    await addChannelData(other);
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
    for (const table of [
      "imports",
      "oauth_pending",
      "channel_oauth_tokens",
      "channels",
      ...CHANNEL_DATA_TABLES,
    ]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?1`)
        .bind(owner.tenantId)
        .first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
    for (const table of ["imports", ...CHANNEL_DATA_TABLES]) {
      const kept = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?1`)
        .bind(other.tenantId)
        .first<{ n: number }>();
      expect(kept?.n, table).toBe(1);
    }
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
    await insertChannel({
      tenantId: owner.tenantId,
      channelId: `UC_new_${owner.tenantId}`,
      title: "new channel",
      connectedBy: owner.userId,
      connectedAt: NOW.toISOString(),
    }).run();
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

  it("日次指標が100行を超えるときも、全件削除まで完了にしない", async () => {
    const owner = await newOwner("cleanup-metrics-bounded");
    const id = await reserve(owner);
    await env.DB.batch(
      Array.from({ length: 101 }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO daily_metrics (tenant_id, channel_id, date, content_type, fetched_at) VALUES (?1, ?2, ?3, 'all', ?4)",
        ).bind(
          owner.tenantId,
          `UC_${owner.tenantId}`,
          new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
          NOW.toISOString(),
        ),
      ),
    );

    expect((await processPendingChannelDeletions(env, NOW)).completed).toBe(0);
    expect(await doneAt(id)).toBeNull();
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM daily_metrics WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(remaining?.n).toBe(1);
    expect((await processPendingChannelDeletions(env, NOW)).completed).toBe(1);
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
