// A6: 再連携（/api/auth/youtube/connect）はオーナーだけ。別アカウントで戻ってきたら保存しない
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addMember, call, expectError, newOwner, uniqueEmail } from "../platform/helpers";
import { FULL_GRANT, finish, start, YT, YTA } from "./oauth";

afterEach(() => vi.restoreAllMocks());

async function status(tenantId: string) {
  const row = await env.DB.prepare(
    "SELECT youtube_link_status AS s FROM tenants WHERE tenant_id = ?1",
  )
    .bind(tenantId)
    .first<{ s: string }>();
  return row?.s;
}

describe("A6 再連携", () => {
  it("未ログインは 401", async () => {
    await expectError(await call("/api/auth/youtube/connect"), 401, "UNAUTHENTICATED");
  });

  it("編集者・閲覧者は 403 FORBIDDEN", async () => {
    const owner = await newOwner();
    for (const role of ["editor", "viewer"] as const) {
      const member = await addMember(owner, role);
      await expectError(
        await call("/api/auth/youtube/connect", { cookie: member.cookie }),
        403,
        "FORBIDDEN",
      );
    }
  });

  it("オーナーは YouTube の2スコープを追加許可で要求する", async () => {
    const owner = await newOwner();
    const { res, url } = await start("/api/auth/youtube/connect", { cookie: owner.cookie });
    expect(res.status).toBe(302);
    const scopes = url?.searchParams.get("scope")?.split(" ") ?? [];
    expect(scopes).toEqual(expect.arrayContaining([YT, YTA]));
    expect(url?.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url?.searchParams.get("access_type")).toBe("offline");
  });

  it("同じ本人で許可されたら linked にし、新しいセッションは発行しない", async () => {
    const owner = await newOwner();
    expect(await status(owner.tenantId)).toBe("none");
    const started = await start("/api/auth/youtube/connect", { cookie: owner.cookie });
    const res = await finish(
      started,
      { sub: `test:${owner.email}`, email: owner.email },
      { scope: FULL_GRANT, refresh_token: "connect-token" },
      { cookie: owner.cookie },
    );
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("yta_session="))).toBe(false);
    expect(await status(owner.tenantId)).toBe("linked");
  });

  it("別の Google アカウントで戻ってきたら保存せず YOUTUBE_LINK_MISMATCH を出す", async () => {
    const owner = await newOwner();
    const started = await start("/api/auth/youtube/connect", { cookie: owner.cookie });
    const other = uniqueEmail("other");
    const res = await finish(
      started,
      { sub: `g-${other}`, email: other },
      { scope: FULL_GRANT, refresh_token: "wrong-account" },
      { cookie: owner.cookie },
    );
    expect(res.headers.get("location")).toBe("/?notice=YOUTUBE_LINK_MISMATCH");
    expect(await status(owner.tenantId)).toBe("none");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?1")
      .bind(other)
      .first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});
