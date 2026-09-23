// 受入 A1: 未ログインで /api/* を呼ぶと 401 になる
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/lib/crypto";
import { call, expectError, newOwner } from "./helpers";
import { bodyFor, fill, PROTECTED_ROUTES } from "./routes";

describe("A1 未ログインは 401", () => {
  for (const route of PROTECTED_ROUTES) {
    it(`${route.method} ${route.path} は Cookie なしで 401 UNAUTHENTICATED`, async () => {
      const res = await call(fill(route.path, {}), { method: route.method, body: bodyFor(route) });
      await expectError(res, 401, "UNAUTHENTICATED");
    });
  }

  it("CSRF ヘッダなしの書込でも、未ログインなら 401 を先に返す", async () => {
    const res = await call("/api/tenants", { method: "POST", body: { name: "x" }, csrf: false });
    await expectError(res, 401, "UNAUTHENTICATED");
  });

  it("未登録の /api/* パスも未ログインなら 401", async () => {
    await expectError(await call("/api/unknown/path"), 401, "UNAUTHENTICATED");
  });

  it("でたらめなセッション Cookie は 401", async () => {
    const res = await call("/api/me", { cookie: `yta_session=${"a".repeat(43)}` });
    await expectError(res, 401, "UNAUTHENTICATED");
  });

  it("期限切れセッションは 401", async () => {
    const owner = await newOwner();
    const sessionId = owner.cookie.split("=")[1] ?? "";
    await env.DB.prepare(
      "UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE session_id_hash = ?1",
    )
      .bind(await sha256Hex(sessionId))
      .run();
    await expectError(await call("/api/me", { cookie: owner.cookie }), 401, "UNAUTHENTICATED");
  });

  it("ログアウト後のセッションは 401", async () => {
    const owner = await newOwner();
    expect((await call("/api/auth/logout", { method: "POST", cookie: owner.cookie })).status).toBe(
      200,
    );
    await expectError(await call("/api/me", { cookie: owner.cookie }), 401, "UNAUTHENTICATED");
  });

  it("公開 API（health・招待プレビュー）はログインなしで 401 にならない", async () => {
    expect((await call("/api/health")).status).toBe(200);
    await expectError(
      await call("/api/auth/invite?token=missing-token-000000"),
      404,
      "INVITE_NOT_USABLE",
    );
  });
});
