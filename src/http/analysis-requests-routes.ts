// AI分析の画面 API（セッション）。対象テナントはセッションで選択中のテナントだけ
import { Hono } from "hono";
import {
  diffReports,
  getReportDetail,
  importReport,
  listReports,
  registerReportActions,
  setReportArchived,
} from "../usecases/analysis-reports";
import {
  cancelAnalysisRequest,
  createAnalysisRequest,
  getAnalysisPrompt,
  getAnalysisRequest,
  getDataSummary,
  listAnalysisRequests,
  retryAnalysisRequest,
} from "../usecases/analysis-requests";
import { type AppEnv, readJson, readSkillJson, requestOrigin, sessionTenant } from "./middleware";

export const analysisRoutes = new Hono<AppEnv>();

analysisRoutes.get("/analysis-requests", async (c) =>
  c.json(await listAnalysisRequests(c.get("deps"), sessionTenant(c), c.req.query("cursor"))),
);

analysisRoutes.post("/analysis-requests", async (c) => {
  const body = await readJson(c);
  return c.json(await createAnalysisRequest(c.get("deps"), sessionTenant(c), body), 201);
});

analysisRoutes.get("/analysis-requests/:requestId", async (c) =>
  c.json(await getAnalysisRequest(c.get("deps"), sessionTenant(c), c.req.param("requestId"))),
);

analysisRoutes.get("/analysis-requests/:requestId/prompt", async (c) =>
  c.json(
    await getAnalysisPrompt(
      c.get("deps"),
      sessionTenant(c),
      c.req.param("requestId"),
      requestOrigin(c),
    ),
  ),
);

analysisRoutes.post("/analysis-requests/:requestId/cancel", async (c) =>
  c.json(await cancelAnalysisRequest(c.get("deps"), sessionTenant(c), c.req.param("requestId"))),
);

analysisRoutes.post("/analysis-requests/:requestId/retry", async (c) =>
  c.json(
    await retryAnalysisRequest(c.get("deps"), sessionTenant(c), c.req.param("requestId")),
    201,
  ),
);

analysisRoutes.get("/analysis/data-summary", async (c) =>
  c.json(
    await getDataSummary(c.get("deps"), sessionTenant(c), c.req.query("from"), c.req.query("to")),
  ),
);

analysisRoutes.get("/reports", async (c) =>
  c.json(
    await listReports(c.get("deps"), sessionTenant(c), {
      q: c.req.query("q"),
      archived: c.req.query("archived"),
      cursor: c.req.query("cursor"),
    }),
  ),
);

// /reports/:id より前に置く（"diff" を id と取り違えない）
analysisRoutes.get("/reports/diff", async (c) =>
  c.json(await diffReports(c.get("deps"), sessionTenant(c), c.req.query("a"), c.req.query("b"))),
);

analysisRoutes.post("/reports/import", async (c) => {
  const body = await readSkillJson(c);
  const result = await importReport(c.get("deps"), sessionTenant(c), body);
  return c.json(result.report, result.created ? 201 : 200);
});

analysisRoutes.get("/reports/:reportId", async (c) =>
  c.json(
    await getReportDetail(
      c.get("deps"),
      sessionTenant(c),
      c.req.param("reportId"),
      c.req.query("version"),
    ),
  ),
);

analysisRoutes.put("/reports/:reportId/archive", async (c) =>
  c.json(await setReportArchived(c.get("deps"), sessionTenant(c), c.req.param("reportId"), true)),
);

analysisRoutes.delete("/reports/:reportId/archive", async (c) =>
  c.json(await setReportArchived(c.get("deps"), sessionTenant(c), c.req.param("reportId"), false)),
);

analysisRoutes.post("/reports/:reportId/actions", async (c) => {
  const body = await readJson(c);
  return c.json(
    await registerReportActions(c.get("deps"), sessionTenant(c), c.req.param("reportId"), body),
    201,
  );
});
