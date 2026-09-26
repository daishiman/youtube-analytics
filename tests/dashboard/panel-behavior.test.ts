import { describe, expect, it } from "vitest";
import {
  displayedVideoLines,
  publishedMarkerPoints,
  trendSummary,
} from "../../web/pages/dashboard/TrendCard";
import { singleVideoDashboardUrl } from "../../web/pages/dashboard/VideoPerformance";

describe("ダッシュボードの動画比較", () => {
  it("1本だけなら合計線と同じ個別線を重ねない", () => {
    expect(displayedVideoLines([{ videoId: "v1", title: "動画1", values: [4] }], "")).toEqual([]);
  });
  it("105本を選んでもグラフは上位5本に絞り、指定した動画へ焦点を移せる", () => {
    const videos = Array.from({ length: 105 }, (_, i) => ({
      videoId: `v${i}`,
      title: `動画${i}`,
      values: [i + 1],
    }));
    expect(displayedVideoLines(videos, "").map((v) => v.videoId)).toEqual([
      "v104",
      "v103",
      "v102",
      "v101",
      "v100",
    ]);
    expect(displayedVideoLines(videos, "v0").map((v) => v.videoId)).toEqual([
      "v104",
      "v103",
      "v102",
      "v101",
      "v0",
    ]);
    expect(videos).toHaveLength(105);
  });

  it("1本のダッシュボードへ移る際に期間だけを保ち、以前の動画選択を外す", () => {
    const params = new URLSearchParams(
      "period=custom&from=2026-09-01&to=2026-09-20&scope=videos&video_ids=old1%2Cold2",
    );
    expect(singleVideoDashboardUrl(params, "new1")).toBe(
      "/?period=custom&from=2026-09-01&to=2026-09-20&scope=videos&video_ids=new1",
    );
  });

  it("日次値が欠損した期間を視聴回数0と表現しない", () => {
    const trend = {
      dates: ["2026-09-01", "2026-09-02"],
      current: [null, null],
      previous: [null, null],
      published: [],
      perVideo: [],
    };
    expect(trendSummary({ trend })).toContain("表示できる日次データがありません");
    expect(trendSummary({ trend: { ...trend, current: [12, null] } })).toContain(
      "データのない日は合計に含めていません",
    );
    const previousMissing = trendSummary({
      trend: { ...trend, current: [12, 10], previous: [8, null] },
    });
    expect(previousMissing).toContain("前期は欠測があるため期間合計を表示していません");
    expect(previousMissing).not.toContain("前期 8回");
  });

  it("日次値が欠測した公開日には0回のピンを置かない", () => {
    expect(
      publishedMarkerPoints({
        dates: ["2026-09-01", "2026-09-02"],
        current: [12, null],
        published: [
          { date: "2026-09-01", videoId: "v1", title: "動画1" },
          { date: "2026-09-02", videoId: "v2", title: "動画2" },
        ],
      }),
    ).toEqual([{ coord: [0, 12], name: "動画1", value: "公開" }]);
  });
});
