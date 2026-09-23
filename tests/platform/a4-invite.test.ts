// 受入 A4: 招待リンクを別の Google アカウントで開くと参加できない（あわせて 7日・1回限り・取消・ハッシュ保存）
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/lib/crypto";
import { call, count, expectError, issueInvite, login, newOwner, uniqueEmail } from "./helpers";

describe("A4 招待", () => {
  it("招待されたのと別のアカウントでは参加できない（ログイン時・ログイン後の両方）", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("invited");
    const { token } = await issueInvite(owner, invited, "editor");

    // 別アカウントで招待リンクからログイン → 参加せず、テナントも自動作成しない
    const other = await login(uniqueEmail("other"), { inviteToken: token });
    expect(other.outcome).toBe("invite_failed");
    expect(other.inviteError).toBe("INVITE_EMAIL_MISMATCH");
    expect(other.tenantId).toBeNull();
    expect(
      await count("SELECT COUNT(*) AS n FROM tenant_members WHERE user_id = ?1", other.userId),
    ).toBe(0);

    // ログイン済みの別アカウントが受理 API を叩いても 403
    const res = await call("/api/invites/accept", {
      method: "POST",
      cookie: other.cookie,
      body: { token },
    });
    await expectError(res, 403, "INVITE_EMAIL_MISMATCH");
    expect(
      await count("SELECT COUNT(*) AS n FROM tenant_members WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(1);

    // 本人なら参加できる（別アカウントの試行で招待は消費されていない）
    const me = await login(invited, { inviteToken: token });
    expect(me.outcome).toBe("invite_accepted");
    expect(me.tenantId).toBe(owner.tenantId);
  });

  it("メールの大文字小文字の違いは同一とみなす", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("case");
    const { token } = await issueInvite(owner, invited.toUpperCase(), "viewer");
    const me = await login(invited);
    const res = await call("/api/invites/accept", {
      method: "POST",
      cookie: me.cookie,
      body: { token },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tenantId: owner.tenantId, role: "viewer" });
  });

  it("1回限り: 使用済みの招待は再利用できない", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("once");
    const { token } = await issueInvite(owner, invited, "viewer");
    const me = await login(invited, { inviteToken: token });
    expect(me.outcome).toBe("invite_accepted");
    const again = await call("/api/invites/accept", {
      method: "POST",
      cookie: me.cookie,
      body: { token },
    });
    await expectError(again, 404, "INVITE_NOT_USABLE");
  });

  it("取り消した招待は使えない", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("revoked");
    const { token, inviteId } = await issueInvite(owner, invited, "viewer");
    const del = await call(`/api/tenants/${owner.tenantId}/invites/${inviteId}`, {
      method: "DELETE",
      cookie: owner.cookie,
    });
    expect(del.status).toBe(204);
    const me = await login(invited, { inviteToken: token });
    expect(me.outcome).toBe("invite_failed");
    expect(me.tenantId).toBeNull();
    await expectError(await call(`/api/auth/invite?token=${token}`), 404, "INVITE_NOT_USABLE");
  });

  it("7日の期限を過ぎた招待は使えない", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("expired");
    const { token, inviteId, expiresAt } = await issueInvite(owner, invited, "viewer");
    const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    await env.DB.prepare(
      "UPDATE tenant_invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE invite_id = ?1",
    )
      .bind(inviteId)
      .run();
    const me = await login(invited, { inviteToken: token });
    expect(me.outcome).toBe("invite_failed");
    expect(me.inviteError).toBe("INVITE_NOT_USABLE");
    expect(me.tenantId).toBeNull();
  });

  it("平文トークンは保存せず SHA-256 だけを持つ", async () => {
    const owner = await newOwner();
    const { token, inviteId } = await issueInvite(owner, uniqueEmail("hash"), "viewer");
    expect(token.length).toBeGreaterThanOrEqual(43); // 256bit の base64url
    const row = await env.DB.prepare("SELECT token_hash FROM tenant_invites WHERE invite_id = ?1")
      .bind(inviteId)
      .first<{ token_hash: string }>();
    expect(row?.token_hash).toBe(await sha256Hex(token));
    expect(row?.token_hash).not.toContain(token);
  });

  it("ログイン前のプレビューはテナント名・役割・伏せ字メールだけを返す", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("preview");
    const { token } = await issueInvite(owner, invited, "editor");
    const res = await call(`/api/auth/invite?token=${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(Object.keys(body).sort()).toEqual(["emailHint", "role", "tenantName"]);
    expect(body.role).toBe("editor");
    expect(body.emailHint).not.toBe(invited);
  });

  it("すでにメンバーなら 409 ALREADY_MEMBER で、招待は消費しない", async () => {
    const owner = await newOwner();
    const { token, inviteId } = await issueInvite(owner, owner.email, "viewer");
    const res = await call("/api/invites/accept", {
      method: "POST",
      cookie: owner.cookie,
      body: { token },
    });
    await expectError(res, 409, "ALREADY_MEMBER");
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM tenant_invites WHERE invite_id = ?1 AND accepted_at IS NULL",
        inviteId,
      ),
    ).toBe(1);
  });

  it("招待できる役割は editor と viewer だけ", async () => {
    const owner = await newOwner();
    const res = await call(`/api/tenants/${owner.tenantId}/invites`, {
      method: "POST",
      cookie: owner.cookie,
      body: { email: uniqueEmail("r"), role: "owner" },
    });
    await expectError(res, 400, "VALIDATION_FAILED");
  });
});

describe("メンバーの役割変更・削除・脱退と最後の owner", () => {
  it("最後の owner は降格・削除・脱退できない（409 LAST_OWNER）", async () => {
    const owner = await newOwner();
    const base = `/api/tenants/${owner.tenantId}`;
    await expectError(
      await call(`${base}/members/${owner.userId}`, {
        method: "PATCH",
        cookie: owner.cookie,
        body: { role: "viewer" },
      }),
      409,
      "LAST_OWNER",
    );
    await expectError(
      await call(`${base}/members/${owner.userId}`, { method: "DELETE", cookie: owner.cookie }),
      409,
      "LAST_OWNER",
    );
    await expectError(
      await call(`${base}/leave`, { method: "POST", cookie: owner.cookie }),
      409,
      "LAST_OWNER",
    );
  });

  it("owner はメンバーを削除でき、削除されたメンバーはそのテナントに入れなくなる", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("removed");
    const { token } = await issueInvite(owner, invited, "editor");
    const member = await login(invited, { inviteToken: token });
    const res = await call(`/api/tenants/${owner.tenantId}/members/${member.userId}`, {
      method: "DELETE",
      cookie: owner.cookie,
    });
    expect(res.status).toBe(204);
    await expectError(
      await call(`/api/tenants/${owner.tenantId}/members`, { cookie: member.cookie }),
      404,
      "NOT_FOUND",
    );
  });

  it("viewer は自分で脱退できる", async () => {
    const owner = await newOwner();
    const invited = uniqueEmail("leaver");
    const { token } = await issueInvite(owner, invited, "viewer");
    const member = await login(invited, { inviteToken: token });
    const res = await call(`/api/tenants/${owner.tenantId}/leave`, {
      method: "POST",
      cookie: member.cookie,
    });
    expect(res.status).toBe(204);
    const me = (await (await call("/api/me", { cookie: member.cookie })).json()) as {
      tenants: unknown[];
    };
    expect(me.tenants).toHaveLength(0);
  });
});
