import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { call, login, newOwner, uniqueEmail } from "./helpers";

describe("sessionとtenant選好のlifecycle", () => {
  it("logoutでsessionを削除しても最後に選んだtenantを次回loginで復元する", async () => {
    const email = uniqueEmail("preference");
    const first = await login(email, { env: { MAX_TENANTS: "1000000" } });
    const create = await call("/api/tenants", {
      method: "POST",
      cookie: first.cookie,
      body: { name: "復元対象" },
      env: { MAX_TENANTS: "1000000" },
    });
    expect(create.status).toBe(201);
    const selected = ((await create.json()) as { tenantId: string }).tenantId;

    expect((await call("/api/auth/logout", { method: "POST", cookie: first.cookie })).status).toBe(
      200,
    );
    const second = await login(email, { env: { MAX_TENANTS: "1000000" } });
    expect(second.tenantId).toBe(selected);
  });

  it("expired session cleanupは1 loginあたり100件に制限する", async () => {
    const owner = await newOwner("cleanup");
    const statements = Array.from({ length: 105 }, (_, index) =>
      env.DB.prepare(
        `INSERT INTO sessions (session_id_hash, user_id, tenant_id, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(
        `expired-${crypto.randomUUID()}-${index}`,
        owner.userId,
        owner.tenantId,
        "2020-01-01T00:00:00.000Z",
        "2020-01-02T00:00:00.000Z",
      ),
    );
    await env.DB.batch(statements);

    await login(owner.email, { env: { MAX_TENANTS: "1000000" } });
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?1 AND expires_at <= ?2",
    )
      .bind(owner.userId, new Date().toISOString())
      .first<{ n: number }>();
    expect(remaining?.n).toBe(5);
  });
});
