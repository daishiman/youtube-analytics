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

  it("pathとmethodから導くtenant scope・write分類にmetadataが一致する", () => {
    for (const route of PROTECTED_ROUTES) {
      const tenantScopedByPath = route.path.startsWith("/api/tenants/:id/");
      expect(route.tenantScoped, route.path).toBe(tenantScopedByPath);

      if (route.kind.startsWith("session-")) {
        // 設定画面の API はパスにテナント ID を持たず、セッションの選択中テナントだけを対象にする
        expect(tenantScopedByPath, route.path).toBe(false);
        expect(route.path.includes(":id"), route.path).toBe(false);
      } else if (!tenantScopedByPath) {
        expect(route.kind, route.path).toBe("self");
      } else if (route.method === "GET" && route.path.endsWith("/members")) {
        expect(route.kind, route.path).toBe("read");
      } else if (route.path.endsWith("/leave")) {
        expect(route.kind, route.path).toBe("member-write");
      } else {
        expect(route.kind, route.path).toBe("owner-write");
      }
    }
  });
});
