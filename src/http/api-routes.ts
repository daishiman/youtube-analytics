// ログイン必須の API。テナント配下は tenantContextFor で TenantContext を作り、usecase 入口で役割を検査する
import { Hono } from "hono";
import { acceptInvite, createInvite, listInvites, revokeInvite } from "../usecases/invites";
import { changeRole, leaveTenant, listMembers, removeMember } from "../usecases/members";
import { createTenant, getMe, listMyTenants, switchTenant } from "../usecases/tenants";
import { type AppEnv, readJson, tenantContextFor } from "./middleware";

export const apiRoutes = new Hono<AppEnv>();

apiRoutes.get("/me", async (c) => c.json(await getMe(c.get("deps"), c.get("session"))));

apiRoutes.get("/tenants", async (c) =>
  c.json({ tenants: await listMyTenants(c.get("deps"), c.get("session").userId) }),
);

apiRoutes.post("/tenants", async (c) => {
  const body = await readJson(c);
  return c.json(await createTenant(c.get("deps"), c.get("session"), body.name), 201);
});

apiRoutes.post("/session/tenant", async (c) => {
  const body = await readJson(c);
  return c.json(await switchTenant(c.get("deps"), c.get("session"), body.tenantId));
});

apiRoutes.get("/tenants/:id/members", async (c) => {
  const ctx = tenantContextFor(c, c.req.param("id"));
  return c.json({ members: await listMembers(c.get("deps"), ctx) });
});

apiRoutes.patch("/tenants/:id/members/:userId", async (c) => {
  const ctx = tenantContextFor(c, c.req.param("id"));
  const body = await readJson(c);
  return c.json({ member: await changeRole(c.get("deps"), ctx, c.req.param("userId"), body.role) });
});

apiRoutes.delete("/tenants/:id/members/:userId", async (c) => {
  const ctx = tenantContextFor(c, c.req.param("id"));
  await removeMember(c.get("deps"), ctx, c.req.param("userId"));
  return c.body(null, 204);
});

apiRoutes.post("/tenants/:id/leave", async (c) => {
  const ctx = tenantContextFor(c, c.req.param("id"));
  await leaveTenant(c.get("deps"), ctx);
  return c.body(null, 204);
});

apiRoutes.get("/tenants/:id/invites", async (c) => {
  const ctx = tenantContextFor(c, c.req.param("id"));
  return c.json({ invites: await listInvites(c.get("deps"), ctx) });
});

apiRoutes.post("/tenants/:id/invites", async (c) => {
  const ctx = tenantContextFor(c, c.req.param("id"));
  const body = await readJson(c);
  const origin = new URL(c.req.url).origin;
  return c.json(
    await createInvite(c.get("deps"), ctx, { email: body.email, role: body.role }, origin),
    201,
  );
});

apiRoutes.delete("/tenants/:id/invites/:inviteId", async (c) => {
  const ctx = tenantContextFor(c, c.req.param("id"));
  await revokeInvite(c.get("deps"), ctx, c.req.param("inviteId"));
  return c.body(null, 204);
});

apiRoutes.post("/invites/accept", async (c) => {
  const deps = c.get("deps");
  const session = c.get("session");
  const body = await readJson(c);
  // 確認済みメールだけがセッションに残る（未確認メールはログイン時点で拒否済み）
  const { tenantId } = await acceptInvite(
    deps,
    { userId: session.userId, email: session.email, emailVerified: true },
    body.token,
  );
  return c.json(await switchTenant(deps, session, tenantId));
});
