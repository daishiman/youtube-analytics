// セッションで選択中のテナントの Reporting API 対応レポート種類のみを列挙する。
import { Hono } from "hono";
import { getReportTypes } from "../usecases/report-types";
import type { AppEnv } from "./middleware";
import { sessionTenant } from "./middleware";

export const reportingRoutes = new Hono<AppEnv>();

reportingRoutes.get("/data/report-types", async (c) => {
  const body = await getReportTypes(c.get("deps"), sessionTenant(c));
  c.header("Cache-Control", "private, no-store");
  return c.json(body);
});
