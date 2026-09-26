import { Hono } from "hono";
import { requirePermission } from "../domain/tenant-context";
import type { ReportingMessage } from "../env";
import { AppError } from "../lib/errors";
import { ReportingRepository } from "../repositories/reporting-repository";
import type { AppEnv } from "./middleware";
import { sessionTenant } from "./middleware";

export const reportingSyncRoutes = new Hono<AppEnv>();

reportingSyncRoutes.get("/data/reporting-sync", async (c) => {
  const ctx = sessionTenant(c);
  requirePermission(ctx, "tenant.read");
  const repository = new ReportingRepository(c.env.DB);
  c.header("Cache-Control", "private, no-store");
  return c.json(await repository.summary(ctx.tenantId));
});

reportingSyncRoutes.get("/data/reporting-reports", async (c) => {
  const ctx = sessionTenant(c);
  requirePermission(ctx, "tenant.read");
  const rawPage = c.req.query("page") ?? "0";
  const page = Number(rawPage);
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page > 1_000_000) {
    throw new AppError("VALIDATION_FAILED", "page は0以上の整数で指定してください");
  }
  const repository = new ReportingRepository(c.env.DB);
  c.header("Cache-Control", "private, no-store");
  return c.json(await repository.listStoredReports(ctx.tenantId, page));
});

reportingSyncRoutes.get("/data/reporting-reports/:reportId/csv", async (c) => {
  const ctx = sessionTenant(c);
  requirePermission(ctx, "tenant.read");
  const reportId = c.req.param("reportId");
  const repository = new ReportingRepository(c.env.DB);
  const key = await repository.rawReportKey(ctx.tenantId, reportId);
  if (!key) throw new AppError("NOT_FOUND");
  const object = await c.env.MEDIA.get(key);
  if (!object) throw new AppError("NOT_FOUND");
  // R2読込中に認可失効や原本差替えがあれば、取得済みの旧原本を返さない。
  if ((await repository.rawReportKey(ctx.tenantId, reportId)) !== key) {
    throw new AppError("NOT_FOUND");
  }
  return new Response(object.body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-length": String(object.size),
      "content-disposition": `attachment; filename="youtube-report.csv"; filename*=UTF-8''${encodeURIComponent(`${reportId}.csv`)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

reportingSyncRoutes.post("/data/reporting-sync", async (c) => {
  const ctx = sessionTenant(c);
  requirePermission(ctx, "settings.manage");
  const repository = new ReportingRepository(c.env.DB);
  const message = await repository.currentMessage(ctx.tenantId);
  if (!message) {
    c.header("Cache-Control", "private, no-store");
    return c.json({ status: "not_linked", jobs: 0, stored: 0, remaining: false });
  }
  const request: ReportingMessage = {
    kind: "reporting",
    tenantId: message.tenantId,
    channelId: message.channelId,
    connectedAt: message.connectedAt,
    tokenUpdatedAt: message.tokenUpdatedAt,
  };
  await c.env.COLLECT_QUEUE.send(request);
  c.header("Cache-Control", "private, no-store");
  return c.json({ status: "queued" }, 202);
});
