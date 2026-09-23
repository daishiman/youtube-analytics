// 受入 A5: テナント数が MAX_TENANTS に達すると新規テナントを作らず受付停止メッセージを返す
import { describe, expect, it } from "vitest";
import { call, count, expectError, issueInvite, login, newOwner, uniqueEmail } from "./helpers";

const activeTenants = () => count("SELECT COUNT(*) AS n FROM tenants WHERE deleted_at IS NULL");

describe("A5 MAX_TENANTS による受付停止", () => {
  it("上限ちょうどまでは作られ、上限に達すると初回ログインでも作らない", async () => {
    const limit = { MAX_TENANTS: String((await activeTenants()) + 1) };
    const first = await login(uniqueEmail("last-seat"), { env: limit });
    expect(first.outcome).toBe("tenant_created");

    const before = await activeTenants();
    const late = await login(uniqueEmail("late"), { env: limit });
    expect(late.outcome).toBe("signup_closed");
    expect(late.tenantId).toBeNull();
    expect(await activeTenants()).toBe(before);

    // 画面は /api/me の signupClosed で「現在新規の受付を停止しています」を出す
    const me = (await (await call("/api/me", { cookie: late.cookie, env: limit })).json()) as {
      signupClosed: boolean;
      tenants: unknown[];
    };
    expect(me.signupClosed).toBe(true);
    expect(me.tenants).toHaveLength(0);
  });

  it("上限到達後はテナント追加 API も 403 SIGNUP_CLOSED（受付停止メッセージ）", async () => {
    const owner = await newOwner();
    const limit = { MAX_TENANTS: String(await activeTenants()) };
    const res = await call("/api/tenants", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "2つ目" },
      env: limit,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error).toMatchObject({
      code: "SIGNUP_CLOSED",
      message: "現在新規の受付を停止しています",
    });
  });

  it("上限到達後でも招待による参加はできる（上限の対象外）", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("invited-after-limit");
    const { token } = await issueInvite(owner, invited, "viewer");
    const limit = { MAX_TENANTS: String(await activeTenants()) };
    const before = await activeTenants();
    const member = await login(invited, { inviteToken: token, env: limit });
    expect(member.outcome).toBe("invite_accepted");
    expect(member.tenantId).toBe(owner.tenantId);
    expect(await activeTenants()).toBe(before);
  });

  it("残り1枠に別人が同時に初回ログインしても、作られるのは1件だけ", async () => {
    const limit = { MAX_TENANTS: String((await activeTenants()) + 1) };
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => login(uniqueEmail(`rush${i}`), { env: limit })),
    );
    expect(results.filter((r) => r.outcome === "tenant_created")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "signup_closed")).toHaveLength(4);
    expect(await activeTenants()).toBe(Number(limit.MAX_TENANTS));
  });

  it("上限未満ならテナント追加 API で2つ目を作れ、作成者が owner になる", async () => {
    const owner = await newOwner();
    const res = await call("/api/tenants", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "2つ目のチャンネル" },
      env: { MAX_TENANTS: "1000000" },
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { tenantId: string; role: string };
    expect(created.role).toBe("owner");
    const list = (await (await call("/api/tenants", { cookie: owner.cookie })).json()) as {
      tenants: unknown[];
    };
    expect(list.tenants).toHaveLength(2);
    await expectError(
      await call("/api/tenants", { method: "POST", cookie: owner.cookie, body: { name: "" } }),
      400,
      "VALIDATION_FAILED",
    );
  });
});
