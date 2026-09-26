import { describe, expect, it } from "vitest";
import { detectStudioCsv, parseStudioCsv } from "../../src/domain/studio-csv";
import { AppError } from "../../src/lib/errors";

const CHANNEL_ID = "UC1234567890123456789012";
const VIDEO_ID = "dQw4w9WgXcQ";

describe("Studio CSV の実エクスポート形式", () => {
  it("NFD ファイル名と視聴回数系列のヘッダーを検出する", () => {
    expect(detectStudioCsv("", "表データ.csv".normalize("NFD"))).toBe("table");
    expect(detectStudioCsv("", "グラフデータ.csv".normalize("NFD"))).toBe("graph");
    expect(
      detectStudioCsv(`日付,コンテンツ,視聴回数\n2026-09-18,${VIDEO_ID},0`, "export.csv"),
    ).toBe("graph");
    expect(detectStudioCsv("日付,視聴回数\n2026-09-18,0", "export.csv")).toBe("total");
  });

  it("表データの整数秒と H:MM:SS を秒にし、期間は未知のままにする", () => {
    const parsed = parseStudioCsv(
      `コンテンツ,動画のタイトル,長さ,平均視聴時間,視聴回数,サムネイルのクリック率 (%)\n` +
        `合計,合計,,0:01:52,1185,2.79\n` +
        `${VIDEO_ID},動画A,637,0:01:52,0,2.79`,
      "table",
      CHANNEL_ID,
    );
    expect(parsed.periodStatus).toBe("unknown");
    expect(parsed.period).toBeNull();
    expect(parsed.unresolvedRows).toEqual([]);
    expect(parsed.periodRows[0]?.metrics).toMatchObject({
      durationSeconds: null,
      averageViewDurationSeconds: 112,
      views: 1185,
      thumbnailCtr: 2.79,
    });
    expect(parsed.periodRows[1]?.metrics).toMatchObject({
      durationSeconds: 637,
      averageViewDurationSeconds: 112,
      views: 0,
    });
    expect(parsed.columns.find((column) => column.header === "長さ")).toMatchObject({
      mappingKey: "durationSeconds",
      unit: "seconds",
    });
    expect(parsed.columns.find((column) => column.header === "平均視聴時間")).toMatchObject({
      mappingKey: "averageViewDurationSeconds",
      unit: "seconds",
    });
  });

  it("日別の視聴回数とエンゲージ ビューを独立に扱い、空欄と0を区別する", () => {
    const views = parseStudioCsv(
      `日付,コンテンツ,視聴回数\n2026-09-17,${VIDEO_ID},0\n2026-09-18,${VIDEO_ID},`,
      "graph",
      CHANNEL_ID,
    );
    expect(views.dailyRows).toMatchObject([
      { date: "2026-09-17", views: 0, engagedViews: null },
      { date: "2026-09-18", views: null, engagedViews: null },
    ]);
    expect(views.period).toBe("2026-09-17〜2026-09-18");
    // グラフ CSV は掲載された動画の行だけを表す。表データの全動画へ補完しない。
    expect(views.dailyRows).toHaveLength(2);

    const engaged = parseStudioCsv(
      "日付,エンゲージ ビュー\n2026-09-17,0\n2026-09-18,",
      "total",
      CHANNEL_ID,
    );
    expect(engaged.dailyRows).toMatchObject([
      { views: null, engagedViews: 0 },
      { views: null, engagedViews: null },
    ]);

    const both = parseStudioCsv(
      "日付,視聴回数,エンゲージ ビュー\n2026-09-17,20,10",
      "total",
      CHANNEL_ID,
    );
    expect(both.dailyRows[0]).toMatchObject({ views: 20, engagedViews: 10 });
  });

  it("グラフの平均視聴率は任意列としてのみ日次化し、表データの期間値を流用しない", () => {
    const noAverage = parseStudioCsv(
      `日付,コンテンツ,視聴回数\n2026-09-17,${VIDEO_ID},12`,
      "graph",
      CHANNEL_ID,
    );
    expect(noAverage.dailyRows[0]?.averageViewPercentage).toBeNull();
    const average = parseStudioCsv(
      `日付,コンテンツ,平均視聴率 (%)\n2026-09-17,${VIDEO_ID},42.5`,
      "graph",
      CHANNEL_ID,
    );
    expect(average.dailyRows[0]).toMatchObject({
      views: null,
      averageViewPercentage: 42.5,
    });
    const table = parseStudioCsv(
      `コンテンツ,動画のタイトル,平均視聴率 (%)\n${VIDEO_ID},動画A,66`,
      "table",
      CHANNEL_ID,
    );
    expect(table.periodRows[0]?.metrics.averageViewPercentage).toBe(66);
    expect(table.dailyRows).toEqual([]);
  });

  it("日別指標がないファイルと不正な時間形式を正規化しない", () => {
    try {
      parseStudioCsv("日付,追加列\n2026-09-17,x", "total", CHANNEL_ID);
      throw new Error("必須列がないのに取込できました");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).hint).toContain("エンゲージ ビューまたは視聴回数");
    }
    for (const bad of ["01:23", "0:60:00", "-1:00:00", "0:01:99", "1:1:02"]) {
      const parsed = parseStudioCsv(
        `コンテンツ,動画のタイトル,平均視聴時間\n${VIDEO_ID},動画A,${bad}`,
        "table",
        CHANNEL_ID,
      );
      expect(parsed.periodRows).toEqual([]);
      expect(parsed.unresolvedRows[0]?.reason).toContain("平均視聴時間");
    }
    const badLength = parseStudioCsv(
      `コンテンツ,動画のタイトル,長さ\n${VIDEO_ID},動画A,01:23`,
      "table",
      CHANNEL_ID,
    );
    expect(badLength.periodRows).toEqual([]);
    expect(badLength.unresolvedRows[0]?.reason).toContain("長さ");
  });
});
