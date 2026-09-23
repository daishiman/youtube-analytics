// 網羅性の検査: アプリに登録された /api ルートが、テスト表（保護ルート + 公開ルート）と過不足なく一致する
import { describe, expect, it } from "vitest";
import { app } from "../../src/index";
import { PROTECTED_ROUTES, PUBLIC_ROUTES } from "./routes";

describe("ルート網羅", () => {
  it("登録済みの全 API ルートが A1/A3 の表に載っている", () => {
    const registered = new Set(
      app.routes
        .filter((r) => r.method !== "ALL" && r.path.startsWith("/api/"))
        .map((r) => `${r.method} ${r.path}`),
    );
    const expected = new Set([
      ...PROTECTED_ROUTES.map((r) => `${r.method} ${r.path}`),
      ...PUBLIC_ROUTES,
    ]);
    expect([...registered].sort()).toEqual([...expected].sort());
  });
});
