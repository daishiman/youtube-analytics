import { createMessageBatch } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { CleanupMessage } from "../../src/env";
import worker from "../../src/index";
import { DashboardRepository } from "../../src/repositories/dashboard-repository";
import { SettingsRepository } from "../../src/repositories/settings-repository";
import { METADATA_DELETE_BATCH, purgeExpiredApiMetadata } from "../../src/usecases/retention";
import { seedDashboard } from "../dashboard/helpers";
import { newOwner } from "./helpers";

const DAY_MS = 86_400_000;

describe("APIメタデータの30日保持", () => {
  it("30日超のチャンネル表示値を読取時に隠し、cleanupで値だけ消す", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const now = new Date();
    const old = new Date(now.getTime() - 31 * DAY_MS).toISOString();
    await env.DB.prepare(
      `UPDATE channels SET title = '古いチャンネル名',
         thumbnail_url = 'https://yt3.ggpht.com/old.jpg', subscriber_count = 123,
         metadata_fetched_at = ?1 WHERE tenant_id = ?2`,
    )
      .bind(old, owner.tenantId)
      .run();
    const ctx = { tenantId: owner.tenantId };
    expect(await new SettingsRepository(env.DB, ctx).getChannel(now)).toMatchObject({
      channel_id: channelId,
      title: "チャンネル情報の再取得待ち",
      thumbnail_url: null,
      subscriber_count: null,
    });
    expect(await new DashboardRepository(env.DB, ctx).channel(now)).toMatchObject({
      channel_id: channelId,
      title: "チャンネル情報の再取得待ち",
    });
    expect((await purgeExpiredApiMetadata(env.DB, now)).channels).toBe(1);
    const stored = await env.DB.prepare(
      "SELECT channel_id, title, thumbnail_url, subscriber_count FROM channels WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first();
    expect(stored).toEqual({
      channel_id: channelId,
      title: "チャンネル情報の再取得待ち",
      thumbnail_url: null,
      subscriber_count: null,
    });
  });

  it("期限切れ動画のメタデータを上限付きで消し、指標と動画ID、新しい行を残す", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const now = new Date();
    const old = new Date(now.getTime() - 31 * DAY_MS).toISOString();
    const fresh = new Date(now.getTime() - 29 * DAY_MS).toISOString();
    const ids = Array.from({ length: METADATA_DELETE_BATCH + 1 }, (_, i) => `expired-${i}`);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO videos
           (tenant_id, video_id, channel_id, title, published_at, content_type, fetched_at)
         SELECT ?1, j.value, ?2, '古いタイトル', '2025-01-01T00:00:00Z', 'long', ?3
           FROM json_each(?4) j`,
      ).bind(owner.tenantId, channelId, old, JSON.stringify(ids)),
      env.DB.prepare(
        `INSERT INTO video_metrics (tenant_id, video_id, date, views, fetched_at)
         VALUES (?1, ?2, '2026-08-01', 10, ?3)`,
      ).bind(owner.tenantId, ids[0], old),
      env.DB.prepare(
        `INSERT INTO videos
           (tenant_id, video_id, channel_id, title, published_at, content_type, fetched_at)
         VALUES (?1, 'recent-video', ?2, '新しいタイトル', '2026-09-01T00:00:00Z', 'long', ?3)`,
      ).bind(owner.tenantId, channelId, fresh),
      env.DB.prepare(
        `INSERT INTO reporting_jobs
           (tenant_id, channel_id, job_id, report_type_id, name, last_seen_at)
         VALUES (?1, ?2, 'old-job', 'channel_basic_a2', '古いジョブ', ?3),
                (?1, ?2, 'fresh-job', 'channel_basic_a2', '新しいジョブ', ?4)`,
      ).bind(owner.tenantId, channelId, old, fresh),
      env.DB.prepare(
        `INSERT INTO oauth_pending
           (state, tenant_id, user_id, purpose, verifier_enc, candidates_enc, token_enc,
            created_at, expires_at)
         VALUES (?1, ?2, ?3, 'connect', 'encrypted-verifier', 'encrypted-candidates',
                 'encrypted-token', ?4, ?4)`,
      ).bind(crypto.randomUUID(), owner.tenantId, owner.userId, old),
    ]);

    // Cron直前でもAPI応答に期限切れのData API値を出さない。
    const cutoff = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    const displayed = await new DashboardRepository(env.DB, { tenantId: owner.tenantId }).videos(
      channelId,
      cutoff,
    );
    expect(displayed.find((video) => video.video_id === ids[0])).toMatchObject({
      title: "動画情報の再取得待ち",
      published_at: "",
      content_type: "unknown",
    });
    expect(displayed.find((video) => video.video_id === "recent-video")).toMatchObject({
      title: "新しいタイトル",
      content_type: "long",
    });
    expect(displayed.findIndex((video) => video.video_id === "recent-video")).toBeLessThan(
      displayed.findIndex((video) => video.video_id === ids[0]),
    );

    expect(await purgeExpiredApiMetadata(env.DB, now)).toEqual({
      videos: METADATA_DELETE_BATCH,
      jobs: 1,
      channels: 0,
      pending: 1,
      remaining: true,
    });
    expect(await purgeExpiredApiMetadata(env.DB, now)).toEqual({
      videos: 1,
      jobs: 0,
      channels: 0,
      pending: 0,
      remaining: false,
    });
    const redacted = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM videos
        WHERE tenant_id = ?1 AND video_id LIKE 'expired-%'
          AND title = '動画情報の再取得待ち' AND published_at = ''
          AND content_type = 'unknown' AND thumbnail_url IS NULL`,
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(redacted?.n).toBe(METADATA_DELETE_BATCH + 1);
    const metric = await env.DB.prepare(
      "SELECT views FROM video_metrics WHERE tenant_id = ?1 AND video_id = ?2",
    )
      .bind(owner.tenantId, ids[0])
      .first<{ views: number }>();
    expect(metric?.views).toBe(10);
    const jobs = await env.DB.prepare(
      "SELECT job_id FROM reporting_jobs WHERE tenant_id = ?1 ORDER BY job_id",
    )
      .bind(owner.tenantId)
      .all<{ job_id: string }>();
    expect(jobs.results).toEqual([{ job_id: "fresh-job" }]);
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM oauth_pending WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(pending?.n).toBe(0);
  });

  it("retention通をチャンネル削除通と独立に処理する", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const old = new Date(Date.now() - 31 * DAY_MS).toISOString();
    await env.DB.prepare(
      `INSERT INTO videos
         (tenant_id, video_id, channel_id, title, published_at, content_type, fetched_at)
       VALUES (?1, 'expired-queue', ?2, '古いタイトル', '2025-01-01T00:00:00Z', 'long', ?3)`,
    )
      .bind(owner.tenantId, channelId, old)
      .run();
    const batch = createMessageBatch<CleanupMessage>("channel-cleanup-queue", [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        attempts: 1,
        body: { kind: "retention" as const },
      },
    ]);
    await worker.queue(batch, env);
    const row = await env.DB.prepare(
      "SELECT title, published_at FROM videos WHERE tenant_id = ?1 AND video_id = 'expired-queue'",
    )
      .bind(owner.tenantId)
      .first<{ title: string; published_at: string }>();
    expect(row).toEqual({ title: "動画情報の再取得待ち", published_at: "" });
  });
});
