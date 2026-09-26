// ダッシュボードの API（qa-093〜qa-099）。読み取り専用で、対象はセッションで選択中のテナントだけ。
// 応答は利用者ごとの内容なので Cache-Control: private を付け、共有キャッシュに残さない
import { Hono } from "hono";
import { getDashboard } from "../usecases/dashboard";
import { getFunnel } from "../usecases/funnel";
import { getThumbnail } from "../usecases/thumbnails";
import type { AppEnv } from "./middleware";
import { sessionTenant } from "./settings-routes";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get("/dashboard", async (c) => {
  const q = (name: string) => c.req.query(name) ?? null;
  const body = await getDashboard(c.get("deps"), sessionTenant(c), {
    period: q("period"),
    from: q("from"),
    to: q("to"),
    scope: q("scope"),
    video_ids: q("video_ids"),
  });
  c.header("Cache-Control", "private, no-store");
  return c.json(body);
});

dashboardRoutes.get("/dashboard/funnel", async (c) => {
  const body = await getFunnel(c.get("deps"), sessionTenant(c), {
    week: c.req.query("week") ?? null,
  });
  c.header("Cache-Control", "private, no-store");
  return c.json(body);
});

dashboardRoutes.get("/media/thumbnails/:video_id", async (c) => {
  const img = await getThumbnail(c.get("deps"), sessionTenant(c), c.req.param("video_id"));
  return new Response(img.body, {
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
