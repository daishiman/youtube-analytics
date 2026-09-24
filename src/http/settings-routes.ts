// 設定画面の API。対象テナントはセッションで選択中のテナントだけ（パスにテナント ID を取らない）
import type { Context } from "hono";
import { Hono } from "hono";
import type { TenantContext } from "../domain/tenant-context";
import { AppError } from "../lib/errors";
import { deleteGoogleClient, saveGoogleClient } from "../usecases/google-client";
import { createImport, listImports } from "../usecases/imports";
import { getSettings, requestTenantDeletion } from "../usecases/settings";
import { issueSkillToken, listSkillTokens, revokeSkillToken } from "../usecases/skill-tokens";
import { getUsage } from "../usecases/usage";
import {
  disconnectChannel,
  getChannelCandidates,
  handleOAuthCallback,
  selectChannel,
  setCaptionsAuto,
  startConnect,
  startReconnect,
} from "../usecases/youtube";
import { type AppEnv, readJson } from "./middleware";

export const settingsRoutes = new Hono<AppEnv>();

/** 選択中のテナントの TenantContext。未選択は NO_TENANT */
export function sessionTenant(c: Context<AppEnv>): TenantContext {
  const session = c.get("session");
  if (!session.tenantId || !session.role) throw new AppError("NO_TENANT");
  return { tenantId: session.tenantId, userId: session.userId, role: session.role };
}

const origin = (c: Context<AppEnv>) => new URL(c.req.url).origin;

settingsRoutes.get("/settings", async (c) =>
  c.json(await getSettings(c.get("deps"), sessionTenant(c))),
);

settingsRoutes.get("/usage", async (c) => {
  sessionTenant(c);
  return c.json({ usage: await getUsage(c.get("deps")) });
});

// ---- YouTube 連携 ----

settingsRoutes.post("/youtube/connect", async (c) =>
  c.json(await startConnect(c.get("deps"), sessionTenant(c), origin(c))),
);

settingsRoutes.post("/youtube/reconnect", async (c) =>
  c.json(await startReconnect(c.get("deps"), sessionTenant(c), origin(c))),
);

settingsRoutes.get("/youtube/channel-candidates", async (c) =>
  c.json(await getChannelCandidates(c.get("deps"), sessionTenant(c))),
);

settingsRoutes.post("/youtube/channel", async (c) => {
  const body = await readJson(c);
  return c.json(await selectChannel(c.get("deps"), sessionTenant(c), body.channelId), 201);
});

settingsRoutes.delete("/youtube/connection", async (c) => {
  const body = await readJson(c);
  return c.json(await disconnectChannel(c.get("deps"), sessionTenant(c), body.confirmName));
});

settingsRoutes.put("/youtube/captions-auto", async (c) => {
  const body = await readJson(c);
  return c.json(await setCaptionsAuto(c.get("deps"), sessionTenant(c), body.enabled, origin(c)));
});

/** テナントの Google Cloud OAuth クライアント（qa-087・オーナーのみ）。シークレットは応答に含めない */
settingsRoutes.put("/youtube/google-client", async (c) => {
  const body = await readJson(c);
  return c.json(await saveGoogleClient(c.get("deps"), sessionTenant(c), body));
});

settingsRoutes.delete("/youtube/google-client", async (c) => {
  return c.json(await deleteGoogleClient(c.get("deps"), sessionTenant(c)));
});

/** Google からのリダイレクト先（GET・トップレベル遷移なので CSRF ヘッダは付かない。state と本人照合で守る） */
settingsRoutes.get("/oauth/callback", async (c) => {
  const session = c.get("session");
  const ctx =
    session.tenantId && session.role
      ? { tenantId: session.tenantId, userId: session.userId, role: session.role }
      : null;
  const to = await handleOAuthCallback(
    c.get("deps"),
    ctx,
    { code: c.req.query("code"), state: c.req.query("state"), error: c.req.query("error") },
    origin(c),
  );
  return c.redirect(to, 302);
});

// ---- データ取込 ----

settingsRoutes.get("/imports", async (c) =>
  c.json({ imports: await listImports(c.get("deps"), sessionTenant(c)) }),
);

settingsRoutes.post("/imports", async (c) => {
  const ctx = sessionTenant(c);
  // 本文の形式が違っても、権限の判定（usecase 入口）を先に効かせる
  const form = await c.req.formData().catch(() => null);
  const result = await createImport(c.get("deps"), ctx, {
    kind: form?.get("kind") ?? null,
    file: form?.get("file") ?? null,
  });
  return c.json(result, 201);
});

// ---- Claude Code 連携トークン ----

settingsRoutes.get("/skill-tokens", async (c) =>
  c.json({ tokens: await listSkillTokens(c.get("deps"), sessionTenant(c)) }),
);

settingsRoutes.post("/skill-tokens", async (c) => {
  const body = await readJson(c);
  return c.json(await issueSkillToken(c.get("deps"), sessionTenant(c), body.name), 201);
});

settingsRoutes.delete("/skill-tokens/:tokenId", async (c) => {
  await revokeSkillToken(c.get("deps"), sessionTenant(c), c.req.param("tokenId"));
  return c.body(null, 204);
});

// ---- データ削除 ----

settingsRoutes.post("/tenant/delete", async (c) => {
  const body = await readJson(c);
  return c.json(
    await requestTenantDeletion(c.get("deps"), sessionTenant(c), body.confirmName),
    202,
  );
});
