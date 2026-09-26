import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { StudioCsvRepository } from "../../src/repositories/studio-csv-repository";
import { getStudioImportMapping } from "../../src/usecases/imports";
import { seedDashboard } from "../dashboard/helpers";
import { call, expectError, newOwner } from "../platform/helpers";
import { upload } from "./helpers";

type ImportResponse = {
  importId: string;
  status: string;
  error: string | null;
  rows?: number;
  period?: string | null;
  mapped_columns?: number;
  unmapped_columns?: number;
  unresolved_rows?: number;
  period_status?: string;
};

describe("Studio CSVのヘッダー駆動取込", () => {
  it("M1の視聴回数と平均視聴率のCSV出典を別々に保持する", async () => {
    const owner = await newOwner("studio-m1-provenance");
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const views = (await (
      await upload(owner, "csv", {
        name: "グラフデータ.csv",
        body: "日付,コンテンツ,視聴回数\n2026-09-21,dQw4w9WgXcQ,12",
      })
    ).json()) as ImportResponse;
    const average = (await (
      await upload(owner, "csv", {
        name: "グラフデータ.csv",
        body: "日付,コンテンツ,平均視聴率 (%)\n2026-09-21,dQw4w9WgXcQ,42",
      })
    ).json()) as ImportResponse;
    await upload(owner, "csv", {
      name: "グラフデータ.csv",
      body: "日付,コンテンツ,エンゲージ ビュー\n2026-09-21,dQw4w9WgXcQ,8",
    });
    const row = await env.DB.prepare(
      `SELECT views, average_view_percentage, views_csv_import_id,
              average_view_percentage_csv_import_id
         FROM video_daily_metrics
        WHERE tenant_id = ?1 AND video_id = 'dQw4w9WgXcQ' AND date = '2026-09-21'`,
    )
      .bind(owner.tenantId)
      .first();
    expect(row).toEqual({
      views: 12,
      average_view_percentage: 42,
      views_csv_import_id: views.importId,
      average_view_percentage_csv_import_id: average.importId,
    });
  });

  it("グラフデータは列順に依存せず動画日次の明示値を保存し、未解決行と未知列を記録する", async () => {
    const owner = await newOwner("studio-graph");
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    await env.DB.prepare(
      `INSERT INTO video_daily_metrics
         (tenant_id, video_id, date, views, average_view_percentage, engaged_views)
       VALUES (?1, 'dQw4w9WgXcQ', '2026-09-21', 100, 42, 80)`,
    )
      .bind(owner.tenantId)
      .run();
    const response = await upload(owner, "csv", {
      name: "グラフデータ.csv",
      body:
        "新指標,エンゲージ ビュー,コンテンツ,日付,動画のタイトル\n" +
        "abc,0,dQw4w9WgXcQ,2026/09/21,動画A\n" +
        "def,,dQw4w9WgXcQ,2026-09-22,動画A\n" +
        "ghi,12,未確認ID,2026-09-23,動画B",
    });
    expect(response.status).toBe(201);
    const imported = (await response.json()) as ImportResponse;
    expect(imported).toMatchObject({
      status: "完了",
      rows: 3,
      period: "2026-09-21〜2026-09-22",
      mapped_columns: 3,
      unmapped_columns: 2,
      unresolved_rows: 1,
      period_status: "daily",
    });
    const { results } = await env.DB.prepare(
      `SELECT video_id, date, views, average_view_percentage, engaged_views, csv_import_id,
              views_csv_import_id, engaged_views_csv_import_id FROM video_daily_metrics
        WHERE tenant_id = ?1 AND video_id = 'dQw4w9WgXcQ' ORDER BY date`,
    )
      .bind(owner.tenantId)
      .all();
    expect(results).toEqual([
      {
        video_id: "dQw4w9WgXcQ",
        date: "2026-09-21",
        views: 100,
        average_view_percentage: 42,
        engaged_views: 0,
        csv_import_id: imported.importId,
        views_csv_import_id: null,
        engaged_views_csv_import_id: imported.importId,
      },
      {
        video_id: "dQw4w9WgXcQ",
        date: "2026-09-22",
        views: null,
        average_view_percentage: null,
        engaged_views: null,
        csv_import_id: imported.importId,
        views_csv_import_id: null,
        engaged_views_csv_import_id: imported.importId,
      },
    ]);
    const mapping = await getStudioImportMapping(
      { env, now: new Date() },
      { tenantId: owner.tenantId, userId: owner.userId, role: "owner" },
      imported.importId,
    );
    expect(mapping).toMatchObject({
      studioKind: "graph",
      mappedColumns: 3,
      unmappedColumns: 2,
      unresolvedRows: 1,
    });
    expect(mapping.columns[0]).toMatchObject({
      header: "新指標",
      status: "unmapped",
      mappingKey: null,
    });
    expect(mapping.columns[1]).toMatchObject({
      header: "エンゲージ ビュー",
      status: "mapped",
      unit: "count",
    });
    const unresolved = await env.DB.prepare(
      "SELECT row_index, reason FROM studio_csv_unresolved_rows WHERE tenant_id = ?1 AND import_id = ?2",
    )
      .bind(owner.tenantId, imported.importId)
      .first<{ row_index: number; reason: string }>();
    expect(unresolved?.row_index).toBe(3);
    expect(unresolved?.reason).toContain("動画ID");
    const list = (await (await call("/api/imports", { cookie: owner.cookie })).json()) as {
      imports: Array<{ import_id: string; mapped_columns: number; unresolved_rows: number }>;
    };
    expect(list.imports.find((row) => row.import_id === imported.importId)).toMatchObject({
      mapped_columns: 3,
      unresolved_rows: 1,
    });
  });

  it("合計CSVは日次チャンネル値だけを反映し、空欄と0を区別する", async () => {
    const owner = await newOwner("studio-total");
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const response = await upload(owner, "csv", {
      name: "custom-export.csv",
      body: "日付,追加列,エンゲージ ビュー\n2026-09-21,x,0\n2026-09-22,y,",
    });
    const imported = (await response.json()) as ImportResponse;
    expect(imported).toMatchObject({
      status: "完了",
      mapped_columns: 2,
      unmapped_columns: 1,
      unresolved_rows: 0,
    });
    const { results } = await env.DB.prepare(
      `SELECT date, engaged_views, views, csv_import_id, views_csv_import_id,
              engaged_views_csv_import_id FROM channel_daily_metrics
        WHERE tenant_id = ?1 AND channel_id = ?2 ORDER BY date`,
    )
      .bind(owner.tenantId, channelId)
      .all();
    expect(results).toEqual([
      {
        date: "2026-09-21",
        engaged_views: 0,
        views: null,
        csv_import_id: imported.importId,
        views_csv_import_id: null,
        engaged_views_csv_import_id: imported.importId,
      },
      {
        date: "2026-09-22",
        engaged_views: null,
        views: null,
        csv_import_id: imported.importId,
        views_csv_import_id: null,
        engaged_views_csv_import_id: imported.importId,
      },
    ]);
    const ledger = await env.DB.prepare(
      "SELECT status, rows, period, r2_key FROM imports WHERE tenant_id = ?1 AND import_id = ?2",
    )
      .bind(owner.tenantId, imported.importId)
      .first<{ status: string; rows: number; period: string; r2_key: string }>();
    expect(ledger).toMatchObject({ status: "完了", rows: 2, period: "2026-09-21〜2026-09-22" });
    expect(await env.MEDIA.get(ledger?.r2_key ?? "")).not.toBeNull();
  });

  it("別CSVの視聴回数とエンゲージ ビューを列単位で合成し、欠けた行と各出典を保持する", async () => {
    const owner = await newOwner("studio-metric-merge");
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const engagedVideo = (await (
      await upload(owner, "csv", {
        name: "グラフデータ.csv",
        body:
          "日付,コンテンツ,エンゲージ ビュー\n" +
          "2026-09-21,dQw4w9WgXcQ,0\n" +
          "2026-09-22,dQw4w9WgXcQ,8",
      })
    ).json()) as ImportResponse;
    const viewsVideo = (await (
      await upload(owner, "csv", {
        name: "グラフデータ.csv",
        body:
          "日付,コンテンツ,視聴回数\n" + "2026-09-21,dQw4w9WgXcQ,12\n" + "2026-09-23,dQw4w9WgXcQ,4",
      })
    ).json()) as ImportResponse;
    expect(engagedVideo.status).toBe("完了");
    expect(viewsVideo.status).toBe("完了");
    const { results: videoRows } = await env.DB.prepare(
      `SELECT date, views, engaged_views, csv_import_id, views_csv_import_id,
              engaged_views_csv_import_id FROM video_daily_metrics
        WHERE tenant_id = ?1 AND video_id = 'dQw4w9WgXcQ' ORDER BY date`,
    )
      .bind(owner.tenantId)
      .all();
    expect(videoRows).toEqual([
      {
        date: "2026-09-21",
        views: 12,
        engaged_views: 0,
        csv_import_id: viewsVideo.importId,
        views_csv_import_id: viewsVideo.importId,
        engaged_views_csv_import_id: engagedVideo.importId,
      },
      {
        date: "2026-09-22",
        views: null,
        engaged_views: 8,
        csv_import_id: engagedVideo.importId,
        views_csv_import_id: null,
        engaged_views_csv_import_id: engagedVideo.importId,
      },
      {
        date: "2026-09-23",
        views: 4,
        engaged_views: null,
        csv_import_id: viewsVideo.importId,
        views_csv_import_id: viewsVideo.importId,
        engaged_views_csv_import_id: null,
      },
    ]);

    const engagedChannel = (await (
      await upload(owner, "csv", {
        name: "合計.csv",
        body: "日付,エンゲージ ビュー\n2026-09-21,5\n2026-09-22,9",
      })
    ).json()) as ImportResponse;
    const viewsChannel = (await (
      await upload(owner, "csv", {
        name: "合計.csv",
        body: "日付,視聴回数\n2026-09-21,0\n2026-09-23,11",
      })
    ).json()) as ImportResponse;
    expect(engagedChannel.status).toBe("完了");
    expect(viewsChannel.status).toBe("完了");
    const { results: channelRows } = await env.DB.prepare(
      `SELECT date, views, engaged_views, csv_import_id, views_csv_import_id,
              engaged_views_csv_import_id FROM channel_daily_metrics
        WHERE tenant_id = ?1 AND channel_id = ?2 ORDER BY date`,
    )
      .bind(owner.tenantId, channelId)
      .all();
    expect(channelRows).toEqual([
      {
        date: "2026-09-21",
        views: 0,
        engaged_views: 5,
        csv_import_id: viewsChannel.importId,
        views_csv_import_id: viewsChannel.importId,
        engaged_views_csv_import_id: engagedChannel.importId,
      },
      {
        date: "2026-09-22",
        views: null,
        engaged_views: 9,
        csv_import_id: engagedChannel.importId,
        views_csv_import_id: null,
        engaged_views_csv_import_id: engagedChannel.importId,
      },
      {
        date: "2026-09-23",
        views: 11,
        engaged_views: null,
        csv_import_id: viewsChannel.importId,
        views_csv_import_id: viewsChannel.importId,
        engaged_views_csv_import_id: null,
      },
    ]);

    const blankViews = (await (
      await upload(owner, "csv", {
        name: "合計.csv",
        body: "日付,視聴回数\n2026-09-21,",
      })
    ).json()) as ImportResponse;
    const cleared = await env.DB.prepare(
      `SELECT views, engaged_views, views_csv_import_id, engaged_views_csv_import_id
         FROM channel_daily_metrics WHERE tenant_id = ?1 AND channel_id = ?2 AND date = '2026-09-21'`,
    )
      .bind(owner.tenantId, channelId)
      .first();
    expect(cleared).toEqual({
      views: null,
      engaged_views: 5,
      views_csv_import_id: blankViews.importId,
      engaged_views_csv_import_id: engagedChannel.importId,
    });
  });

  it("表データは期間を推測せず、明示単位の数値と合計行だけを保存する", async () => {
    const owner = await newOwner("studio-table");
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const response = await upload(owner, "csv", {
      name: "表データ.csv",
      body:
        "コンテンツ,動画のタイトル,長さ,エンゲージ ビュー,視聴回数,総再生時間（単位: 時間）,平均視聴率 (%),チャンネル登録者,追加列\n" +
        '合計,チャンネル合計,,"1,234",1500,12.5,16.88%,38,raw\n' +
        "dQw4w9WgXcQ,動画A,83,0,20,1.25,25.5%,-1,raw2",
    });
    const imported = (await response.json()) as ImportResponse;
    expect(imported).toMatchObject({
      status: "完了",
      rows: 2,
      period: null,
      period_status: "unknown",
      mapped_columns: 8,
      unmapped_columns: 1,
    });
    const { results } = await env.DB.prepare(
      `SELECT row_index, video_id, is_total, period_from, period_to, title, metrics_json
         FROM video_period_metrics WHERE tenant_id = ?1 AND import_id = ?2 ORDER BY row_index`,
    )
      .bind(owner.tenantId, imported.importId)
      .all<{
        row_index: number;
        video_id: string | null;
        is_total: number;
        period_from: string | null;
        period_to: string | null;
        title: string;
        metrics_json: string;
      }>();
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ video_id: null, is_total: 1, period_from: null });
    expect(JSON.parse(results[0]?.metrics_json ?? "{}")).toMatchObject({
      engagedViews: 1234,
      views: 1500,
      watchHours: 12.5,
      averageViewPercentage: 16.88,
    });
    expect(results[1]).toMatchObject({ video_id: "dQw4w9WgXcQ", is_total: 0, period_to: null });
    expect(JSON.parse(results[1]?.metrics_json ?? "{}")).toMatchObject({
      engagedViews: 0,
      subscriberChange: -1,
    });
  });

  it("既知ファイルの必須列不備は失敗を記録し、未知CSVは原本保存のままにする", async () => {
    const owner = await newOwner("studio-invalid");
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const invalid = await upload(owner, "csv", {
      name: "グラフデータ.csv",
      body: "日付,コンテンツ\n2026-09-21,dQw4w9WgXcQ",
    });
    const imported = (await invalid.json()) as ImportResponse;
    expect(imported.status).toBe("失敗");
    expect(imported.error).toContain("エンゲージ ビュー");
    const original = await env.DB.prepare(
      "SELECT r2_key FROM imports WHERE tenant_id = ?1 AND import_id = ?2",
    )
      .bind(owner.tenantId, imported.importId)
      .first<{ r2_key: string }>();
    expect(await env.MEDIA.get(original?.r2_key ?? "")).not.toBeNull();
    const invalidEncoding = await upload(owner, "csv", {
      name: "合計.csv",
      body: new Uint8Array([0xff, 0xfe, 0x41, 0x00]),
    });
    expect((await invalidEncoding.json()) as ImportResponse).toMatchObject({
      status: "失敗",
      error: expect.stringContaining("UTF-8"),
    });
    const generic = await upload(owner, "csv", {
      name: "unknown.csv",
      body: "other,column\n1,2",
    });
    expect(((await generic.json()) as ImportResponse).status).toBe("処理待ち");
  });

  it("別テナントの列対応を参照できず、解除予約後の正規化も拒否する", async () => {
    const owner = await newOwner("studio-owner");
    const other = await newOwner("studio-other");
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    const response = await upload(owner, "csv", {
      name: "合計.csv",
      body: "日付,エンゲージ ビュー\n2026-09-21,1",
    });
    const imported = (await response.json()) as ImportResponse;
    await expect(
      getStudioImportMapping(
        { env, now: new Date() },
        { tenantId: other.tenantId, userId: other.userId, role: "owner" },
        imported.importId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const originalComplete = StudioCsvRepository.prototype.complete;
    vi.spyOn(StudioCsvRepository.prototype, "complete").mockImplementationOnce(async function (
      this: StudioCsvRepository,
      input,
    ) {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO data_deletions (deletion_id, tenant_id, scope, channel_id, requested_by, requested_at, due_at)
         VALUES (?1, ?2, 'channel', ?3, ?4, ?5, ?5)`,
      )
        .bind(crypto.randomUUID(), owner.tenantId, channelId, owner.userId, now)
        .run();
      return originalComplete.call(this, input);
    });
    await expectError(
      await upload(owner, "csv", {
        name: "合計.csv",
        body: "日付,エンゲージ ビュー\n2026-09-22,2",
      }),
      409,
      "IMPORT_DELETION_PENDING",
    );
    const row = await env.DB.prepare(
      "SELECT engaged_views FROM channel_daily_metrics WHERE tenant_id = ?1 AND date = '2026-09-22'",
    )
      .bind(owner.tenantId)
      .first();
    expect(row).toBeNull();
    vi.restoreAllMocks();
  });
});
