import { afterEach, describe, expect, it, vi } from "vitest";
import {
  queryVideoDaily,
  YOUTUBE_ANALYTICS_REPORTS_URL,
} from "../../src/adapters/google-analytics";

afterEach(() => vi.restoreAllMocks());

describe("動画別 Analytics のページング", () => {
  it("day,video の500行超を startIndex で取り切り、欠測日を作らない", async () => {
    const videoIds = Array.from({ length: 15 }, (_, i) => `video${String(i).padStart(6, "0")}`);
    const base = Date.parse("2026-08-01T00:00:00Z");
    const rows = Array.from({ length: 501 }, (_, i) => [
      new Date(base + Math.floor(i / 15) * 86_400_000).toISOString().slice(0, 10),
      videoIds[i % 15],
      i + 1,
      i + 2,
      i === 500 ? null : 42.5,
    ]);
    const calls: URL[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      expect(url.href.startsWith(YOUTUBE_ANALYTICS_REPORTS_URL)).toBe(true);
      calls.push(url);
      const start = Number(url.searchParams.get("startIndex"));
      return Response.json({
        columnHeaders: [
          { name: "day" },
          { name: "video" },
          { name: "views" },
          { name: "estimatedMinutesWatched" },
          { name: "averageViewPercentage" },
        ],
        rows: rows.slice(start - 1, start - 1 + 500),
      });
    });
    const result = await queryVideoDaily({
      accessToken: "access",
      channelId: "UC_test",
      videoIds,
      startDate: "2026-08-01",
      endDate: "2026-09-04",
    });
    expect(calls.map((url) => url.searchParams.get("startIndex"))).toEqual(["1", "501"]);
    expect(calls[0]?.searchParams.get("dimensions")).toBe("day,video");
    expect(calls[0]?.searchParams.get("filters")).toBe(`video==${videoIds.join(",")}`);
    expect(calls[0]?.searchParams.get("maxResults")).toBe("500");
    expect(calls[0]?.searchParams.get("startDate")).toBe("2026-08-01");
    expect(calls[0]?.searchParams.get("endDate")).toBe("2026-09-04");
    expect(result).toHaveLength(501);
    expect(result[500]?.averageViewPercentage).toBeNull();
    expect(result[500]?.date).toBe("2026-09-03");
  });

  it("行数の上限を要求日数から求め、35日を超える窓でも満杯の最終ページの次まで取り切る", async () => {
    // 50本×40日=2000行。上限を35日で固定していた頃は1750行で打ち切って失敗していた
    const videoIds = Array.from({ length: 50 }, (_, i) => `video${String(i).padStart(6, "0")}`);
    const base = Date.parse("2026-08-01T00:00:00Z");
    const rows = Array.from({ length: 2000 }, (_, i) => [
      new Date(base + Math.floor(i / 50) * 86_400_000).toISOString().slice(0, 10),
      videoIds[i % 50],
      1,
      1,
      50,
    ]);
    const starts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      starts.push(url.searchParams.get("startIndex") ?? "");
      const start = Number(url.searchParams.get("startIndex"));
      return Response.json({
        columnHeaders: [
          { name: "day" },
          { name: "video" },
          { name: "views" },
          { name: "estimatedMinutesWatched" },
          { name: "averageViewPercentage" },
        ],
        rows: rows.slice(start - 1, start - 1 + 500),
      });
    });
    const result = await queryVideoDaily({
      accessToken: "access",
      channelId: "UC_test",
      videoIds,
      startDate: "2026-08-01",
      endDate: "2026-09-09",
    });
    expect(starts).toEqual(["1", "501", "1001", "1501", "2001"]);
    expect(result).toHaveLength(2000);
    expect(result.at(-1)?.date).toBe("2026-09-09");
  });
});
