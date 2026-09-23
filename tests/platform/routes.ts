// ログイン必須 API の網羅表。A1（401）と A3（403/404 行列）が同じ表を使い、
// routes-coverage.test.ts が「アプリに登録された全ルート = この表 + 公開ルート」であることを検査する
export type WriteKind = "read" | "owner-write" | "member-write" | "self";

export interface ProtectedRoute {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** :id = テナント、:userId・:inviteId = テナント内の資源 */
  path: string;
  tenantScoped: boolean;
  kind: WriteKind;
}

export const PROTECTED_ROUTES: ProtectedRoute[] = [
  { method: "GET", path: "/api/me", tenantScoped: false, kind: "self" },
  { method: "GET", path: "/api/tenants", tenantScoped: false, kind: "self" },
  { method: "POST", path: "/api/tenants", tenantScoped: false, kind: "self" },
  { method: "POST", path: "/api/session/tenant", tenantScoped: false, kind: "self" },
  { method: "POST", path: "/api/invites/accept", tenantScoped: false, kind: "self" },
  { method: "GET", path: "/api/tenants/:id/members", tenantScoped: true, kind: "read" },
  {
    method: "PATCH",
    path: "/api/tenants/:id/members/:userId",
    tenantScoped: true,
    kind: "owner-write",
  },
  {
    method: "DELETE",
    path: "/api/tenants/:id/members/:userId",
    tenantScoped: true,
    kind: "owner-write",
  },
  { method: "POST", path: "/api/tenants/:id/leave", tenantScoped: true, kind: "member-write" },
  { method: "GET", path: "/api/tenants/:id/invites", tenantScoped: true, kind: "owner-write" },
  { method: "POST", path: "/api/tenants/:id/invites", tenantScoped: true, kind: "owner-write" },
  {
    method: "DELETE",
    path: "/api/tenants/:id/invites/:inviteId",
    tenantScoped: true,
    kind: "owner-write",
  },
];

export const PUBLIC_ROUTES = [
  "GET /api/health",
  "GET /api/auth/config",
  "GET /api/auth/login",
  "GET /api/auth/callback",
  "GET /api/auth/invite",
  "POST /api/auth/logout",
  "POST /api/auth/dev-login",
];

export function fill(
  path: string,
  ids: { id?: string; userId?: string; inviteId?: string },
): string {
  return path
    .replace(":id", ids.id ?? "00000000-0000-0000-0000-000000000000")
    .replace(":userId", ids.userId ?? "00000000-0000-0000-0000-000000000001")
    .replace(":inviteId", ids.inviteId ?? "00000000-0000-0000-0000-000000000002");
}

/** 各ルートに送る妥当な本文（検証エラーで権限判定が隠れないようにする） */
export function bodyFor(route: ProtectedRoute): unknown {
  if (route.method === "GET" || route.method === "DELETE") return undefined;
  if (route.path.endsWith("/members/:userId")) return { role: "viewer" };
  if (route.path.endsWith("/invites")) return { email: "someone@example.com", role: "viewer" };
  if (route.path === "/api/tenants") return { name: "テスト" };
  if (route.path === "/api/session/tenant")
    return { tenantId: "00000000-0000-0000-0000-000000000000" };
  if (route.path === "/api/invites/accept") return { token: "x".repeat(43) };
  return {};
}
