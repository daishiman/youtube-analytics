// Hono アプリの組立て。/api/* だけを扱い、それ以外は Workers 静的アセット（SPA）が返す
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { AppError } from "../lib/errors";
import { analysisRoutes } from "./analysis-requests-routes";
import { apiRoutes } from "./api-routes";
import { authRoutes } from "./auth-routes";
import { type AppEnv, authGate, csrfGuard, depsMiddleware } from "./middleware";
import { SECURITY_HEADERS } from "./security-headers";
import { settingsRoutes } from "./settings-routes";
import { skillRoutes } from "./skill-routes";

export const app = new Hono<AppEnv>();

// API 応答は利用者ごとの内容なので共有キャッシュ・ブラウザキャッシュに残さない。
// CSP などは画面側（public/_headers）と同じ SECURITY_HEADERS を、secureHeaders の既定値より後に上書きする
app.use(
  "/api/*",
  async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.header(name, value);
    c.header("Cache-Control", "no-store");
  },
  secureHeaders({ crossOriginResourcePolicy: "same-origin" }),
);
app.use("/api/*", depsMiddleware, authGate, csrfGuard);

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({ status: "ok", db: row?.ok === 1 });
});

app.route("/api/auth", authRoutes);
app.route("/api", apiRoutes);
app.route("/api", settingsRoutes);
app.route("/api", analysisRoutes);
app.route("/api/skill", skillRoutes);

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
