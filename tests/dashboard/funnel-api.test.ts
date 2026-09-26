// GET /api/dashboard/funnel（qa-093・qa-060）: 直近の完了週・12週の履歴・鮮度・入力検証
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addDays, jstStartIso } from "../../src/domain/dashboard-period";
import {
  FUNNEL_HISTORY_WEEKS,
  type FunnelResponse,
  latestCompletedWeek,
} from "../../src/usecases/funnel";
import { call, expectError, newOwner } from "../platform/helpers";
import { seedDashboard } from "./helpers";

async function seedBusiness(tenantId: string, channelId: string, week: string, importedAt: string) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO business_funnel_weekly (tenant_id, channel_id, week_start, route_visits, inquiries, closed_deals, revenue_jpy, imported_at)
       VALUES (?1, ?2, ?3, 100, 10, 2, 300000, ?4)`,
    ).bind(tenantId, channelId, week, importedAt),
    env.DB.prepare(
      `INSERT INTO funnel_targets (tenant_id, channel_id, metric_id, target_value, min_sample, effective_from) VALUES
         (?1, ?2, 'impressions', 50000, 0, '2020-01-06'),
         (?1, ?2, 'ctr', 6, 1000, '2020-01-06'),
         (?1, ?2, 'weighted_retention_m1', 30, 100, '2020-01-06'),
         (?1, ?2, 'lead_route_rate', 1, 100, '2020-01-06'),
         (?1, ?2, 'inquiry_close_rate', 10, 5, '2020-01-06')`,
    ).bind(tenantId, channelId),
  ]);
}

async function seedM1Provenance(
  tenantId: string,
  channelId: string,
  week: string,
  importedAt: string,
) {
  const importId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO studio_csv_imports
       (tenant_id, import_id, channel_id, studio_kind, mapped_columns, unmapped_columns,
        normalized_rows, unresolved_rows, period_status, imported_at)
       VALUES (?1, ?2, ?3, 'graph', 3, 0, 7, 0, 'daily', ?4)`,
    ).bind(tenantId, importId, channelId, importedAt),
    env.DB.prepare(
      `UPDATE video_daily_metrics
          SET views_csv_import_id = ?1, average_view_percentage_csv_import_id = ?1
        WHERE tenant_id = ?2 AND date BETWEEN ?3 AND ?4`,
    ).bind(importId, tenantId, week, addDays(week, 6)),
  ]);
}

describe("GET /api/dashboard/funnel", () => {
  it("既定は直近の完了週で、判定・12週の履歴・成果を返す", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    await seedBusiness(owner.tenantId, channelId, week, new Date().toISOString());
    await seedM1Provenance(owner.tenantId, channelId, week, new Date().toISOString());
    const res = await call("/api/dashboard/funnel", { cookie: owner.cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as FunnelResponse;
    expect(body.week?.weekStart).toBe(week);
    expect(body.week?.weekEnd).toBe(addDays(week, 6));
    expect(body.week?.stale).toBe(false);
    expect(body.history).toHaveLength(FUNNEL_HISTORY_WEEKS);
    expect(body.history.at(-1)?.weekStart).toBe(week);
    const m = Object.fromEntries((body.week?.metrics ?? []).map((x) => [x.id, x]));
    // 1日 impressions 10000 × 7日、CTR 5% の重み付き平均
    expect(m.impressions?.actual).toBe(70000);
    expect(m.ctr?.actual).toBeCloseTo(5, 6);
    expect(m.ctr?.target_gap).toBeCloseTo(-1 / 6, 6);
    expect(m.ctr).not.toHaveProperty("gap");
    expect(m.inquiry_close_rate?.actual).toBe(20);
    expect(body.week?.candidate?.metricId).toBe("ctr");
    expect(body.week?.results).toEqual({ revenueJpy: 300000, closedDeals: 2, subscribersNet: 14 });
    expect(body.dataQuality.missingDays).toBe(0);
    expect(body.rateBasis).toBe("same_week_snapshot");
    expect(body.disclaimer).toContain("因果関係");
  });

  it("登録者の増減はチャンネル全体（all）の行だけを週に合計する", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    await seedBusiness(owner.tenantId, channelId, week, new Date().toISOString());
    await env.DB.prepare(
      `INSERT INTO daily_metrics (tenant_id, channel_id, date, content_type, views, estimated_minutes_watched, subscribers_gained, subscribers_lost, fetched_at)
       VALUES (?1, ?2, ?3, 'shorts', 999, 999, 50, 0, ?4)`,
    )
      .bind(owner.tenantId, channelId, addDays(week, 2), new Date().toISOString())
      .run();
    const body = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(body.week?.results?.subscribersNet).toBe(14);
  });

  it("週末より前に取り込んだ事業 CSV は鮮度切れとして判定を保留する", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    await seedBusiness(owner.tenantId, channelId, week, `${addDays(week, 3)}T00:00:00Z`);
    const body = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(body.week?.stale).toBe(true);
    expect(body.week?.candidate).toBeNull();
    expect(body.week?.metrics.every((x) => x.reasons.includes("stale"))).toBe(true);
  });

  it("別週の事業 CSV を後から取り込んでも対象週の鮮度は更新しない", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    const oldImport = jstStartIso(addDays(week, 3));
    await seedBusiness(owner.tenantId, channelId, week, oldImport);
    await env.DB.prepare(
      `INSERT INTO business_funnel_weekly (tenant_id, channel_id, week_start, imported_at)
       VALUES (?1, ?2, ?3, ?4)`,
    )
      .bind(owner.tenantId, channelId, addDays(week, -7), new Date().toISOString())
      .run();

    const body = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(body.week?.stale).toBe(true);
    expect(body.dataQuality.businessImportedAt).toBe(oldImport);
    expect(body.week?.candidate).toBeNull();
  });

  it("別週の Studio 日次を後から取り込んでも対象週の鮮度は更新しない", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    const oldImport = jstStartIso(addDays(week, 3));
    await env.DB.prepare(
      `UPDATE channel_daily_metrics SET imported_at = ?1
        WHERE tenant_id = ?2 AND channel_id = ?3 AND date BETWEEN ?4 AND ?5`,
    )
      .bind(oldImport, owner.tenantId, channelId, week, addDays(week, 6))
      .run();
    await seedBusiness(owner.tenantId, channelId, week, new Date().toISOString());

    const body = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(body.week?.stale).toBe(true);
    expect(body.dataQuality.studioImportedAt).toBe(oldImport);
    expect(body.dataQuality.missingDays).toBe(0);
    expect(body.week?.candidate).toBeNull();
  });

  it("週内のStudio日次が1日だけ新しくても判定保留にする", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    const oldImport = jstStartIso(addDays(week, 3));
    await env.DB.prepare(
      `UPDATE channel_daily_metrics SET imported_at = ?1
        WHERE tenant_id = ?2 AND channel_id = ?3 AND date BETWEEN ?4 AND ?5`,
    )
      .bind(oldImport, owner.tenantId, channelId, week, addDays(week, 6))
      .run();
    await env.DB.prepare(
      `UPDATE channel_daily_metrics SET imported_at = ?1
        WHERE tenant_id = ?2 AND channel_id = ?3 AND date = ?4`,
    )
      .bind(new Date().toISOString(), owner.tenantId, channelId, week)
      .run();
    await seedM1Provenance(owner.tenantId, channelId, week, new Date().toISOString());
    await seedBusiness(owner.tenantId, channelId, week, new Date().toISOString());
    const body = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(body.week?.stale).toBe(true);
    expect(body.dataQuality.missingDays).toBe(0);
  });

  it("M1の日次値に出典が無いか週末前の出典なら保留し、対象週の再取込で復旧する", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    await seedBusiness(owner.tenantId, channelId, week, new Date().toISOString());
    const get = async () =>
      (await (
        await call("/api/dashboard/funnel", { cookie: owner.cookie })
      ).json()) as FunnelResponse;
    expect((await get()).week?.stale).toBe(true);
    await seedM1Provenance(owner.tenantId, channelId, week, jstStartIso(addDays(week, 3)));
    expect((await get()).week?.stale).toBe(true);
    await seedM1Provenance(owner.tenantId, channelId, week, new Date().toISOString());
    expect((await get()).week?.stale).toBe(false);
  });

  it("グラフCSVにM1の日次値がない週は他の入力が新しくても候補を保留する", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    await seedBusiness(owner.tenantId, channelId, week, new Date().toISOString());
    await env.DB.prepare(
      `UPDATE video_daily_metrics SET average_view_percentage = NULL
        WHERE tenant_id = ?1 AND date BETWEEN ?2 AND ?3`,
    )
      .bind(owner.tenantId, week, addDays(week, 6))
      .run();
    const body = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(body.week?.stale).toBe(true);
    expect(body.week?.candidate).toBeNull();
    expect(
      body.week?.metrics.find((metric) => metric.id === "weighted_retention_m1")?.reasons,
    ).toContain("missing_input");
  });

  it("M1の日次値が6日分だけの週も判定を保留する", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
      days: 30,
    });
    const week = latestCompletedWeek(new Date());
    await seedBusiness(owner.tenantId, channelId, week, new Date().toISOString());
    await seedM1Provenance(owner.tenantId, channelId, week, new Date().toISOString());
    await env.DB.prepare(
      `UPDATE video_daily_metrics SET average_view_percentage = NULL
        WHERE tenant_id = ?1 AND date = ?2`,
    )
      .bind(owner.tenantId, week)
      .run();
    const body = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(body.week?.stale).toBe(true);
    expect(body.week?.candidate).toBeNull();
  });

  it("チャンネル未連携なら week は null", async () => {
    const owner = await newOwner();
    const body = (await (
      await call("/api/dashboard/funnel", { cookie: owner.cookie })
    ).json()) as FunnelResponse;
    expect(body.week).toBeNull();
    expect(body.history).toEqual([]);
  });

  it("月曜以外・未完了の週は 400、未ログインは 401", async () => {
    const owner = await newOwner();
    const next = addDays(latestCompletedWeek(new Date()), 7);
    await expectError(
      await call("/api/dashboard/funnel?week=2026-09-22", { cookie: owner.cookie }),
      400,
      "VALIDATION_FAILED",
    );
    await expectError(
      await call(`/api/dashboard/funnel?week=${next}`, { cookie: owner.cookie }),
      400,
      "VALIDATION_FAILED",
    );
    await expectError(await call("/api/dashboard/funnel"), 401, "UNAUTHENTICATED");
  });
});
