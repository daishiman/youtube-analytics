import { createMessageBatch, createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { YOUTUBE_ANALYTICS_REPORTS_URL } from "../../src/adapters/google-analytics";
import { ANALYTICS_DIMENSION_SPECS } from "../../src/adapters/google-analytics-dimensions";
import {
  classifyVideo,
  YOUTUBE_PLAYLIST_ITEMS_URL,
  YOUTUBE_VIDEOS_URL,
} from "../../src/adapters/google-data-videos";
import { GOOGLE_TOKEN_URL } from "../../src/adapters/google-youtube";
import type { AnalyticsDimensionsMessage, CollectMessage, ReportingMessage } from "../../src/env";
import worker from "../../src/index";
import { YoutubeCollectorRepository } from "../../src/repositories/youtube-collector-repository";
import { REPORT_LISTS_PER_MESSAGE } from "../../src/usecases/reporting-sync";
import {
  collectionDateRange,
  collectTenantDaily,
  enqueueDailyCollections,
} from "../../src/usecases/youtube-collector";
import { newLinkedOwner } from "../helpers/channels";
import { call } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const NOW = new Date("2026-09-25T03:00:00.000Z");

async function failures(tenantId: string) {
  const { results } = await env.DB.prepare(
    `SELECT kind, report_key, token_updated_at FROM collection_series_status
      WHERE tenant_id = ?1 AND status = 'failed' ORDER BY kind, report_key`,
  )
    .bind(tenantId)
    .all<{ kind: string; report_key: string; token_updated_at: string }>();
  return results;
}

async function linked() {
  const { owner, channelId: id } = await newLinkedOwner("collector");
  const messages = await new YoutubeCollectorRepository(env.DB).listActiveConnections();
  const message = messages.find((item) => item.tenantId === owner.tenantId);
  expect(message).toBeDefined();
  if (!message) throw new Error("missing collect message");
  return { owner, id, message };
}

function mockCollection(onAnalytics?: () => Promise<void>, pages = 1) {
  const requested: URL[] = [];
  let selectedChannel = "";
  const firstVideoId = "video000001";
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.href.startsWith(GOOGLE_TOKEN_URL)) {
      const form = new URLSearchParams(String(init?.body ?? ""));
      expect(form.get("grant_type")).toBe("refresh_token");
      expect(form.get("client_id")).toContain("apps.googleusercontent.com");
      return Response.json({ access_token: "collected-access-token" });
    }
    if (url.href.startsWith(YOUTUBE_ANALYTICS_REPORTS_URL)) {
      requested.push(url);
      expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(
        "Bearer collected-access-token",
      );
      if (url.searchParams.get("dimensions") === "day") await onAnalytics?.();
      const endDate = url.searchParams.get("endDate") ?? "";
      if (url.searchParams.get("dimensions") === "day,video") {
        const videoId =
          url.searchParams
            .get("filters")
            ?.replace(/^video==/, "")
            .split(",")[0] ?? "";
        return Response.json({
          columnHeaders: [
            { name: "averageViewPercentage" },
            { name: "video" },
            { name: "day" },
            { name: "views" },
            { name: "estimatedMinutesWatched" },
          ],
          rows: [[62.5, videoId, endDate, 12, 34]],
        });
      }
      return Response.json({
        columnHeaders: [
          { name: "subscribersLost" },
          { name: "day" },
          { name: "estimatedMinutesWatched" },
          { name: "views" },
          { name: "subscribersGained" },
        ],
        rows: [[1, endDate, 123, 45, 3]],
      });
    }
    if (url.pathname === "/youtube/v3/channels") {
      selectedChannel = url.searchParams.get("id") ?? "";
      expect(url.searchParams.get("part")).toBe("contentDetails,snippet,statistics");
      return Response.json({
        items: [
          {
            id: selectedChannel,
            contentDetails: { relatedPlaylists: { uploads: "UUtest" } },
            snippet: {
              title: "更新後のチャンネル",
              thumbnails: { default: { url: "https://yt3.ggpht.com/channel.jpg" } },
            },
            statistics: { subscriberCount: "123" },
          },
        ],
      });
    }
    if (url.href.startsWith(YOUTUBE_PLAYLIST_ITEMS_URL)) {
      const next = url.searchParams.get("pageToken") === "p2";
      const ids =
        pages === 2 && !next
          ? Array.from({ length: 50 }, (_, i) => `video${String(i + 1).padStart(6, "0")}`)
          : [pages === 2 ? "video000051" : firstVideoId];
      return Response.json({
        items: ids.map((videoId) => ({ contentDetails: { videoId } })),
        ...(pages === 2 && !next ? { nextPageToken: "p2" } : {}),
      });
    }
    if (url.href.startsWith(YOUTUBE_VIDEOS_URL)) {
      const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
      return Response.json({
        items: ids.map((videoId) => ({
          id: videoId,
          snippet: {
            channelId: selectedChannel,
            title: "収集された動画",
            publishedAt: "2026-09-01T00:00:00Z",
            thumbnails: { high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` } },
          },
          contentDetails: { duration: "PT4M" },
        })),
      });
    }
    throw new Error(`unexpected request: ${url.origin}${url.pathname}`);
  });
  return { requested, fetchMock };
}

describe("YouTube Analytics 日次収集", () => {
  it("Data API だけでは Shorts と確定せず、ライブと長尺の根拠を分ける", () => {
    expect(classifyVideo({ duration: "PT2M" })).toBe("unknown");
    expect(classifyVideo({ duration: "PT4M" })).toBe("long");
    expect(classifyVideo({ duration: "PT4M", liveStreamingDetails: {} })).toBe("live");
    expect(classifyVideo({ liveBroadcastContent: "upcoming" })).toBe("live");
    expect(classifyVideo({})).toBe("unknown");
  });

  it("連携中のチャンネルだけを収集 Queue に送る", async () => {
    const { message } = await linked();
    const sendBatch = vi.spyOn(env.COLLECT_QUEUE, "sendBatch");
    const count = await enqueueDailyCollections(env);
    expect(count).toBeGreaterThanOrEqual(1);
    expect(sendBatch).toHaveBeenCalledWith(
      expect.arrayContaining([{ body: { ...message, cycleStartedAt: expect.any(String) } }]),
    );
  });

  it("OAuth クライアントを Worker 側で管理する連携も収集対象にする", async () => {
    const { owner, message } = await linked();
    await env.DB.prepare("DELETE FROM tenant_google_clients WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    const repository = new YoutubeCollectorRepository(env.DB);
    expect(await repository.listActiveConnections()).toContainEqual(message);
    expect(await repository.isCurrent(message)).toBe(true);
    await repository.saveDaily(
      message,
      [
        {
          date: collectionDateRange(NOW).endDate,
          views: 1,
          estimatedMinutesWatched: 2,
          subscribersGained: 0,
          subscribersLost: 0,
        },
      ],
      NOW.toISOString(),
    );
    const metric = await env.DB.prepare(
      "SELECT views FROM daily_metrics WHERE tenant_id = ?1 AND channel_id = ?2",
    )
      .bind(owner.tenantId, message.channelId)
      .first<{ views: number }>();
    expect(metric?.views).toBe(1);
  });

  it("日次Cronは基本日次・Reporting・Analyticsの3系列を同じ連携世代で投入する", async () => {
    const { message } = await linked();
    const sendBatch = vi.spyOn(env.COLLECT_QUEUE, "sendBatch");
    await worker.scheduled(createScheduledController({ cron: "0 18 * * *" }), env);
    const queued = sendBatch.mock.calls.flatMap(([batch]) =>
      Array.from(batch, (item) => item.body),
    );
    const forTenant = queued.filter((item) => item.tenantId === message.tenantId);
    expect(forTenant.map((item) => item.kind).sort()).toEqual([
      "analytics-dimensions",
      "analytics-dimensions",
      "analytics-dimensions",
      "collect",
      "reporting",
    ]);
    expect(
      forTenant.map((item) => ({
        channelId: item.channelId,
        connectedAt: item.connectedAt,
        tokenUpdatedAt: item.tokenUpdatedAt,
        cycleStartedAt: item.cycleStartedAt,
      })),
    ).toEqual(
      Array.from({ length: 5 }, () => ({
        channelId: message.channelId,
        connectedAt: message.connectedAt,
        tokenUpdatedAt: message.tokenUpdatedAt,
        cycleStartedAt: expect.any(String),
      })),
    );
  });

  it("収集窓は Pacific の今日を除く直近35日で、夏時間と冬時間の日付境界に従う", () => {
    expect(collectionDateRange(NOW)).toEqual({ startDate: "2026-08-20", endDate: "2026-09-23" });
    // 夏時間（UTC-7）: 07:00Z で Pacific の日付が変わる
    expect(collectionDateRange(new Date("2026-09-26T06:59:59.000Z"))).toEqual({
      startDate: "2026-08-21",
      endDate: "2026-09-24",
    });
    expect(collectionDateRange(new Date("2026-09-26T07:00:00.000Z"))).toEqual({
      startDate: "2026-08-22",
      endDate: "2026-09-25",
    });
    // 冬時間（UTC-8）: 08:00Z で変わり、年をまたいでも35日を保つ
    expect(collectionDateRange(new Date("2026-01-15T07:59:59.000Z"))).toEqual({
      startDate: "2025-12-10",
      endDate: "2026-01-13",
    });
    expect(collectionDateRange(new Date("2026-01-15T08:00:00.000Z"))).toEqual({
      startDate: "2025-12-11",
      endDate: "2026-01-14",
    });
  });

  it("Pacific 日付の35日窓を問い合わせ、返却行だけをチャンネル all に保存する", async () => {
    const { owner, id, message } = await linked();
    await env.DB.prepare(
      `UPDATE channels SET title = 'チャンネル情報の再取得待ち', thumbnail_url = NULL,
         subscriber_count = NULL, metadata_fetched_at = ?1 WHERE tenant_id = ?2`,
    )
      .bind(new Date(NOW.getTime() - 31 * 86_400_000).toISOString(), owner.tenantId)
      .run();
    const { requested } = mockCollection();
    expect(await collectTenantDaily(env, message, NOW)).toBe("collected");

    const { startDate, endDate } = collectionDateRange(NOW);
    expect({ startDate, endDate }).toEqual({ startDate: "2026-08-20", endDate: "2026-09-23" });
    expect(requested).toHaveLength(2);
    expect(requested[0]?.searchParams.get("ids")).toBe(`channel==${id}`);
    expect(requested[0]?.searchParams.get("startDate")).toBe(startDate);
    expect(requested[0]?.searchParams.get("endDate")).toBe(endDate);
    expect(requested[0]?.searchParams.get("dimensions")).toBe("day");
    // 動画別もチャンネル日次と同じ窓で問い合わせる（窓がずれると動画の合計とチャンネル値が食い違う）
    expect(requested[1]?.searchParams.get("dimensions")).toBe("day,video");
    expect(requested[1]?.searchParams.get("startDate")).toBe(startDate);
    expect(requested[1]?.searchParams.get("endDate")).toBe(endDate);
    const { results } = await env.DB.prepare(
      "SELECT date, content_type, views, estimated_minutes_watched, subscribers_gained, subscribers_lost FROM daily_metrics WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .all();
    expect(results).toEqual([
      {
        date: endDate,
        content_type: "all",
        views: 45,
        estimated_minutes_watched: 123,
        subscribers_gained: 3,
        subscribers_lost: 1,
      },
    ]);
    const channel = await env.DB.prepare(
      `SELECT last_collected_at, title, thumbnail_url, subscriber_count, metadata_fetched_at
         FROM channels WHERE tenant_id = ?1`,
    )
      .bind(owner.tenantId)
      .first();
    expect(channel).toEqual({
      last_collected_at: NOW.toISOString(),
      title: "更新後のチャンネル",
      thumbnail_url: "https://yt3.ggpht.com/channel.jpg",
      subscriber_count: 123,
      metadata_fetched_at: NOW.toISOString(),
    });
    const video = await env.DB.prepare(
      "SELECT title, content_type, duration_seconds, has_live_streaming_details FROM videos WHERE tenant_id = ?1 AND video_id = 'video000001'",
    )
      .bind(owner.tenantId)
      .first();
    expect(video).toEqual({
      title: "収集された動画",
      content_type: "long",
      duration_seconds: 240,
      has_live_streaming_details: 0,
    });
    const videoMetric = await env.DB.prepare(
      "SELECT views, estimated_minutes_watched, average_view_percentage FROM video_metrics WHERE tenant_id = ?1 AND video_id = 'video000001'",
    )
      .bind(owner.tenantId)
      .first();
    expect(videoMetric).toEqual({
      views: 12,
      estimated_minutes_watched: 34,
      average_view_percentage: 62.5,
    });
    expect(await collectTenantDaily(env, message, NOW)).toBe("collected");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM daily_metrics WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("再連携前の通を API 呼び出し前に捨てる", async () => {
    const { owner, message } = await linked();
    await env.DB.prepare("UPDATE channel_oauth_tokens SET updated_at = ?2 WHERE tenant_id = ?1")
      .bind(owner.tenantId, "2026-09-26T00:00:00.000Z")
      .run();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockClear();
    expect(await collectTenantDaily(env, message, NOW)).toBe("stale");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("収集 Queue の正しい通を consumer が処理する", async () => {
    const { owner, message } = await linked();
    mockCollection();
    const batch = createMessageBatch<CollectMessage>("collect-queue", [
      { id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: message },
    ]);
    await expect(worker.queue(batch, env)).resolves.toBeUndefined();
    const row = await env.DB.prepare(
      "SELECT views FROM daily_metrics WHERE tenant_id = ?1 AND content_type = 'all'",
    )
      .bind(owner.tenantId)
      .first<{ views: number }>();
    expect(row?.views).toBe(45);
  });

  it("永久エラーを現行テナントに記録し、ダッシュボードに失敗を表示する", async () => {
    const { owner, message } = await linked();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: { message: "invalid_grant" } }, { status: 400 }),
    );
    const batch = createMessageBatch<CollectMessage>("collect-queue", [
      { id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: message },
    ]);
    await worker.queue(batch, env);
    expect(await failures(owner.tenantId)).toMatchObject([{ kind: "collect", report_key: "" }]);

    const dashboard = await call("/api/dashboard", { cookie: owner.cookie });
    expect(dashboard.status).toBe(200);
    const body = (await dashboard.json()) as {
      collection: { status: string; lastSucceededAt: string | null };
    };
    expect(body.collection.status).toContain("収集失敗あり");
    expect(body.collection.lastSucceededAt).toBeNull();

    vi.restoreAllMocks();
    mockCollection();
    expect(await collectTenantDaily(env, message, NOW)).toBe("collected");
    expect(await failures(owner.tenantId)).toEqual([]);
    const recovered = await call("/api/dashboard", { cookie: owner.cookie });
    const recoveredBody = (await recovered.json()) as {
      collection: { status: string; lastSucceededAt: string | null };
    };
    expect(recoveredBody.collection.status).not.toContain("収集失敗あり");
    expect(recoveredBody.collection.lastSucceededAt).toBe(NOW.toISOString());
  });

  it("Reporting の権限不足も収集失敗として残す", async () => {
    const { owner, message } = await linked();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.startsWith(GOOGLE_TOKEN_URL)) {
        return Response.json({ access_token: "reporting-access" });
      }
      return Response.json({}, { status: 403 });
    });
    const batch = createMessageBatch<ReportingMessage>("collect-queue", [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        attempts: 1,
        body: { ...message, kind: "reporting" },
      },
    ]);
    await worker.queue(batch, env);
    expect(await failures(owner.tenantId)).toMatchObject([{ kind: "reporting", report_key: "" }]);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.startsWith(GOOGLE_TOKEN_URL)) {
        return Response.json({ access_token: "reporting-access" });
      }
      if (url.pathname === "/v1/reportTypes") return Response.json({ reportTypes: [] });
      if (url.pathname === "/v1/jobs") {
        // 1通の一覧上限を超えるジョブ数にして、続きの通が出るまで失敗を残すことを確かめる
        return Response.json({
          jobs: Array.from({ length: REPORT_LISTS_PER_MESSAGE + 1 }, (_, i) => ({
            id: `job-${String(i).padStart(2, "0")}`,
            reportTypeId: `type_${i}`,
          })),
        });
      }
      if (url.pathname.endsWith("/reports")) return Response.json({ reports: [] });
      throw new Error(`unexpected Reporting URL: ${url.pathname}`);
    });
    const send = vi.spyOn(env.COLLECT_QUEUE, "send");
    const first = createMessageBatch<ReportingMessage>("collect-queue", [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        attempts: 1,
        body: { ...message, kind: "reporting" },
      },
    ]);
    await worker.queue(first, env);
    expect(await failures(owner.tenantId)).toMatchObject([{ kind: "reporting", report_key: "" }]);
    const next = send.mock.calls
      .map(([body]) => body)
      .find(
        (body): body is ReportingMessage =>
          body.kind === "reporting" && body.jobOffset === REPORT_LISTS_PER_MESSAGE,
      );
    expect(next).toBeDefined();
    if (!next) throw new Error("missing reporting continuation");
    await worker.queue(
      createMessageBatch<ReportingMessage>("collect-queue", [
        { id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: next },
      ]),
      env,
    );
    expect(await failures(owner.tenantId)).toEqual([]);
  });

  it("Analytics 属性は reportKey ごとの成功だけ失敗を解除する", async () => {
    const { owner, message } = await linked();
    const repo = new YoutubeCollectorRepository(env.DB);
    const traffic: AnalyticsDimensionsMessage = {
      ...message,
      kind: "analytics-dimensions",
      reportKey: "traffic_daily",
    };
    const device: AnalyticsDimensionsMessage = {
      ...message,
      kind: "analytics-dimensions",
      reportKey: "device_daily",
    };
    await repo.markFailed(device, NOW.toISOString());
    let unavailable = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.startsWith(GOOGLE_TOKEN_URL)) {
        return Response.json({ access_token: "dimension-access" });
      }
      if (unavailable) return Response.json({}, { status: 400 });
      const spec = ANALYTICS_DIMENSION_SPECS.traffic_daily;
      return Response.json({
        columnHeaders: [...spec.dimensions, ...spec.metrics].map((name) => ({ name })),
        rows: [],
      });
    });
    const batch = () =>
      createMessageBatch<AnalyticsDimensionsMessage>("collect-queue", [
        { id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: traffic },
      ]);
    await worker.queue(batch(), env);
    expect(await failures(owner.tenantId)).toMatchObject([
      { kind: "analytics-dimensions", report_key: "device_daily" },
      { kind: "analytics-dimensions", report_key: "traffic_daily" },
    ]);
    unavailable = false;
    await worker.queue(batch(), env);
    expect(await failures(owner.tenantId)).toMatchObject([
      { kind: "analytics-dimensions", report_key: "device_daily" },
    ]);
  });

  it("再試行上限では一時エラーも記録し、連携世代が古い通は現行状態を壊さない", async () => {
    const { owner, message } = await linked();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 503 }));
    const first = createMessageBatch<CollectMessage>("collect-queue", [
      { id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: message },
    ]);
    await worker.queue(first, env);
    expect(await failures(owner.tenantId)).toEqual([]);

    const final = createMessageBatch<CollectMessage>("collect-queue", [
      { id: crypto.randomUUID(), timestamp: new Date(), attempts: 4, body: message },
    ]);
    await worker.queue(final, env);
    expect(await failures(owner.tenantId)).toMatchObject([{ kind: "collect", report_key: "" }]);

    await env.DB.prepare("UPDATE channel_oauth_tokens SET updated_at = ?2 WHERE tenant_id = ?1")
      .bind(owner.tenantId, "2026-09-26T00:00:00.000Z")
      .run();
    await new YoutubeCollectorRepository(env.DB).markFailed(message, NOW.toISOString());
    expect(await failures(owner.tenantId)).toMatchObject([
      { kind: "collect", report_key: "", token_updated_at: message.tokenUpdatedAt },
    ]);
    const dashboard = await call("/api/dashboard", { cookie: owner.cookie });
    const body = (await dashboard.json()) as { collection: { status: string } };
    expect(body.collection.status).not.toContain("収集失敗あり");

    const repository = new YoutubeCollectorRepository(env.DB);
    const currentMessage = { ...message, tokenUpdatedAt: "2026-09-26T00:00:00.000Z" };
    await repository.markFailed(currentMessage, NOW.toISOString());
    await repository.clearFailure(message, NOW.toISOString());
    expect(await failures(owner.tenantId)).toMatchObject([
      { kind: "collect", report_key: "", token_updated_at: currentMessage.tokenUpdatedAt },
    ]);
  });

  it("同じ連携世代でも古い成功・失敗は新しいサイクルの状態を巻き戻さない", async () => {
    const { owner, message } = await linked();
    const repository = new YoutubeCollectorRepository(env.DB);
    const connected = Date.parse(message.connectedAt);
    const old = { ...message, cycleStartedAt: new Date(connected + 1_000).toISOString() };
    const current = { ...message, cycleStartedAt: new Date(connected + 2_000).toISOString() };
    await repository.markFailed(current, NOW.toISOString());
    await repository.markCompleted(old, new Date(NOW.getTime() + 1_000).toISOString());
    expect(await failures(owner.tenantId)).toMatchObject([{ kind: "collect", report_key: "" }]);
    const channel = await env.DB.prepare(
      "SELECT last_collected_at FROM channels WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ last_collected_at: string | null }>();
    expect(channel?.last_collected_at).toBeNull();

    await repository.markCompleted(current, NOW.toISOString());
    expect(await failures(owner.tenantId)).toEqual([]);
    await repository.markFailed(old, new Date(NOW.getTime() + 2_000).toISOString());
    await repository.markFailed(message, new Date(NOW.getTime() + 3_000).toISOString());
    await repository.markFailed(current, new Date(NOW.getTime() + 4_000).toISOString());
    expect(await failures(owner.tenantId)).toEqual([]);
    const state = await env.DB.prepare(
      `SELECT status, cycle_started_at FROM collection_series_status
        WHERE tenant_id = ?1 AND kind = 'collect'`,
    )
      .bind(owner.tenantId)
      .first<{ status: string; cycle_started_at: string }>();
    expect(state).toEqual({ status: "ok", cycle_started_at: current.cycleStartedAt });
  });

  it("uploads の2ページ目を世代付きで継続し、最後まで成功してから完了日時を更新する", async () => {
    const { owner, message: linkedMessage } = await linked();
    const message = { ...linkedMessage, cycleStartedAt: NOW.toISOString() };
    await new YoutubeCollectorRepository(env.DB).markFailed(message, NOW.toISOString());
    mockCollection(undefined, 2);
    const send = vi.spyOn(env.COLLECT_QUEUE, "send");
    expect(await collectTenantDaily(env, message, NOW)).toBe("collected");
    const first = await env.DB.prepare(
      "SELECT last_collected_at FROM channels WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ last_collected_at: string | null }>();
    expect(first?.last_collected_at).toBeNull();
    expect(await failures(owner.tenantId)).toMatchObject([{ kind: "collect", report_key: "" }]);
    const next = send.mock.calls
      .map(([body]) => body)
      .find((body): body is CollectMessage => body.kind === "collect" && body.pageToken === "p2");
    expect(next).toMatchObject({
      tenantId: message.tenantId,
      channelId: message.channelId,
      connectedAt: message.connectedAt,
      tokenUpdatedAt: message.tokenUpdatedAt,
      cycleStartedAt: message.cycleStartedAt,
      uploadsPlaylistId: "UUtest",
      pageToken: "p2",
    });
    if (!next) throw new Error("missing continuation");
    expect(await collectTenantDaily(env, next, NOW)).toBe("collected");
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM videos WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(count?.n).toBe(51);
    const final = await env.DB.prepare(
      "SELECT last_collected_at FROM channels WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ last_collected_at: string | null }>();
    expect(final?.last_collected_at).toBe(NOW.toISOString());
    expect(await failures(owner.tenantId)).toEqual([]);
  });

  it("最後のページを保存し終えてからサムネイルの取り直しを送り、送信失敗でも収集は成功のまま", async () => {
    const { message: linkedMessage } = await linked();
    const message = { ...linkedMessage, cycleStartedAt: NOW.toISOString() };
    mockCollection(undefined, 2);
    const sendBatch = vi.spyOn(env.THUMBNAIL_QUEUE, "sendBatch");
    const send = vi.spyOn(env.COLLECT_QUEUE, "send");
    expect(await collectTenantDaily(env, message, NOW)).toBe("collected");
    // 途中のページではまだ送らない（動画一覧が出そろってから選ぶ）
    expect(sendBatch).not.toHaveBeenCalled();
    const next = send.mock.calls
      .map(([body]) => body)
      .find((body): body is CollectMessage => body.kind === "collect" && body.pageToken === "p2");
    if (!next) throw new Error("missing continuation");
    sendBatch.mockRejectedValueOnce(new Error("queue unavailable"));
    expect(await collectTenantDaily(env, next, NOW)).toBe("collected");
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(await failures(message.tenantId)).toEqual([]);
  });

  it("通信中に削除予約された連携の指標を保存しない", async () => {
    const { owner, message } = await linked();
    mockCollection(async () => {
      await env.DB.prepare(
        `INSERT INTO data_deletions (deletion_id, tenant_id, scope, requested_by, requested_at, due_at)
         VALUES (?1, ?2, 'channel', ?3, ?4, ?4)`,
      )
        .bind(crypto.randomUUID(), owner.tenantId, owner.userId, NOW.toISOString())
        .run();
    });
    expect(await collectTenantDaily(env, message, NOW)).toBe("stale");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM daily_metrics WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("最終確認直後に削除予約されても条件付き保存が後着地を防ぐ", async () => {
    const { owner, message } = await linked();
    const repository = new YoutubeCollectorRepository(env.DB);
    expect(await repository.isCurrent(message)).toBe(true);
    await env.DB.prepare(
      `INSERT INTO data_deletions (deletion_id, tenant_id, scope, requested_by, requested_at, due_at)
       VALUES (?1, ?2, 'channel', ?3, ?4, ?4)`,
    )
      .bind(crypto.randomUUID(), owner.tenantId, owner.userId, NOW.toISOString())
      .run();
    await repository.saveDaily(
      message,
      [
        {
          date: collectionDateRange(NOW).endDate,
          views: 45,
          estimatedMinutesWatched: 123,
          subscribersGained: 3,
          subscribersLost: 1,
        },
      ],
      NOW.toISOString(),
    );
    const metrics = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM daily_metrics WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    const channel = await env.DB.prepare(
      "SELECT last_collected_at FROM channels WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ last_collected_at: string | null }>();
    expect(metrics?.n).toBe(0);
    expect(channel?.last_collected_at).toBeNull();
  });

  it("動画別501行を少数の JSON1 クエリで保存し、再実行でも重複しない", async () => {
    const { owner, message } = await linked();
    const repository = new YoutubeCollectorRepository(env.DB);
    const ids = Array.from({ length: 15 }, (_, i) => `bulk${String(i).padStart(7, "0")}`);
    await repository.saveVideos(
      message,
      ids.map((videoId) => ({
        videoId,
        title: videoId,
        publishedAt: "2026-08-01T00:00:00.000Z",
        contentType: "unknown" as const,
        durationSeconds: null,
        liveBroadcastContent: null,
        hasLiveStreamingDetails: false,
        thumbnailUrl: null,
      })),
      NOW.toISOString(),
    );
    const rows = Array.from({ length: 501 }, (_, i) => ({
      videoId: ids[i % 15] ?? "",
      date: new Date(Date.parse("2026-08-01T00:00:00Z") + Math.floor(i / 15) * 86_400_000)
        .toISOString()
        .slice(0, 10),
      views: i,
      estimatedMinutesWatched: i * 2,
      averageViewPercentage: i === 500 ? null : 42.5,
    }));
    await repository.saveVideoDaily(message, rows, NOW.toISOString());
    const later = new Date(NOW.getTime() + 86_400_000).toISOString();
    await repository.saveVideoDaily(message, rows, later);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM video_metrics WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(count?.n).toBe(501);
    const first = rows[0];
    if (!first) throw new Error("missing first row");
    const unchanged = await env.DB.prepare(
      "SELECT fetched_at FROM video_metrics WHERE tenant_id = ?1 AND video_id = ?2 AND date = ?3",
    )
      .bind(owner.tenantId, first.videoId, first.date)
      .first<{ fetched_at: string }>();
    expect(unchanged?.fetched_at).toBe(NOW.toISOString());
  });

  it("既存の Shorts 確定値を Data API の unknown 推定で上書きしない", async () => {
    const { owner, message } = await linked();
    await env.DB.prepare(
      `INSERT INTO videos
        (tenant_id, video_id, channel_id, title, published_at, content_type, fetched_at)
       VALUES (?1, 'short123456', ?2, '確定済み', ?3, 'shorts', ?3)`,
    )
      .bind(owner.tenantId, message.channelId, NOW.toISOString())
      .run();
    await new YoutubeCollectorRepository(env.DB).saveVideos(
      message,
      [
        {
          videoId: "short123456",
          title: "更新済み",
          publishedAt: NOW.toISOString(),
          contentType: "unknown",
          durationSeconds: 120,
          liveBroadcastContent: "none",
          hasLiveStreamingDetails: false,
          thumbnailUrl: null,
        },
      ],
      NOW.toISOString(),
    );
    const row = await env.DB.prepare(
      "SELECT title, content_type FROM videos WHERE tenant_id = ?1 AND video_id = 'short123456'",
    )
      .bind(owner.tenantId)
      .first();
    expect(row).toEqual({ title: "更新済み", content_type: "shorts" });
  });
});
