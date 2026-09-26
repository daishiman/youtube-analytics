import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_DIMENSIONS_URL } from "../../src/adapters/google-analytics-dimensions";
import { GOOGLE_TOKEN_URL } from "../../src/adapters/google-youtube";
import type { AnalyticsDimensionsMessage } from "../../src/env";
import { AnalyticsRawRepository } from "../../src/repositories/analytics-raw-repository";
import {
  collectChannelDimensions,
  dimensionMessages,
} from "../../src/usecases/analytics-dimensions";
import { collectionDateRange } from "../../src/usecases/youtube-collector";
import { newLinkedOwner } from "../helpers/channels";

afterEach(() => vi.restoreAllMocks());

const NOW = new Date("2026-09-25T03:00:00.000Z");

function messageAt(
  messages: AnalyticsDimensionsMessage[],
  index: number,
): AnalyticsDimensionsMessage {
  const message = messages[index];
  if (!message) throw new Error(`missing dimension message ${index}`);
  return message;
}

async function linked() {
  const { owner, channelId } = await newLinkedOwner("dimension");
  const row = await env.DB.prepare(
    `SELECT c.connected_at, o.updated_at FROM channels c
       JOIN channel_oauth_tokens o ON o.tenant_id = c.tenant_id
      WHERE c.tenant_id = ?1`,
  )
    .bind(owner.tenantId)
    .first<{ connected_at: string; updated_at: string }>();
  if (!row) throw new Error("linked channel missing");
  const messages = dimensionMessages({
    tenantId: owner.tenantId,
    channelId,
    connectedAt: row.connected_at,
    tokenUpdatedAt: row.updated_at,
  });
  return { owner, channelId, messages };
}

function headers(...names: string[]) {
  return names.map((name, index) => ({
    name,
    columnType: index < (names[0] === "country" ? 1 : 2) ? "DIMENSION" : "METRIC",
    dataType: index < (names[0] === "country" ? 1 : 2) ? "STRING" : "INTEGER",
  }));
}

function mockAnalytics(handler: (url: URL) => Response | Promise<Response>) {
  const requested: URL[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.href.startsWith(GOOGLE_TOKEN_URL)) {
      expect(new URLSearchParams(String(init?.body ?? "")).get("grant_type")).toBe("refresh_token");
      return Response.json({ access_token: "dimension-access-token" });
    }
    if (url.href.startsWith(ANALYTICS_DIMENSIONS_URL)) {
      expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(
        "Bearer dimension-access-token",
      );
      requested.push(url);
      return handler(url);
    }
    throw new Error(`unexpected request ${url.href}`);
  });
  return requested;
}

describe("Analytics 多次元レポート原本", () => {
  it("OAuth クライアントの D1 行がなくても有効な連携を保存できる", async () => {
    const { owner, messages } = await linked();
    const message = messageAt(messages, 0);
    await env.DB.prepare("DELETE FROM tenant_google_clients WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    const repository = new AnalyticsRawRepository(env.DB);
    expect(await repository.isCurrent(message)).toBe(true);
    await repository.replaceReport(
      message,
      collectionDateRange(NOW),
      { availability: "available", columnHeaders: [], rows: [] },
      NOW.toISOString(),
    );
    expect((await repository.listReports(owner.tenantId)).reports).toMatchObject([
      { reportKey: message.reportKey, availability: "available", rowCount: 0 },
    ]);
  });

  it("流入元・端末は日次、国は期間集計を問い合わせ、列順・0・null を保持する", async () => {
    const { owner, channelId, messages } = await linked();
    const { endDate, startDate } = collectionDateRange(NOW);
    const requested = mockAnalytics((url) => {
      const dimensions = url.searchParams.get("dimensions");
      if (dimensions === "day,insightTrafficSourceType") {
        return Response.json({
          columnHeaders: headers(
            "day",
            "insightTrafficSourceType",
            "views",
            "estimatedMinutesWatched",
            "engagedViews",
            "extraColumn",
          ),
          rows: [[endDate, "YT_SEARCH", 0, null, 3, "source-value"]],
        });
      }
      if (dimensions === "day,deviceType") {
        return Response.json({
          columnHeaders: headers(
            "day",
            "deviceType",
            "views",
            "estimatedMinutesWatched",
            "engagedViews",
          ),
          rows: [[endDate, "MOBILE", 10, 20, 8]],
        });
      }
      if (dimensions === "country") {
        return Response.json({
          columnHeaders: headers("country", "views", "estimatedMinutesWatched", "engagedViews"),
          rows: [["JP", 5, 12, 4]],
        });
      }
      throw new Error(`unexpected dimensions ${dimensions}`);
    });
    for (const message of messages) {
      expect(await collectChannelDimensions(env, message, NOW)).toBe("collected");
    }
    expect(requested.map((url) => url.searchParams.get("dimensions"))).toEqual([
      "day,insightTrafficSourceType",
      "day,deviceType",
      "country",
    ]);
    for (const url of requested) {
      expect(url.searchParams.get("ids")).toBe(`channel==${channelId}`);
      expect(url.searchParams.get("startDate")).toBe(startDate);
      expect(url.searchParams.get("endDate")).toBe(endDate);
      expect(url.searchParams.get("metrics")).toBe("views,estimatedMinutesWatched,engagedViews");
    }
    const result = await new AnalyticsRawRepository(env.DB).listReports(owner.tenantId);
    expect(result.reports).toHaveLength(3);
    const traffic = result.reports.find((report) => report.reportKey === "traffic_daily");
    expect(traffic).toMatchObject({
      periodStart: startDate,
      periodEnd: endDate,
      availability: "available",
      rowCount: 1,
      source: "youtube_analytics_api",
      rows: [[endDate, "YT_SEARCH", 0, null, 3, "source-value"]],
    });
    expect(traffic?.columnHeaders.at(-1)).toMatchObject({ name: "extraColumn" });
  });

  it("空結果と権限拒否を 0 件の指標と区別し、quota は再試行可能な失敗にする", async () => {
    const { owner, messages } = await linked();
    mockAnalytics((url) => {
      if (url.searchParams.get("dimensions") === "day,insightTrafficSourceType") {
        return Response.json({
          columnHeaders: headers(
            "day",
            "insightTrafficSourceType",
            "views",
            "estimatedMinutesWatched",
            "engagedViews",
          ),
        });
      }
      if (url.searchParams.get("dimensions") === "day,deviceType") {
        return Response.json(
          {
            error: { status: "PERMISSION_DENIED", errors: [{ reason: "insufficientPermissions" }] },
          },
          { status: 403 },
        );
      }
      return Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 });
    });
    expect(await collectChannelDimensions(env, messageAt(messages, 0), NOW)).toBe("collected");
    expect(await collectChannelDimensions(env, messageAt(messages, 1), NOW)).toBe("collected");
    await expect(collectChannelDimensions(env, messageAt(messages, 2), NOW)).rejects.toMatchObject({
      retryable: true,
    });
    const reports = (await new AnalyticsRawRepository(env.DB).listReports(owner.tenantId)).reports;
    expect(
      reports.map((report) => [report.reportKey, report.availability, report.rowCount]),
    ).toEqual([
      ["device_daily", "permission_denied", 0],
      ["traffic_daily", "empty", 0],
    ]);
    expect(reports[0]?.rows).toEqual([]);
    expect(reports[1]?.rows).toEqual([]);
  });

  it("501行を全ページ収集して100行だけ一覧表示し、後続ページを取得できる", async () => {
    const { owner, messages } = await linked();
    const endDate = collectionDateRange(NOW).endDate;
    const requested = mockAnalytics((url) => {
      const startIndex = Number(url.searchParams.get("startIndex"));
      const count = startIndex === 1 ? 500 : 1;
      return Response.json({
        columnHeaders: headers(
          "day",
          "insightTrafficSourceType",
          "views",
          "estimatedMinutesWatched",
          "engagedViews",
        ),
        rows: Array.from({ length: count }, (_, i) => [
          endDate,
          `SOURCE_${startIndex + i}`,
          0,
          i,
          i,
        ]),
      });
    });
    expect(await collectChannelDimensions(env, messageAt(messages, 0), NOW)).toBe("collected");
    expect(requested.map((url) => url.searchParams.get("startIndex"))).toEqual(["1", "501"]);
    const repository = new AnalyticsRawRepository(env.DB);
    const report = (await repository.listReports(owner.tenantId)).reports[0];
    expect(report).toMatchObject({ rowCount: 501, hasMore: true });
    expect(report?.rows).toHaveLength(100);
    const last = await repository.getReportRows(owner.tenantId, "traffic_daily", 500, 100);
    expect(last).toMatchObject({ offset: 500, rowCount: 501, hasMore: false });
    expect(last?.rows).toEqual([[endDate, "SOURCE_501", 0, 0, 0]]);
  });

  it("通信中の削除予約と再連携世代の差異で保存・閲覧を止める", async () => {
    const { owner, messages } = await linked();
    const message = messageAt(messages, 0);
    mockAnalytics(async () => {
      await env.DB.prepare(
        `INSERT INTO data_deletions (deletion_id, tenant_id, scope, requested_by, requested_at, due_at)
         VALUES (?1, ?2, 'channel', ?3, ?4, ?4)`,
      )
        .bind(crypto.randomUUID(), owner.tenantId, owner.userId, NOW.toISOString())
        .run();
      return Response.json({
        columnHeaders: headers(
          "day",
          "insightTrafficSourceType",
          "views",
          "estimatedMinutesWatched",
          "engagedViews",
        ),
        rows: [[collectionDateRange(NOW).endDate, "YT_SEARCH", 5, 6, 7]],
      });
    });
    expect(await collectChannelDimensions(env, message, NOW)).toBe("stale");
    expect((await new AnalyticsRawRepository(env.DB).listReports(owner.tenantId)).reports).toEqual(
      [],
    );
    const repository = new AnalyticsRawRepository(env.DB);
    await repository.replaceReport(
      message,
      collectionDateRange(NOW),
      {
        availability: "available",
        columnHeaders: headers(
          "day",
          "insightTrafficSourceType",
          "views",
          "estimatedMinutesWatched",
          "engagedViews",
        ),
        rows: [
          {
            rowKey: JSON.stringify([collectionDateRange(NOW).endDate, "YT_SEARCH"]),
            values: [collectionDateRange(NOW).endDate, "YT_SEARCH", 5, 6, 7],
          },
        ],
      },
      NOW.toISOString(),
    );
    const afterLateWrite = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM analytics_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(afterLateWrite?.n).toBe(0);
    await env.DB.prepare("UPDATE data_deletions SET done_at = ?2 WHERE tenant_id = ?1")
      .bind(owner.tenantId, NOW.toISOString())
      .run();
    await env.DB.prepare("UPDATE channel_oauth_tokens SET updated_at = ?2 WHERE tenant_id = ?1")
      .bind(owner.tenantId, "2026-09-26T00:00:00.000Z")
      .run();
    expect(await collectChannelDimensions(env, message, NOW)).toBe("stale");
  });
});
