import { Hono } from "hono";
import {
  ANALYTICS_DIMENSION_KEYS,
  type AnalyticsDimensionKey,
} from "../adapters/google-analytics-dimensions";
import { requirePermission } from "../domain/tenant-context";
import { AppError } from "../lib/errors";
import { AnalyticsRawRepository } from "../repositories/analytics-raw-repository";
import type { AppEnv } from "./middleware";
import { sessionTenant } from "./settings-routes";

export const analyticsRawRoutes = new Hono<AppEnv>();

analyticsRawRoutes.get("/data/analytics-raw", async (c) => {
  const ctx = sessionTenant(c);
  requirePermission(ctx, "tenant.read");
  c.header("Cache-Control", "private, no-store");
  return c.json(await new AnalyticsRawRepository(c.env.DB).listReports(ctx.tenantId));
});

analyticsRawRoutes.get("/data/analytics-raw/:reportKey/rows", async (c) => {
  const ctx = sessionTenant(c);
  requirePermission(ctx, "tenant.read");
  const reportKey = c.req.param("reportKey");
  if (!ANALYTICS_DIMENSION_KEYS.includes(reportKey as AnalyticsDimensionKey)) {
    throw new AppError("NOT_FOUND");
  }
  const rawOffset = c.req.query("offset") ?? "0";
  const rawLimit = c.req.query("limit") ?? "100";
  const offset = Number(rawOffset);
  const limit = Number(rawLimit);
  if (
    !/^\d+$/.test(rawOffset) ||
    !/^\d+$/.test(rawLimit) ||
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(limit) ||
    offset > 1_000_000 ||
    limit < 1 ||
    limit > 500
  ) {
    throw new AppError("VALIDATION_FAILED", "offsetは0以上、limitは1〜500の整数で指定してください");
  }
  const page = await new AnalyticsRawRepository(c.env.DB).getReportRows(
    ctx.tenantId,
    reportKey as AnalyticsDimensionKey,
    offset,
    limit,
  );
  if (!page) throw new AppError("NOT_FOUND");
  c.header("Cache-Control", "private, no-store");
  return c.json(page);
});
