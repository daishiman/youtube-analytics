// Hono アプリの組立て。/api/* だけを扱い、それ以外は Workers 静的アセット（SPA）が返す
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { AppError } from "../lib/errors";
import { apiRoutes } from "./api-routes";
import { authRoutes } from "./auth-routes";
import { type AppEnv, authGate, csrfGuard, depsMiddleware } from "./middleware";

export const app = new Hono<AppEnv>();

// API 応答は利用者ごとの内容なので共有キャッシュ・ブラウザキャッシュに残さない。画面側のヘッダは public/_headers
app.use("/api/*", secureHeaders({ crossOriginResourcePolicy: "same-origin" }), async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
app.use("/api/*", depsMiddleware, authGate, csrfGuard);

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({ status: "ok", db: row?.ok === 1 });
});

app.route("/api/auth", authRoutes);
app.route("/api", apiRoutes);

app.notFound((c) => {
  const err = new AppError("NOT_FOUND");
  return c.json(err.toBody(), err.status);
});

app.onError((err, c) => {
  if (err instanceof AppError) return c.json(err.toBody(), err.status);
  console.error("unhandled", err);
  const internal = new AppError("INTERNAL");
  return c.json(internal.toBody(), internal.status);
});
