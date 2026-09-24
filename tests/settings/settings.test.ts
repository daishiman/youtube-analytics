// 受入 1・9: 設定画面の一括取得（役割ごとの表示権限）・Origin 不一致の書込拒否・データ削除の受付・最終更新
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addMember, call, expectError, login, newOwner, uniqueEmail } from "../platform/helpers";
import { bodyFor, fill, SESSION_TENANT_ROUTES } from "../platform/routes";
import { auditCount, tenantName } from "./helpers";

type Settings = {
  tenant: { tenantId: string; name: string };
  role: string;
  permissions: { manageSettings: boolean; writeContent: boolean; manageMembers: boolean };
  youtube: { status: string; channel: unknown; nextCollection: string | null };
  imports: unknown[];
  tokens: unknown[];
  tokenLimit: number;
  usage: unknown[];
  deletion: { dueAt: string } | null;
};

describe("GET /api/settings", () => {
  it("6セクション分の情報を1回で返し、役割ごとに操作できる範囲を示す", async () => {
    const owner = await newOwner("set-get");
    const editor = await addMember(owner, "editor");
    const viewer = await addMember(owner, "viewer");
    const expected = {
      owner: { manageSettings: true, writeContent: true, manageMembers: true },
      editor: { manageSettings: false, writeContent: true, manageMembers: false },
      viewer: { manageSettings: false, writeContent: false, manageMembers: false },
    };
    for (const [role, user] of [
      ["owner", owner],
      ["editor", editor],
      ["viewer", viewer],
    ] as const) {
      const res = await call("/api/settings", { cookie: user.cookie });
      expect(res.status).toBe(200);
      const s = (await res.json()) as Settings;
      expect(s.role).toBe(role);
      expect(s.permissions).toEqual(expected[role]);
      expect(s.tenant.tenantId).toBe(owner.tenantId);
      expect(s.youtube).toMatchObject({ status: "未連携", channel: null, nextCollection: null });
      expect(s.tokenLimit).toBe(5);
      expect(Array.isArray(s.imports) && Array.isArray(s.tokens) && Array.isArray(s.usage)).toBe(
        true,
      );
      expect(s.deletion).toBeNull();
    }
  });

  it("テナント未所属は 403 NO_TENANT", async () => {
    const user = await login(uniqueEmail("set-none"), { env: { MAX_TENANTS: "0" } });
    expect(user.tenantId).toBeNull();
    await expectError(await call("/api/settings", { cookie: user.cookie }), 403, "NO_TENANT");
  });
});

describe("役割による書込の制限", () => {
  const writes = SESSION_TENANT_ROUTES.filter((r) => r.method !== "GET");

  for (const route of writes.filter((r) => r.kind === "session-owner")) {
    it(`${route.method} ${route.path} は editor・viewer が 403`, async () => {
      const owner = await newOwner("set-role-o");
      for (const role of ["editor", "viewer"] as const) {
        const member = await addMember(owner, role);
        await expectError(
          await call(fill(route.path, {}), {
            method: route.method,
            cookie: member.cookie,
            body: bodyFor(route),
          }),
          403,
          "FORBIDDEN",
        );
      }
    });
  }

  for (const route of writes.filter((r) => r.kind === "session-writer")) {
    it(`${route.method} ${route.path} は viewer が 403`, async () => {
      const owner = await newOwner("set-role-w");
      const viewer = await addMember(owner, "viewer");
      await expectError(
        await call(fill(route.path, {}), {
          method: route.method,
          cookie: viewer.cookie,
          body: bodyFor(route),
        }),
        403,
        "FORBIDDEN",
      );
    });
  }
});

describe("Origin 不一致の書込は拒否", () => {
  for (const route of SESSION_TENANT_ROUTES.filter((r) => r.method !== "GET")) {
    it(`${route.method} ${route.path} は別 Origin から 403 CSRF_REJECTED`, async () => {
      const owner = await newOwner("set-csrf");
      await expectError(
        await call(fill(route.path, {}), {
          method: route.method,
          cookie: owner.cookie,
          body: bodyFor(route),
          headers: { origin: "https://evil.example.com" },
        }),
        403,
        "CSRF_REJECTED",
      );
      await expectError(
        await call(fill(route.path, {}), {
          method: route.method,
          cookie: owner.cookie,
          body: bodyFor(route),
          csrf: false,
        }),
        403,
        "CSRF_REJECTED",
      );
    });
  }

  it("拒否された書込は監査ログにもデータにも残らない", async () => {
    const owner = await newOwner("set-csrf-none");
    await call("/api/skill-tokens", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "x" },
      headers: { origin: "https://evil.example.com" },
    });
    expect(await auditCount(owner.tenantId, "token.issue")).toBe(0);
  });
});

describe("データを削除（テナント）", () => {
  it("テナント名の入力で受け付け、7日後の期限で予約・監査ログ1件・二重受付しない", async () => {
    const owner = await newOwner("set-del");
    await expectError(
      await call("/api/tenant/delete", {
        method: "POST",
        cookie: owner.cookie,
        body: { confirmName: "ちがう" },
      }),
      400,
      "CONFIRM_MISMATCH",
    );
    const name = await tenantName(owner.tenantId);
    const res = await call("/api/tenant/delete", {
      method: "POST",
      cookie: owner.cookie,
      body: { confirmName: name },
    });
    expect(res.status).toBe(202);
    const { dueAt } = (await res.json()) as { dueAt: string };
    const days = (Date.parse(dueAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const again = await call("/api/tenant/delete", {
      method: "POST",
      cookie: owner.cookie,
      body: { confirmName: name },
    });
    expect(((await again.json()) as { dueAt: string }).dueAt).toBe(dueAt);
    expect(await auditCount(owner.tenantId, "tenant.delete")).toBe(1);

    const s = (await (await call("/api/settings", { cookie: owner.cookie })).json()) as Settings;
    expect(s.deletion).toEqual({ dueAt });
  });
});

describe("GET /api/me の最終更新", () => {
  it("未連携なら null、連携済みならチャンネルの最終収集時刻", async () => {
    const owner = await newOwner("set-me");
    let me = (await (await call("/api/me", { cookie: owner.cookie })).json()) as {
      lastUpdatedAt: string | null;
    };
    expect(me.lastUpdatedAt).toBeNull();
    await env.DB.prepare(
      `INSERT INTO channels (tenant_id, channel_id, title, status, connected_by, connected_at, last_collected_at)
       VALUES (?1, ?2, 'テスト', '正常', ?4, ?3, ?3)`,
    )
      .bind(
        owner.tenantId,
        `UC_me_${owner.tenantId.slice(0, 8)}`,
        "2026-09-20T18:00:00.000Z",
        owner.userId,
      )
      .run();
    me = (await (await call("/api/me", { cookie: owner.cookie })).json()) as {
      lastUpdatedAt: string | null;
    };
    expect(me.lastUpdatedAt).toBe("2026-09-20T18:00:00.000Z");
  });
});
