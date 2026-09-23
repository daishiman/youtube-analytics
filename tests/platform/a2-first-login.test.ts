// 受入 A2: 初回ログインで tenants と owner の tenant_members が1組だけ作られる
import { describe, expect, it } from "vitest";
import { call, count, login, uniqueEmail } from "./helpers";

const BIG = { MAX_TENANTS: "1000000" };

async function userIdOf(email: string): Promise<string> {
  const u = await login(email, { env: BIG });
  return u.userId;
}

describe("A2 初回ログインのテナント自動作成", () => {
  it("初回ログインで tenants 1件と owner 1件が作られ、/api/me に現れる", async () => {
    const email = uniqueEmail("first");
    const user = await login(email, { env: BIG });
    expect(user.outcome).toBe("tenant_created");
    expect(
      await count("SELECT COUNT(*) AS n FROM tenants WHERE created_by = ?1", user.userId),
    ).toBe(1);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM tenant_members WHERE user_id = ?1 AND role = 'owner'",
        user.userId,
      ),
    ).toBe(1);

    const me = (await (await call("/api/me", { cookie: user.cookie })).json()) as {
      currentTenant: { tenantId: string; role: string };
      tenants: unknown[];
    };
    expect(me.tenants).toHaveLength(1);
    expect(me.currentTenant).toMatchObject({ tenantId: user.tenantId, role: "owner" });
  });

  it("2回目以降のログインでは増えない", async () => {
    const email = uniqueEmail("again");
    const first = await login(email, { env: BIG });
    const second = await login(email, { env: BIG });
    expect(second.outcome).toBe("existing");
    expect(second.userId).toBe(first.userId);
    expect(second.tenantId).toBe(first.tenantId);
    expect(
      await count("SELECT COUNT(*) AS n FROM tenants WHERE created_by = ?1", first.userId),
    ).toBe(1);
    expect(
      await count("SELECT COUNT(*) AS n FROM tenant_members WHERE user_id = ?1", first.userId),
    ).toBe(1);
  });

  it("同じ利用者の並行ログインでも1組だけ", async () => {
    const email = uniqueEmail("race");
    const results = await Promise.all(Array.from({ length: 5 }, () => login(email, { env: BIG })));
    const userId = await userIdOf(email);
    expect(new Set(results.map((r) => r.userId)).size).toBe(1);
    expect(results.filter((r) => r.outcome === "tenant_created")).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS n FROM tenants WHERE created_by = ?1", userId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM tenant_members WHERE user_id = ?1", userId)).toBe(
      1,
    );
  });

  it("メール未確認の Google アカウントはログインできず、何も作られない", async () => {
    const email = uniqueEmail("unverified");
    await expect(login(email, { env: BIG, emailVerified: false })).rejects.toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = ?1", email)).toBe(0);
  });
});
