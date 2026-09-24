// ローカル画面テスト用 seed（scripts/seed-local.sql）がマイグレーション済み D1 にそのまま入り、2回流しても壊れないこと
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import seed from "../../scripts/seed-local.sql?raw";
import { call, count } from "./helpers";

async function runSeed() {
  const statements = seed
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
}

describe("ローカル seed", () => {
  it("2回流しても同じ件数になり、テストアカウントの役割と招待が想定どおり", async () => {
    await runSeed();
    await runSeed();
    expect(
      await count("SELECT COUNT(*) AS n FROM tenant_members WHERE tenant_id LIKE 'seed-%'"),
    ).toBe(6);
    // トークンを持たない seed は、付与スコープがそろっていても partial
    const status = await env.DB.prepare(
      "SELECT tenant_id, youtube_link_status AS s FROM tenants WHERE tenant_id LIKE 'seed-%' ORDER BY tenant_id",
    ).all<{ tenant_id: string; s: string }>();
    expect(status.results.map((r) => [r.tenant_id, r.s])).toEqual([
      ["seed-tenant-a", "partial"],
      ["seed-tenant-b", "partial"],
      ["seed-tenant-p", "partial"],
    ]);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM oauth_tokens WHERE tenant_id LIKE 'seed-%' AND refresh_token_enc IS NULL",
      ),
    ).toBe(3);

    // dev-login は google_sub = dev:<メール> で seed 済み利用者に紐づく（新しいテナントを作らない）
    const viaDev = await call("/api/auth/dev-login", {
      method: "POST",
      body: { email: "viewer@example.com" },
      env: { DEV_LOGIN: "1" },
    });
    expect(await viaDev.json()).toMatchObject({ outcome: "existing" });
    const cookie = (viaDev.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const me = (await (await call("/api/me", { cookie })).json()) as {
      currentTenant: { tenantId: string; role: string };
    };
    expect(me.currentTenant).toMatchObject({ tenantId: "seed-tenant-a", role: "viewer" });

    const preview = await call(
      "/api/auth/invite?token=local-invite-editor-0000000000000000000000000",
    );
    expect(await preview.json()).toMatchObject({ tenantName: "テストチャンネルA", role: "editor" });
    const expired = await call(
      "/api/auth/invite?token=local-invite-expired-000000000000000000000000",
    );
    expect(expired.status).toBe(404);
  });
});
