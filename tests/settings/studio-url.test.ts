// データ取込の CSV 取得元 URL（web/youtube-studio.ts）。チャンネル ID を差し替えるだけで各チャンネルの画面になる
import { describe, expect, it } from "vitest";
import { STUDIO_CSV_METRICS, studioAnalyticsUrl } from "../../web/youtube-studio";

describe("studioAnalyticsUrl", () => {
  it("連携中チャンネルの Studio 詳細モード（直近4週間・動画別）を指す", () => {
    const url = new URL(studioAnalyticsUrl("UCzNFiHvnU5fTaEga3vREb2w"));
    expect(url.origin).toBe("https://studio.youtube.com");
    expect(url.pathname).toBe(
      "/channel/UCzNFiHvnU5fTaEga3vREb2w/analytics/tab-overview/period-default/explore",
    );
    expect(url.searchParams.get("entity_type")).toBe("CHANNEL");
    expect(url.searchParams.get("entity_id")).toBe("UCzNFiHvnU5fTaEga3vREb2w");
    expect(url.searchParams.get("time_period")).toBe("4_weeks");
    expect(url.searchParams.get("dimension")).toBe("VIDEO");
    expect(url.searchParams.get("granularity")).toBe("DAY");
    expect(url.searchParams.getAll("t_metrics")).toEqual([...STUDIO_CSV_METRICS]);
  });

  it("別のチャンネルではパスとクエリの両方がそのチャンネルになる", () => {
    const url = new URL(studioAnalyticsUrl("UCseedChannelA000000000"));
    expect(url.pathname).toContain("/channel/UCseedChannelA000000000/");
    expect(url.searchParams.get("entity_id")).toBe("UCseedChannelA000000000");
    expect(url.href).not.toContain("UCzNFiHvnU5fTaEga3vREb2w");
  });

  it("想定外の文字はパスを壊さないようにエンコードする", () => {
    const url = new URL(studioAnalyticsUrl("UC../x?y"));
    expect(url.pathname).toBe(
      "/channel/UC..%2Fx%3Fy/analytics/tab-overview/period-default/explore",
    );
  });
});
