// サムネイルの配信・取り直し・削除（qa-095・qa-098）
import { createMessageBatch, createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { CleanupMessage, ThumbnailMessage } from "../../src/env";
import worker from "../../src/index";
import { THUMBNAIL_SENDS_PER_DAY_MAX } from "../../src/usecases/queue-budget";
import {
  enqueueThumbnailPasses,
  processThumbnailMessage,
  purgeExpiredThumbnails,
  THUMBNAIL_ITEMS_PER_MESSAGE,
  thumbnailKey,
} from "../../src/usecases/thumbnails";
import wrangler from "../../wrangler.toml?raw";
import { insertChannel } from "../helpers/channels";
import { call, count, expectError, newOwner } from "../platform/helpers";
import { seedDashboard, videoId } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function putThumbnail(
  tenantId: string,
  vid: string,
  fetchedAt: Date,
  url = "https://i.ytimg.com/vi/x/mqdefault.jpg",
) {
  const key = thumbnailKey(tenantId, vid);
  await env.MEDIA.put(key, PNG, { httpMetadata: { contentType: "image/png" } });
  await env.DB.prepare(
    `INSERT INTO media_assets (tenant_id, asset_id, video_id, kind, r2_key, content_type, bytes, source_url, fetched_at)
     VALUES (?1, ?2, ?3, 'thumbnail', ?4, 'image/png', 8, ?5, ?6)`,
  )
    .bind(tenantId, `thumbnail:${vid}`, vid, key, url, fetchedAt.toISOString())
    .run();
  return key;
}

async function purgeTenant(userId: string, label: string): Promise<string> {
  const tenantId = `000-thumbnail-${label}-${crypto.randomUUID()}`;
  await env.DB.prepare(
    "INSERT INTO tenants (tenant_id, name, created_by, created_at) VALUES (?1, 'purge test', ?2, ?3)",
  )
    .bind(tenantId, userId, new Date().toISOString())
    .run();
  return tenantId;
}

const imageFetcher = (contentType = "image/jpeg", status = 200) =>
  vi.fn(async () => new Response(PNG, { status, headers: { "content-type": contentType } }));

async function thumbnailMessage(
  owner: Awaited<ReturnType<typeof newOwner>>,
  items: ThumbnailMessage["items"],
): Promise<ThumbnailMessage> {
  const channelId = `UC_thumb_${owner.tenantId}`;
  const connectedAt = new Date().toISOString();
  await insertChannel({
    tenantId: owner.tenantId,
    channelId,
    title: "thumbnail test",
    connectedBy: owner.userId,
    connectedAt,
  }).run();
  for (const item of items) {
    await env.DB.prepare(
      `INSERT INTO videos (tenant_id, video_id, channel_id, title, published_at, thumbnail_url, fetched_at)
       VALUES (?1, ?2, ?3, 'thumbnail test', ?4, ?5, ?4)`,
    )
      .bind(owner.tenantId, item.videoId, channelId, connectedAt, item.url)
      .run();
  }
  const row = await env.DB.prepare("SELECT import_generation FROM tenants WHERE tenant_id = ?1")
    .bind(owner.tenantId)
    .first<{ import_generation: number }>();
  return {
    kind: "thumbnail",
    tenantId: owner.tenantId,
    channelId,
    connectedAt,
    generation: row?.import_generation ?? 0,
    items,
  };
}

describe("GET /api/media/thumbnails/:video_id", () => {
  it("自テナントの30日以内の画像を private キャッシュで返し、ダッシュボードに hasThumbnail を出す", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId, videos: 2, days: 2 });
    const vid = videoId(owner.tenantId, 0);
    await putThumbnail(owner.tenantId, vid, new Date(Date.now() - 29 * DAY));
    const res = await call(`/api/media/thumbnails/${vid}`, { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);

    const dash = (await (await call("/api/dashboard", { cookie: owner.cookie })).json()) as {
      videos: { videoId: string; hasThumbnail: boolean }[];
    };
    expect(dash.videos.find((v) => v.videoId === vid)?.hasThumbnail).toBe(true);
    expect(dash.videos.find((v) => v.videoId !== vid)?.hasThumbnail).toBe(false);
  });

  it("他テナント・30日超・未保存・不正な ID は 404、未ログインは 401", async () => {
    const owner = await newOwner();
    const other = await newOwner("other");
    const theirs = videoId(other.tenantId, 0);
    await putThumbnail(other.tenantId, theirs, new Date());
    const old = videoId(owner.tenantId, 1);
    await putThumbnail(owner.tenantId, old, new Date(Date.now() - 31 * DAY));
    for (const id of [theirs, old, "none", "a%2F..%2Fb"]) {
      await expectError(
        await call(`/api/media/thumbnails/${id}`, { cookie: owner.cookie }),
        404,
        "NOT_FOUND",
      );
    }
    await expectError(await call(`/api/media/thumbnails/${theirs}`), 401, "UNAUTHENTICATED");
  });
});

describe("取り直しの送信（enqueueThumbnailPasses）", () => {
  it("未保存→URL変更→古い順に並べ、15件ずつの通で送り、新しいものは送らない", async () => {
    const owner = await newOwner();
    const { videoIds } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      videos: 44,
      days: 1,
    });
    // 0: 新しい（対象外）、1: URL が変わった、2: 26日前（取り直し対象）
    await putThumbnail(
      owner.tenantId,
      videoIds[0] as string,
      new Date(),
      `https://i.ytimg.com/vi/${videoIds[0]}/mqdefault.jpg`,
    );
    await putThumbnail(
      owner.tenantId,
      videoIds[1] as string,
      new Date(),
      "https://i.ytimg.com/vi/old/mqdefault.jpg",
    );
    await putThumbnail(
      owner.tenantId,
      videoIds[2] as string,
      new Date(Date.now() - 26 * DAY),
      `https://i.ytimg.com/vi/${videoIds[2]}/mqdefault.jpg`,
    );
    const sendBatch = vi.spyOn(env.THUMBNAIL_QUEUE, "sendBatch");
    try {
      const r = await enqueueThumbnailPasses({ env, now: new Date() }, owner.tenantId);
      expect(r).toEqual({ sent: 3, items: 43, deferred: false });
      const messages = sendBatch.mock.calls[0]?.[0] as { body: ThumbnailMessage }[];
      expect(messages.map((m) => m.body.items.length)).toEqual([15, 15, 13]);
      const ids = messages.flatMap((m) => m.body.items.map((i) => i.videoId));
      expect(ids).not.toContain(videoIds[0]);
      // 未保存 41本（公開日の新しい順）→ URL変更 → 26日前に保存したもの
      expect(ids[0]).toBe(videoIds[3]);
      expect(ids.at(-2)).toBe(videoIds[1]);
      expect(ids.at(-1)).toBe(videoIds[2]);
      expect(messages.every((m) => m.body.tenantId === owner.tenantId)).toBe(true);
    } finally {
      sendBatch.mockRestore();
    }
  });

  it("1,100本を超えるテナントは公開日の新しい1,000本だけを対象にする（1,100本ちょうどは全件）", async () => {
    // 動画 i は i 日前に公開。新しい1,000本は保存済み（新しい）にして、残りが送られるかを見る
    async function tenantWith(total: number) {
      const owner = await newOwner();
      const channelId = `UCcap_${owner.tenantId}`;
      await insertChannel({
        tenantId: owner.tenantId,
        channelId,
        title: "cap",
        connectedBy: owner.userId,
        connectedAt: new Date().toISOString(),
      }).run();
      await env.DB.prepare(
        `WITH RECURSIVE seq(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM seq WHERE i < ?2 - 1)
         INSERT INTO videos (tenant_id, video_id, channel_id, title, published_at, content_type, thumbnail_url, fetched_at)
         SELECT ?1, 'cap' || printf('%04d', i), ?3, 'v', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || i || ' days'),
                'long', 'https://i.ytimg.com/vi/cap' || i || '/mqdefault.jpg', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           FROM seq`,
      )
        .bind(owner.tenantId, total, channelId)
        .run();
      await env.DB.prepare(
        `INSERT INTO media_assets (tenant_id, asset_id, video_id, kind, r2_key, source_url, fetched_at)
         SELECT tenant_id, 'thumbnail:' || video_id, video_id, 'thumbnail', 'k/' || video_id, thumbnail_url,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           FROM videos WHERE tenant_id = ?1 ORDER BY published_at DESC LIMIT 1000`,
      )
        .bind(owner.tenantId)
        .run();
      return owner.tenantId;
    }
    const sendBatch = vi.spyOn(env.THUMBNAIL_QUEUE, "sendBatch");
    try {
      const over = await tenantWith(1101);
      expect(await enqueueThumbnailPasses({ env, now: new Date() }, over)).toEqual({
        sent: 0,
        items: 0,
        deferred: false,
      });
      const exact = await tenantWith(1100);
      const r = await enqueueThumbnailPasses({ env, now: new Date() }, exact);
      expect(r.items).toBe(45);
      const messages = (sendBatch.mock.calls[0]?.[0] ?? []) as { body: ThumbnailMessage }[];
      const ids = messages.flatMap((m) => m.body.items.map((i) => i.videoId));
      expect(ids[0]).toBe("cap1000");
    } finally {
      sendBatch.mockRestore();
    }
  });

  it("対象が無ければ送らず、1日の予算を超える見込みなら翌日に回す", async () => {
    const empty = await newOwner();
    expect(await enqueueThumbnailPasses({ env, now: new Date() }, empty.tenantId)).toEqual({
      sent: 0,
      items: 0,
      deferred: false,
    });
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId, videos: 1, days: 1 });
    // 他のテストと予算を共有しないよう、遠い日付の窓で上限まで使い切った状態を作る
    const now = new Date("2031-03-03T03:00:00Z");
    const windowStart = new Date(Math.floor(now.getTime() / DAY) * DAY).toISOString();
    await env.DB.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, ?3)")
      .bind("queue-ops:thumbnail:2031-03-03", windowStart, THUMBNAIL_SENDS_PER_DAY_MAX)
      .run();
    const sendBatch = vi.spyOn(env.THUMBNAIL_QUEUE, "sendBatch");
    try {
      expect(await enqueueThumbnailPasses({ env, now }, owner.tenantId)).toEqual({
        sent: 0,
        items: 0,
        deferred: true,
      });
      expect(sendBatch).not.toHaveBeenCalled();
    } finally {
      sendBatch.mockRestore();
    }
  });
});

describe("thumbnail 通の consumer（processThumbnailMessage）", () => {
  it("旧世代の通は画像取得前に破棄する", async () => {
    const owner = await newOwner();
    const msg = await thumbnailMessage(owner, [
      { videoId: "stalevideo", url: "https://i.ytimg.com/vi/stalevideo/mqdefault.jpg" },
    ]);
    await env.DB.prepare(
      "UPDATE tenants SET import_generation = import_generation + 1 WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .run();
    const fetcher = imageFetcher();
    expect(await processThumbnailMessage(env, msg, new Date(), fetcher)).toEqual({
      saved: 0,
      skipped: 1,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await env.MEDIA.head(thumbnailKey(owner.tenantId, "stalevideo", msg.generation)),
    ).toBeNull();
  });

  it("許可ホストの画像だけを R2 と media_assets へ保存し、再実行は上書きになる", async () => {
    const owner = await newOwner();
    const t = owner.tenantId;
    const fetcher = imageFetcher();
    const msg = await thumbnailMessage(owner, [
      { videoId: "okvideo", url: "https://i.ytimg.com/vi/okvideo/mqdefault.jpg" },
      { videoId: "evil", url: "https://example.com/a.jpg" },
      { videoId: "bad id", url: "https://i.ytimg.com/vi/x/a.jpg" },
    ]);
    const now = new Date();
    expect(await processThumbnailMessage(env, msg, now, fetcher)).toEqual({ saved: 1, skipped: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://i.ytimg.com/vi/okvideo/mqdefault.jpg", {
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
    expect(await env.MEDIA.head(thumbnailKey(t, "okvideo", msg.generation))).not.toBeNull();
    await processThumbnailMessage(env, msg, new Date(now.getTime() + 1000), fetcher);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id = ?1 AND kind = 'thumbnail'",
        t,
      ),
    ).toBe(1);
  });

  it("画像でない応答・エラー・リダイレクト・上限超過は保存しない", async () => {
    const owner = await newOwner();
    const item = { videoId: "v1", url: "https://i.ytimg.com/vi/v1/a.jpg" };
    const msg = await thumbnailMessage(owner, [item]);
    for (const f of [
      imageFetcher("text/html"),
      imageFetcher("image/jpeg", 404),
      vi.fn(
        async () => new Response(null, { status: 302, headers: { location: "https://evil.test" } }),
      ),
      vi.fn(
        async () =>
          new Response(new Uint8Array(3 * 1024 * 1024), {
            headers: { "content-type": "image/jpeg" },
          }),
      ),
    ]) {
      expect(await processThumbnailMessage(env, msg, new Date(), f)).toEqual({
        saved: 0,
        skipped: 1,
      });
    }
    expect(
      await count("SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(0);
  });

  it("時間切れ・通信失敗の件は飛ばし、同じ通の残りは保存する", async () => {
    const owner = await newOwner();
    const msg = await thumbnailMessage(owner, [
      { videoId: "slowvideo", url: "https://i.ytimg.com/vi/slowvideo/a.jpg" },
      { videoId: "fastvideo", url: "https://i.ytimg.com/vi/fastvideo/a.jpg" },
    ]);
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("slowvideo")) throw new DOMException("timed out", "TimeoutError");
      return new Response(PNG, { headers: { "content-type": "image/png" } });
    });
    expect(await processThumbnailMessage(env, msg, new Date(), fetcher)).toEqual({
      saved: 1,
      skipped: 1,
    });
  });

  it("1通の件数は上限までに切り詰める", async () => {
    const owner = await newOwner();
    const items = Array.from({ length: THUMBNAIL_ITEMS_PER_MESSAGE + 3 }, (_, i) => ({
      videoId: `v${i}`,
      url: `https://i.ytimg.com/vi/v${i}/a.jpg`,
    }));
    const fetcher = imageFetcher();
    await processThumbnailMessage(env, await thumbnailMessage(owner, items), new Date(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(THUMBNAIL_ITEMS_PER_MESSAGE);
  });
});

describe("30日超の削除（Cron 役割①）", () => {
  it("30日を超えた行と R2 オブジェクトだけを消す", async () => {
    const owner = await newOwner();
    const t = owner.tenantId;
    const oldKey = await putThumbnail(t, "old1", new Date(Date.now() - 31 * DAY));
    const newKey = await putThumbnail(t, "new1", new Date(Date.now() - 1 * DAY));
    const r = await purgeExpiredThumbnails(env, new Date());
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect(await env.MEDIA.head(oldKey)).toBeNull();
    expect(await env.MEDIA.head(newKey)).not.toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id = ?1", t)).toBe(1);
  });

  it("13テナント目はCronからcleanup Queueへ渡して当日中に消す", async () => {
    const owner = await newOwner("purge13");
    const tenants = [];
    for (let i = 0; i < 13; i++) tenants.push(await purgeTenant(owner.userId, "thirteen"));
    for (const tenantId of tenants)
      await putThumbnail(tenantId, "old", new Date(Date.now() - 40 * DAY));
    const send = vi.spyOn(env.CLEANUP_QUEUE, "send");
    try {
      await worker.scheduled(createScheduledController({ cron: "0 18 * * *" }), env);
      expect(send).toHaveBeenCalledWith({ kind: "thumbnail-retention" }, { delaySeconds: 60 });
      expect(
        await count(
          "SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id IN (SELECT value FROM json_each(?1))",
          JSON.stringify(tenants),
        ),
      ).toBe(1);
      const batch = createMessageBatch<CleanupMessage>("channel-cleanup-queue", [
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          attempts: 1,
          body: { kind: "thumbnail-retention" },
        },
      ]);
      await worker.queue(batch, env);
    } finally {
      send.mockRestore();
    }
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id IN (SELECT value FROM json_each(?1))",
        JSON.stringify(tenants),
      ),
    ).toBe(0);
  });

  it("同一テナントの1000件超もQueueへ再投入して消す", async () => {
    const owner = await newOwner("purge1001");
    const tenantId = await purgeTenant(owner.userId, "thousand");
    const ids = Array.from({ length: 1001 }, (_, i) => `old${i}`);
    await env.DB.prepare(
      `INSERT INTO media_assets
         (tenant_id, asset_id, video_id, kind, r2_key, source_url, fetched_at)
       SELECT ?1, 'thumbnail:' || j.value, j.value, 'thumbnail',
              'tenants/' || ?1 || '/thumbnails/' || j.value,
              'https://i.ytimg.com/vi/x/mqdefault.jpg', ?2
         FROM json_each(?3) j`,
    )
      .bind(tenantId, new Date(Date.now() - 40 * DAY).toISOString(), JSON.stringify(ids))
      .run();
    const batch = createMessageBatch<CleanupMessage>("channel-cleanup-queue", [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        attempts: 1,
        body: { kind: "thumbnail-retention" },
      },
    ]);
    const send = vi.spyOn(env.CLEANUP_QUEUE, "send");
    try {
      await worker.queue(batch, env);
      expect(send).toHaveBeenCalledWith({ kind: "thumbnail-retention" }, { delaySeconds: 60 });
      expect(
        await count("SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id = ?1", tenantId),
      ).toBe(1);
      await worker.queue(batch, env);
      expect(
        await count("SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id = ?1", tenantId),
      ).toBe(0);
    } finally {
      send.mockRestore();
    }
  });
});

describe("Queue と Cron の構成", () => {
  it("thumbnail-queue を専用 consumer で処理し、Cron は削除要求とサムネイル削除を行う", async () => {
    expect(wrangler).toContain('binding = "THUMBNAIL_QUEUE"');
    expect(wrangler).toContain('queue = "thumbnail-queue"');
    const owner = await newOwner();
    const body = await thumbnailMessage(owner, [
      { videoId: "x", url: "https://example.com/x.jpg" },
    ]);
    const batch = createMessageBatch<ThumbnailMessage>("thumbnail-queue", [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        attempts: 1,
        body,
      },
    ]);
    await expect(worker.queue(batch, env)).resolves.toBeUndefined();

    const wrong = createMessageBatch("thumbnail-queue", [
      { id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { kind: "cleanup" } },
    ]);
    await expect(worker.queue(wrong as never, env)).rejects.toThrow("Unexpected thumbnail message");

    const oldKey = await putThumbnail(owner.tenantId, "cronold", new Date(Date.now() - 45 * DAY));
    await worker.scheduled(createScheduledController({ cron: "0 18 * * *" }), env);
    expect(await env.MEDIA.head(oldKey)).toBeNull();
  });
});
