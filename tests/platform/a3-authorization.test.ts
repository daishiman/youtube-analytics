// 受入 A3: 閲覧者の書込APIは 403、他テナントの資源IDは 404（越境成功0件）
import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  call,
  count,
  expectError,
  issueInvite,
  type LoggedIn,
  newOwner,
  uniqueEmail,
} from "./helpers";
import { bodyFor, fill, PROTECTED_ROUTES } from "./routes";

type Owner = LoggedIn & { tenantId: string };

let t1: { owner: Owner; editor: Owner; viewer: Owner; inviteId: string };
let t2: { owner: Owner; viewer: Owner; inviteId: string };

beforeAll(async () => {
  const owner1 = await newOwner("t1owner");
  t1 = {
    owner: owner1,
    editor: await addMember(owner1, "editor"),
    viewer: await addMember(owner1, "viewer"),
    inviteId: (await issueInvite(owner1, uniqueEmail("t1pending"), "viewer")).inviteId,
  };
  const owner2 = await newOwner("t2owner");
  t2 = {
    owner: owner2,
    viewer: await addMember(owner2, "viewer"),
    inviteId: (await issueInvite(owner2, uniqueEmail("t2pending"), "editor")).inviteId,
  };
});

const ownerWrites = PROTECTED_ROUTES.filter((r) => r.tenantScoped && r.kind === "owner-write");

describe("A3 役割による 403", () => {
  for (const role of ["viewer", "editor"] as const) {
    for (const route of ownerWrites) {
      it(`${role} は ${route.method} ${route.path} で 403 FORBIDDEN`, async () => {
        const actor = t1[role];
        const path = fill(route.path, {
          id: t1.owner.tenantId,
          userId: t1.owner.userId,
          inviteId: t1.inviteId,
        });
        const res = await call(path, {
          method: route.method,
          cookie: actor.cookie,
          body: bodyFor(route),
        });
        await expectError(res, 403, "FORBIDDEN");
      });
    }
  }

  it("403 の後も対象は変わっていない（owner は owner のまま・招待は未使用のまま）", async () => {
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM tenant_members WHERE tenant_id = ?1 AND user_id = ?2 AND role = 'owner'",
        t1.owner.tenantId,
        t1.owner.userId,
      ),
    ).toBe(1);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM tenant_invites WHERE tenant_id = ?1 AND invite_id = ?2 AND revoked_at IS NULL",
        t1.owner.tenantId,
        t1.inviteId,
      ),
    ).toBe(1);
  });

  it("viewer と editor もメンバー一覧は読める", async () => {
    for (const actor of [t1.viewer, t1.editor]) {
      const res = await call(`/api/tenants/${t1.owner.tenantId}/members`, { cookie: actor.cookie });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { members: unknown[] };
      expect(body.members).toHaveLength(3);
    }
  });

  it("役割変更は次の要求から効く（editor→viewer→書込 403 / viewer→owner→書込可）", async () => {
    const owner = await newOwner("promote");
    const member = await addMember(owner, "viewer");
    const invitePath = `/api/tenants/${owner.tenantId}/invites`;
    const body = { email: uniqueEmail("x"), role: "viewer" };
    await expectError(
      await call(invitePath, { method: "POST", cookie: member.cookie, body }),
      403,
      "FORBIDDEN",
    );
    const promote = await call(`/api/tenants/${owner.tenantId}/members/${member.userId}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { role: "owner" },
    });
    expect(promote.status).toBe(200);
    expect((await call(invitePath, { method: "POST", cookie: member.cookie, body })).status).toBe(
      201,
    );
  });
});

describe("A3 他テナントの資源は 404（越境成功0件）", () => {
  it("t1 の owner が t2 のテナントID・資源IDで全テナント API を呼ぶと、すべて 404", async () => {
    const statuses: string[] = [];
    for (const route of PROTECTED_ROUTES.filter((r) => r.tenantScoped)) {
      const path = fill(route.path, {
        id: t2.owner.tenantId,
        userId: t2.viewer.userId,
        inviteId: t2.inviteId,
      });
      const res = await call(path, {
        method: route.method,
        cookie: t1.owner.cookie,
        body: bodyFor(route),
      });
      await expectError(res, 404, "NOT_FOUND");
      statuses.push(`${route.method} ${route.path} ${res.status}`);
    }
    expect(statuses.filter((s) => !s.endsWith(" 404"))).toEqual([]);
  });

  it("自テナントのパスに他テナントの userId・inviteId を混ぜても 404", async () => {
    const cases = [
      {
        method: "PATCH",
        path: `/api/tenants/${t1.owner.tenantId}/members/${t2.viewer.userId}`,
        body: { role: "owner" },
      },
      { method: "DELETE", path: `/api/tenants/${t1.owner.tenantId}/members/${t2.owner.userId}` },
      { method: "DELETE", path: `/api/tenants/${t1.owner.tenantId}/invites/${t2.inviteId}` },
    ];
    for (const c of cases) {
      await expectError(
        await call(c.path, { method: c.method, cookie: t1.owner.cookie, body: c.body }),
        404,
        "NOT_FOUND",
      );
    }
  });

  it("所属していないテナントへは切り替えられない（404）", async () => {
    const res = await call("/api/session/tenant", {
      method: "POST",
      cookie: t1.owner.cookie,
      body: { tenantId: t2.owner.tenantId },
    });
    await expectError(res, 404, "NOT_FOUND");
  });

  it("越境の試行後も t2 のデータは変わっていない", async () => {
    const t2Id = t2.owner.tenantId;
    expect(await count("SELECT COUNT(*) AS n FROM tenant_members WHERE tenant_id = ?1", t2Id)).toBe(
      2,
    );
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM tenant_members WHERE tenant_id = ?1 AND user_id = ?2 AND role = 'viewer'",
        t2Id,
        t2.viewer.userId,
      ),
    ).toBe(1);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM tenant_invites WHERE tenant_id = ?1 AND revoked_at IS NULL AND accepted_at IS NULL",
        t2Id,
      ),
    ).toBe(1);
  });
});

describe("CSRF 対策", () => {
  it("X-Requested-With がない書込は 403 CSRF_REJECTED", async () => {
    const res = await call(`/api/tenants/${t1.owner.tenantId}/invites`, {
      method: "POST",
      cookie: t1.owner.cookie,
      body: { email: uniqueEmail("c"), role: "viewer" },
      csrf: false,
    });
    await expectError(res, 403, "CSRF_REJECTED");
  });

  it("別オリジンからの書込は 403 CSRF_REJECTED", async () => {
    const res = await call(`/api/tenants/${t1.owner.tenantId}/invites`, {
      method: "POST",
      cookie: t1.owner.cookie,
      body: { email: uniqueEmail("c"), role: "viewer" },
      headers: { origin: "https://evil.example.com" },
    });
    await expectError(res, 403, "CSRF_REJECTED");
  });
});
