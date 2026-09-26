import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { addDays } from "../../src/domain/dashboard-period";
import { BusinessCsvRepository } from "../../src/repositories/business-csv-repository";
import { type FunnelResponse, latestCompletedWeek } from "../../src/usecases/funnel";
import { seedDashboard } from "../dashboard/helpers";
import { call, expectError, newOwner } from "../platform/helpers";
import { upload } from "./helpers";

const header = "week_start,channel_id,route_label,route_visits,inquiries,closed_deals,revenue_jpy";

type ImportResponse = {
  importId: string;
  status: string;
  error: string | null;
  rows?: number;
  period?: string;
};

describe("事業週次CSVの正規化", () => {
  it("原本を保持して週次指標を保存し、ファネルAPIから見える。同じ週の再取込は更新する", async () => {
    const owner = await newOwner("business-csv-owner");
    const other = await newOwner("business-csv-other");
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    await seedDashboard({ tenantId: other.tenantId, userId: other.userId, csv: true, days: 30 });
    const week = latestCompletedWeek(new Date());
    const previous = addDays(week, -7);
    const body = `${header}\n${previous},${channelId},,0,,0,\n${week},${channelId},LINE,100,10,2,300000\n`;
    const response = await upload(owner, "csv", { name: "business-funnel-weekly.csv", body });
    expect(response.status).toBe(201);
    const imported = (await response.json()) as ImportResponse;
    expect(imported.status).toBe("完了");
    expect(imported.error).toBeNull();
    expect(imported.rows).toBe(2);
    expect(imported.period).toContain(week.replaceAll("-", "/"));

    const { results } = await env.DB.prepare(
      `SELECT week_start, route_label, route_visits, inquiries, closed_deals, revenue_jpy
         FROM business_funnel_weekly WHERE tenant_id = ?1 AND channel_id = ?2 ORDER BY week_start`,
    )
      .bind(owner.tenantId, channelId)
      .all();
    expect(results).toEqual([
      {
        week_start: previous,
        route_label: "LINE",
        route_visits: 0,
        inquiries: null,
        closed_deals: 0,
        revenue_jpy: null,
      },
      {
        week_start: week,
        route_label: "LINE",
        route_visits: 100,
        inquiries: 10,
        closed_deals: 2,
        revenue_jpy: 300000,
      },
    ]);
    const ledger = await env.DB.prepare(
      "SELECT status, rows, period, r2_key FROM imports WHERE tenant_id = ?1 AND import_id = ?2",
    )
      .bind(owner.tenantId, imported.importId)
      .first<{ status: string; rows: number; period: string; r2_key: string }>();
    expect(ledger).toMatchObject({ status: "完了", rows: 2 });
    expect(ledger?.period).toContain(week.replaceAll("-", "/"));
    expect(await (await env.MEDIA.get(ledger?.r2_key ?? ""))?.text()).toBe(body);
    const preview = await call(`/api/imports/${imported.importId}/preview`, {
      cookie: owner.cookie,
    });
    expect(preview.status).toBe(200);
    expect(((await preview.json()) as { status: string }).status).toBe("完了");

    const ownFunnel = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(ownFunnel.week?.results).toMatchObject({ revenueJpy: 300000, closedDeals: 2 });
    const otherFunnel = (await (
      await call("/api/dashboard/funnel", { cookie: other.cookie })
    ).json()) as FunnelResponse;
    expect(otherFunnel.week?.results.revenueJpy).toBeNull();
    await expectError(
      await call(`/api/imports/${imported.importId}/preview`, { cookie: other.cookie }),
      404,
      "NOT_FOUND",
    );

    const retry = await upload(owner, "csv", {
      name: "business-funnel-weekly.csv",
      body: `${header}\n${week},${channelId},LINE,200,20,3,400000\n`,
    });
    expect(((await retry.json()) as ImportResponse).status).toBe("完了");
    const latest = await env.DB.prepare(
      `SELECT COUNT(*) AS n, revenue_jpy FROM business_funnel_weekly
        WHERE tenant_id = ?1 AND channel_id = ?2 AND week_start = ?3`,
    )
      .bind(owner.tenantId, channelId, week)
      .first<{ n: number; revenue_jpy: number }>();
    expect(latest).toMatchObject({ n: 1, revenue_jpy: 400000 });
  });

  it("不正な行を失敗理由付きで記録し、正規化テーブルには一部も書かない", async () => {
    const owner = await newOwner("business-csv-invalid");
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const week = latestCompletedWeek(new Date());
    const valid = `${week},${channelId},LINE,100,10,2,300000`;
    const invalidCases: Array<{ body: string | Uint8Array<ArrayBuffer>; reason: string }> = [
      { body: `${header}\n${addDays(week, 1)},${channelId},LINE,1,1,1,1`, reason: "月曜日" },
      { body: `${header}\n${week},UC_other,LINE,1,1,1,1`, reason: "一致" },
      { body: `${header}\n${valid}\n${valid}`, reason: "重複" },
      { body: `${header}\n${week},${channelId},LINE,-1,1,1,1`, reason: "0以上" },
      { body: `${header}\n${week},${channelId},LINE,1.5,1,1,1`, reason: "0以上" },
      { body: `${header}\n${week},${channelId},LINE,1,1,1`, reason: "列数" },
      { body: "wrong,header\nx,y", reason: "列名" },
      { body: new Uint8Array([0xff, 0xfe, 0x41, 0x00]), reason: "UTF-8" },
    ];
    for (const { body, reason } of invalidCases) {
      const response = await upload(owner, "csv", { name: "business-funnel-weekly.csv", body });
      expect(response.status).toBe(201);
      const imported = (await response.json()) as ImportResponse;
      expect(imported.status).toBe("失敗");
      expect(imported.error).toContain(reason);
      const row = await env.DB.prepare(
        "SELECT status, error, r2_key FROM imports WHERE tenant_id = ?1 AND import_id = ?2",
      )
        .bind(owner.tenantId, imported.importId)
        .first<{ status: string; error: string; r2_key: string }>();
      expect(row?.status).toBe("失敗");
      expect(row?.error).toContain(reason);
      expect(await env.MEDIA.get(row?.r2_key ?? "")).not.toBeNull();
    }
    const normalized = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM business_funnel_weekly WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(normalized?.n).toBe(0);
  });

  it("route_label省略をLINEに補い、他のStudio CSVは処理待ちにする", async () => {
    const owner = await newOwner("business-csv-optional");
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const week = latestCompletedWeek(new Date());
    const normalized = await upload(owner, "csv", {
      name: "weekly-export.csv",
      body: `week_start,channel_id,route_visits,inquiries,closed_deals,revenue_jpy\n${week},${channelId},0,,,0`,
    });
    expect(((await normalized.json()) as ImportResponse).status).toBe("完了");
    const row = await env.DB.prepare(
      "SELECT route_label, route_visits, inquiries, revenue_jpy FROM business_funnel_weekly WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first();
    expect(row).toMatchObject({
      route_label: "LINE",
      route_visits: 0,
      inquiries: null,
      revenue_jpy: 0,
    });
    const studio = await upload(owner, "csv", {
      name: "studio.csv",
      body: `date,views\n${week},123`,
    });
    expect(((await studio.json()) as ImportResponse).status).toBe("処理待ち");
  });

  it("プレビューの100行上限に影響されず、全101週を取り込む", async () => {
    const owner = await newOwner("business-csv-101-weeks");
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const rows = Array.from({ length: 101 }, (_, index) => {
      const week = addDays("2024-01-01", index * 7);
      return `${week},${channelId},LINE,${index},,,`;
    });
    const response = await upload(owner, "csv", {
      name: "business-funnel-weekly.csv",
      body: `${header}\n${rows.join("\n")}`,
    });
    expect(response.status).toBe(201);
    expect((await response.json()) as ImportResponse).toMatchObject({ status: "完了", rows: 101 });
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM business_funnel_weekly WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(count?.n).toBe(101);
  });

  it("アップロード後に解除予約が入った場合は旧世代の指標を書かない", async () => {
    const owner = await newOwner("business-csv-deleting");
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const week = latestCompletedWeek(new Date());
    const original = BusinessCsvRepository.prototype.complete;
    vi.spyOn(BusinessCsvRepository.prototype, "complete").mockImplementationOnce(async function (
      this: BusinessCsvRepository,
      input,
    ) {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO data_deletions (deletion_id, tenant_id, scope, channel_id, requested_by, requested_at, due_at)
         VALUES (?1, ?2, 'channel', ?3, ?4, ?5, ?5)`,
      )
        .bind(crypto.randomUUID(), owner.tenantId, channelId, owner.userId, now)
        .run();
      return original.call(this, input);
    });
    await expectError(
      await upload(owner, "csv", {
        name: "business-funnel-weekly.csv",
        body: `${header}\n${week},${channelId},LINE,1,1,1,1`,
      }),
      409,
      "IMPORT_DELETION_PENDING",
    );
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM business_funnel_weekly WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
    vi.restoreAllMocks();
  });
});
