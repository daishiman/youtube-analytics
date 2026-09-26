// 期間解決とファネル判定の純粋関数（境界値を固定する）
import { describe, expect, it } from "vitest";
import {
  addDays,
  dateList,
  isMonday,
  jstDateOf,
  jstToday,
  resolvePeriod,
  weekStartOf,
} from "../../src/domain/dashboard-period";
import { type FunnelWeekInput, judgeFunnelWeek } from "../../src/domain/funnel";
import { buildComposition, parseVideoIds } from "../../src/usecases/dashboard";
import { latestCompletedWeek } from "../../src/usecases/funnel";
import { isAllowedThumbnailUrl } from "../../src/usecases/thumbnails";

// 2026-09-24 10:00 JST（木曜）
const NOW = new Date("2026-09-24T01:00:00Z");

describe("期間の解決", () => {
  it("JST の日付境界で今日を決める", () => {
    expect(jstToday(new Date("2026-09-23T14:59:59Z"))).toBe("2026-09-23");
    expect(jstToday(new Date("2026-09-23T15:00:00Z"))).toBe("2026-09-24");
    expect(jstDateOf("2026-09-23T15:00:00Z")).toBe("2026-09-24");
  });

  it("収集データがないときの固定期間はJST昨日までで、前期は直前の同じ日数", () => {
    const p = resolvePeriod({}, NOW);
    expect(p.key).toBe("28d");
    expect(p.current).toMatchObject({ from: "2026-08-27", to: "2026-09-23", days: 28 });
    expect(p.previous).toMatchObject({ from: "2026-07-30", to: "2026-08-26", days: 28 });
    const w = resolvePeriod({ period: "7d" }, NOW);
    expect(w.current).toMatchObject({ from: "2026-09-17", to: "2026-09-23" });
  });

  it("固定期間は取得済みAnalytics日次を末日にし、任意期間とデータなしは維持する", () => {
    // 9/25 03:00 JST 時点の収集はPT 9/23まで。JST昨日の9/24はまだ無い。
    const afterCron = new Date("2026-09-24T18:00:00Z");
    const fixed = resolvePeriod({ period: "7d" }, afterCron, "2026-09-23");
    expect(fixed.current).toEqual({ from: "2026-09-17", to: "2026-09-23", days: 7 });
    expect(fixed.previous).toEqual({ from: "2026-09-10", to: "2026-09-16", days: 7 });
    expect(resolvePeriod({ period: "7d" }, afterCron).current.to).toBe("2026-09-24");
    expect(resolvePeriod({ period: "7d" }, afterCron, "2026-09-30").current.to).toBe("2026-09-24");
    expect(
      resolvePeriod(
        { period: "custom", from: "2026-09-20", to: "2026-09-24" },
        afterCron,
        "2026-09-23",
      ).current,
    ).toEqual({ from: "2026-09-20", to: "2026-09-24", days: 5 });
  });

  it("custom はちょうど365日まで", () => {
    const ok = resolvePeriod({ period: "custom", from: "2025-01-01", to: "2025-12-31" }, NOW);
    expect(ok.current.days).toBe(365);
    expect(() =>
      resolvePeriod({ period: "custom", from: "2024-01-01", to: "2024-12-31" }, NOW),
    ).toThrow(); // 閏年で366日
  });

  it("週は JST 月曜始まり", () => {
    expect(weekStartOf("2026-09-24")).toBe("2026-09-21");
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21");
    expect(weekStartOf("2026-09-20")).toBe("2026-09-14");
    expect(isMonday("2026-09-21")).toBe(true);
    expect(isMonday("2026-09-22")).toBe(false);
    expect(latestCompletedWeek(NOW)).toBe("2026-09-14");
    expect(dateList({ from: "2026-02-27", to: addDays("2026-02-27", 2) })).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });
});

describe("入力検証", () => {
  it("video_ids は重複を除き、形式違反は例外", () => {
    expect(parseVideoIds(undefined)).toBeNull();
    expect(parseVideoIds("a, b,a,,")).toEqual(["a", "b"]);
    expect(() => parseVideoIds("a,b c")).toThrow();
  });

  it("サムネイルの取得元は YouTube の画像ホスト（https）だけ", () => {
    expect(isAllowedThumbnailUrl("https://i.ytimg.com/vi/x/mqdefault.jpg")).toBe(true);
    expect(isAllowedThumbnailUrl("https://i9.ytimg.com/vi/x/a.jpg")).toBe(true);
    expect(isAllowedThumbnailUrl("https://yt3.ggpht.com/a.jpg")).toBe(true);
    expect(isAllowedThumbnailUrl("http://i.ytimg.com/vi/x/a.jpg")).toBe(false);
    expect(isAllowedThumbnailUrl("https://i.ytimg.com.evil.test/a.jpg")).toBe(false);
    expect(isAllowedThumbnailUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedThumbnailUrl("not a url")).toBe(false);
  });
});

describe("構成比", () => {
  it("視聴0の動画は除き、上位5本＋その他の合計が1になる", () => {
    const allVideos = Array.from({ length: 8 }, (_, i) => ({
      video_id: `v${i}`,
      title: `動画${i}`,
      published_at: i < 2 ? "2026-09-10T00:00:00Z" : "2026-01-01T00:00:00Z",
      content_type: (i % 2 === 0 ? "shorts" : "long") as "shorts" | "long",
      angle: i === 0 ? "つまずき解決型" : null,
    }));
    const totals = new Map(allVideos.map((v, i) => [v.video_id, i === 7 ? 0 : (7 - i) * 10]));
    const c = buildComposition({
      allVideos,
      totals,
      current: { from: "2026-08-27", to: "2026-09-23" },
    });
    expect(c.totalViews).toBe(280);
    expect(c.byVideo.map((x) => x.label)).toEqual([
      "動画0",
      "動画1",
      "動画2",
      "動画3",
      "動画4",
      "その他",
    ]);
    expect(c.byVideo.at(-1)?.views).toBe(30);
    expect(c.byNewness.find((x) => x.label.startsWith("新作"))?.views).toBe(130);
    expect(c.top3Share).toBeCloseTo(180 / 280, 6);
  });

  it("全動画が0なら空で top3Share は null", () => {
    const c = buildComposition({
      allVideos: [],
      totals: new Map(),
      current: { from: "a", to: "b" },
    });
    expect(c).toMatchObject({ totalViews: 0, byVideo: [], top3Share: null });
  });

  it("公開メタデータを消した動画も指標の構成比に残し、公開日未取得とする", () => {
    const composition = buildComposition({
      allVideos: [
        {
          video_id: "expired-video",
          title: "動画情報の再取得待ち",
          published_at: "",
          content_type: "unknown",
          angle: null,
        },
      ],
      totals: new Map([["expired-video", 10]]),
      current: { from: "2026-09-01", to: "2026-09-28" },
    });
    expect(composition.totalViews).toBe(10);
    expect(composition.byNewness).toMatchObject([{ label: "公開日未取得" }]);
  });
});

describe("ファネル判定", () => {
  const week: FunnelWeekInput = {
    impressions: 10000,
    ctrWeightedSum: 50000, // CTR 5%
    retentionWeightedSum: 3500,
    retentionViews: 100, // M1 35%
    engagedViews: 900,
    views: 1000,
    routeVisits: 20, // 2%
    inquiries: 10,
    closedDeals: 1, // 10%
  };
  const targets = {
    impressions: { targetValue: 8000, minSample: 0 },
    ctr: { targetValue: 5, minSample: 1000 },
    weighted_retention_m1: { targetValue: 40, minSample: 100 },
    lead_route_rate: { targetValue: 4, minSample: 100 },
    inquiry_close_rate: { targetValue: 20, minSample: 5 },
  };

  it("target_gap が最も小さい段を候補にする（差が同率でも先の段）", () => {
    const j = judgeFunnelWeek(week, targets, false);
    expect(j.metrics.map((m) => m.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(j.metrics.find((m) => m.id === "ctr")?.target_gap).toBe(0);
    // 導線誘導率 -50% と 成約率 -50% が同率。先に現れる導線誘導率を候補にする
    expect(j.candidate?.metricId).toBe("lead_route_rate");
    expect(j.candidate?.target_gap).toBe(-0.5);
    expect(j.allTargetsMet).toBe(false);
  });

  it("欠損・分母0・目標なし・標本不足・鮮度切れは判定保留にして理由を返す", () => {
    const j = judgeFunnelWeek(
      { ...week, inquiries: 0, routeVisits: null, engagedViews: 50 },
      { ...targets, impressions: { targetValue: null, minSample: 0 } },
      false,
    );
    const r = Object.fromEntries(j.metrics.map((m) => [m.id, m.reasons]));
    expect(r.impressions).toEqual(["target_missing"]);
    expect(r.weighted_retention_m1).toEqual(["min_sample_not_met"]);
    expect(r.lead_route_rate).toEqual(["missing_input"]);
    expect(r.inquiry_close_rate).toEqual(["zero_denominator", "min_sample_not_met"]);
    expect(j.candidate?.metricId).toBeUndefined();
    const stale = judgeFunnelWeek(week, targets, true);
    expect(stale.metrics.every((m) => m.reasons.includes("stale") && m.target_gap === null)).toBe(
      true,
    );
    expect(stale.candidate).toBeNull();
  });

  it("未達段があっても5原因指標のどれかが判定保留なら最大候補を出さない", () => {
    const missingM1 = judgeFunnelWeek(
      { ...week, retentionWeightedSum: null, retentionViews: null },
      targets,
      false,
    );
    expect(missingM1.metrics.find((m) => m.id === "lead_route_rate")?.target_gap).toBe(-0.5);
    expect(missingM1.metrics.find((m) => m.id === "weighted_retention_m1")?.reasons).toContain(
      "missing_input",
    );
    expect(missingM1.candidate).toBeNull();
    expect(missingM1.allTargetsMet).toBe(false);
  });

  it("全段が目標以上なら allTargetsMet", () => {
    const easy = Object.fromEntries(
      Object.entries(targets).map(([k, v]) => [k, { ...v, targetValue: 1 }]),
    );
    expect(judgeFunnelWeek(week, easy, false).allTargetsMet).toBe(true);
  });
});
