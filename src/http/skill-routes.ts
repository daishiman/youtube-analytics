// Claude Code スキル連携 API（/api/skill/*）。セッションではなく Bearer 個人トークンで認証し、
// CSRF 検査の対象外（ブラウザが自動送信しないため）。版はヘッダ X-Skill-Api-Version で明示する
import { Hono } from "hono";
import { ingestReport } from "../usecases/analysis-reports";
import { createSkillRequest, patchSkillRequest } from "../usecases/analysis-requests";
import { exportForSkill, saveMedia, saveTranscript } from "../usecases/skill-export";
import { type AppEnv, readSkillJson, skillAuth } from "./middleware";

export const skillRoutes = new Hono<AppEnv>();
skillRoutes.use("*", skillAuth);

skillRoutes.get("/export", async (c) =>
  c.json(await exportForSkill(c.get("deps"), c.get("skill"), c.req.query("request_id"))),
);

skillRoutes.post("/requests", async (c) => {
  const body = await readSkillJson(c);
  return c.json(await createSkillRequest(c.get("deps"), c.get("skill"), body), 201);
});

skillRoutes.patch("/requests/:id", async (c) => {
  const body = await readSkillJson(c);
  return c.json(await patchSkillRequest(c.get("deps"), c.get("skill"), c.req.param("id"), body));
});

skillRoutes.post("/reports", async (c) => {
  const body = await readSkillJson(c);
  const result = await ingestReport(
    c.get("deps"),
    c.get("skill"),
    body,
    c.req.header("idempotency-key"),
  );
  return c.json(result.report, result.created ? 201 : 200);
});

skillRoutes.post("/transcripts", async (c) => {
  const body = await readSkillJson(c);
  return c.json(await saveTranscript(c.get("deps"), c.get("skill"), body), 201);
});

skillRoutes.post("/media", async (c) => {
  const body = await readSkillJson(c);
  return c.json(await saveMedia(c.get("deps"), c.get("skill"), body), 201);
});
