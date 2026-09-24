import { describe, expect, it } from "vitest";
import { call } from "./helpers";

describe("GET /api/health", () => {
  it("ログインなしで D1 に到達して ok を返す", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: true });
  });
});

describe("API の応答ヘッダ", () => {
  it("エラー応答を含め no-store と nosniff・フレーム禁止を付ける", async () => {
    for (const path of ["/api/health", "/api/me"]) {
      const res = await call(path);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    }
  });
});
