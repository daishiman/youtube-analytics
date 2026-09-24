// A5・A8: 付与されたスコープから連携状態を決める・トークンを暗号化して保存する・Google のエラー内容を漏らさない
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptToken } from "../../src/usecases/token-crypto";
import { addMember, call, issueInvite, newOwner, uniqueEmail } from "../platform/helpers";
import { FULL_GRANT, finish, sessionCookieOf, start, startLogin, YT } from "./oauth";

afterEach(() => vi.restoreAllMocks());

async function tenantState(email: string) {
  return env.DB.prepare(
    `SELECT t.tenant_id, t.youtube_link_status AS status, o.scope, o.refresh_token_enc
       FROM users u
       JOIN tenant_members m ON m.user_id = u.user_id AND m.role = 'owner'
       JOIN tenants t ON t.tenant_id = m.tenant_id
       LEFT JOIN oauth_tokens o ON o.tenant_id = t.tenant_id
      WHERE u.email = ?1`,
  )
    .bind(email)
    .first<{
      tenant_id: string;
      status: string;
      scope: string | null;
      refresh_token_enc: string | null;
    }>();
}

describe("A5 付与されたスコープと連携状態", () => {
  it("両方の YouTube スコープが付与されたら linked にし、refresh token を暗号化して保存する", async () => {
    const email = uniqueEmail("linked");
    const res = await finish(
      await startLogin(),
      { sub: `g-${email}`, email },
      { scope: FULL_GRANT, refresh_token: "1//refresh-secret" },
    );
    expect(res.headers.get("location")).toBe("/");
    const row = await tenantState(email);
    expect(row?.status).toBe("linked");
    expect(row?.scope).toBe(FULL_GRANT);
    expect(row?.refresh_token_enc).toBeTruthy();
    expect(row?.refresh_token_enc).not.toContain("refresh-secret");
    expect(await decryptToken(env.TOKEN_ENC_KEY, row?.refresh_token_enc ?? "")).toBe(
      "1//refresh-secret",
    );
    const me = await call("/api/me", { cookie: sessionCookieOf(res) });
    expect(await me.json()).toMatchObject({ currentTenant: { youtubeLinkStatus: "linked" } });
  });

  it("初回に両スコープだけ返り refresh token がない場合は partial のままログインし、再連携で修復できる", async () => {
    const email = uniqueEmail("no-refresh");
    const id = { sub: `g-${email}`, email };
    const first = await finish(await startLogin(), id, { scope: FULL_GRANT });
    expect(first.headers.get("location")).toBe("/");
    expect(sessionCookieOf(first)).not.toBe("");
    expect(await tenantState(email)).toMatchObject({
      status: "partial",
      scope: FULL_GRANT,
      refresh_token_enc: null,
    });

    const cookie = sessionCookieOf(first);
    const connect = await start("/api/auth/youtube/connect", { cookie });
    const repairedResponse = await finish(
      connect,
      id,
      { scope: FULL_GRANT, refresh_token: "repaired-token" },
      { cookie },
    );
    expect(repairedResponse.headers.get("location")).toBe("/");
    const repaired = await tenantState(email);
    expect(repaired?.status).toBe("linked");
    expect(await decryptToken(env.TOKEN_ENC_KEY, repaired?.refresh_token_enc ?? "")).toBe(
      "repaired-token",
    );
  });

  it("YouTube スコープの一部だけ許可されてもログインとテナント作成は完了し、partial を保存する", async () => {
    const email = uniqueEmail("partial");
    const res = await finish(
      await startLogin(),
      { sub: `g-${email}`, email },
      { scope: `openid email ${YT}` },
    );
    expect(res.headers.get("location")).toBe("/");
    expect(sessionCookieOf(res)).not.toBe("");
    expect((await tenantState(email))?.status).toBe("partial");
  });

  it("scope が返らないときは partial とみなす", async () => {
    const email = uniqueEmail("noscope");
    await finish(await startLogin(), { sub: `g-${email}`, email });
    expect((await tenantState(email))?.status).toBe("partial");
  });

  it("2回目の同意で refresh token が返らなくても、保存済みの値を残す", async () => {
    const email = uniqueEmail("keep");
    const id = { sub: `g-${email}`, email };
    await finish(await startLogin(), id, { scope: FULL_GRANT, refresh_token: "first-token" });
    const before = (await tenantState(email))?.refresh_token_enc;
    await finish(await startLogin(), id, { scope: FULL_GRANT });
    const after = await tenantState(email);
    expect(after?.refresh_token_enc).toBe(before);
    expect(after?.status).toBe("linked");
  });

  it("別の所有者への付与では前の所有者の refresh token を引き継がない", async () => {
    const first = await newOwner("first-token-owner");
    await finish(
      await startLogin(),
      { sub: `test:${first.email}`, email: first.email },
      { scope: FULL_GRANT, refresh_token: "first-owner-token" },
    );
    const second = await addMember(first, "viewer");
    const promote = await call(`/api/tenants/${first.tenantId}/members/${second.userId}`, {
      method: "PATCH",
      cookie: first.cookie,
      body: { role: "owner" },
    });
    expect(promote.status).toBe(200);

    await finish(
      await startLogin(),
      { sub: `test:${second.email}`, email: second.email },
      { scope: FULL_GRANT },
    );
    const row = await env.DB.prepare(
      `SELECT t.youtube_link_status AS status, o.user_id, o.refresh_token_enc
         FROM tenants t JOIN oauth_tokens o ON o.tenant_id = t.tenant_id
        WHERE t.tenant_id = ?1`,
    )
      .bind(first.tenantId)
      .first<{ status: string; user_id: string; refresh_token_enc: string | null }>();
    expect(row).toEqual({
      status: "partial",
      user_id: second.userId,
      refresh_token_enc: null,
    });
  });

  it("招待でのログインではトークンも連携状態も触らない", async () => {
    const owner = await newOwner();
    const email = uniqueEmail("invitee");
    const { token } = await issueInvite(owner, email, "editor");
    const res = await finish(
      await startLogin(`&invite=${token}`),
      { sub: `g-${email}`, email },
      { scope: "openid email" },
    );
    expect(res.headers.get("location")).toBe("/");
    const row = await env.DB.prepare(
      `SELECT t.youtube_link_status AS status,
              (SELECT COUNT(*) FROM oauth_tokens WHERE tenant_id = t.tenant_id) AS n
         FROM tenants t WHERE t.tenant_id = ?1`,
    )
      .bind(owner.tenantId)
      .first<{ status: string; n: number }>();
    expect(row).toEqual({ status: "none", n: 0 });
  });

  it("最後に選んだテナントが閲覧先でも、所有先が一つならその所有先に付与を保存する", async () => {
    const owner = await newOwner("grant-owner");
    const other = await newOwner("grant-viewer");
    await env.DB.prepare(
      "INSERT INTO tenant_members (tenant_id, user_id, role, joined_at) VALUES (?1, ?2, 'viewer', ?3)",
    )
      .bind(other.tenantId, owner.userId, new Date().toISOString())
      .run();
    const switched = await call("/api/session/tenant", {
      method: "POST",
      cookie: owner.cookie,
      body: { tenantId: other.tenantId },
    });
    expect(switched.status).toBe(200);

    const res = await finish(
      await startLogin(),
      { sub: `test:${owner.email}`, email: owner.email },
      { scope: FULL_GRANT, refresh_token: "owner-token" },
    );
    expect(res.headers.get("location")).toBe("/");
    expect((await tenantState(owner.email))?.status).toBe("linked");
    const otherState = await env.DB.prepare(
      "SELECT youtube_link_status AS status FROM tenants WHERE tenant_id = ?1",
    )
      .bind(other.tenantId)
      .first<{ status: string }>();
    expect(otherState?.status).toBe("none");
  });

  it("閲覧先を選択し所有先が複数ある場合は、付与先を推測せずログインする", async () => {
    const owner = await newOwner("grant-ambiguous");
    const create = await call("/api/tenants", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "二つ目の所有先" },
      env: { MAX_TENANTS: "1000000" },
    });
    expect(create.status).toBe(201);
    const secondTenantId = ((await create.json()) as { tenantId: string }).tenantId;
    const other = await newOwner("grant-other");
    await env.DB.prepare(
      "INSERT INTO tenant_members (tenant_id, user_id, role, joined_at) VALUES (?1, ?2, 'viewer', ?3)",
    )
      .bind(other.tenantId, owner.userId, new Date().toISOString())
      .run();
    const switched = await call("/api/session/tenant", {
      method: "POST",
      cookie: owner.cookie,
      body: { tenantId: other.tenantId },
    });
    expect(switched.status).toBe(200);

    const res = await finish(
      await startLogin(),
      { sub: `test:${owner.email}`, email: owner.email },
      { scope: FULL_GRANT, refresh_token: "ambiguous-token" },
    );
    expect(res.headers.get("location")).toBe("/");
    expect(sessionCookieOf(res)).not.toBe("");
    const rows = await env.DB.prepare(
      "SELECT tenant_id FROM oauth_tokens WHERE tenant_id IN (?1, ?2, ?3)",
    )
      .bind(owner.tenantId, secondTenantId, other.tenantId)
      .all<{ tenant_id: string }>();
    expect(rows.results).toEqual([]);
  });
});

describe("A8 エラー内容を漏らさない", () => {
  it("Google が error と error_description を返しても、OAUTH_FAILED だけにする", async () => {
    const { url, cookie } = await startLogin();
    const state = url?.searchParams.get("state") ?? "";
    const res = await call(
      `/api/auth/callback?error=access_denied&error_description=${encodeURIComponent("<script>secret</script>")}&state=${state}`,
      { cookie },
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toBe("/login?error=OAUTH_FAILED");
    expect(location).not.toContain("secret");
  });
});
