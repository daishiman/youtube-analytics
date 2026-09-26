// ログイン必須 API の網羅表。A1（401）と A3（403/404 行列）が同じ表を使い、
// routes-coverage.test.ts が「アプリに登録された全ルート = この表 + 公開ルート」であることを検査する
export type WriteKind =
  | "read"
  | "owner-write"
  | "member-write"
  | "self"
  // 設定画面の API（セッションで選択中のテナントが対象。パスにテナント ID を持たない）
  | "session-read"
  | "session-writer"
  | "session-owner";

export interface ProtectedRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** :id = テナント、:userId・:inviteId = テナント内の資源 */
  path: string;
  tenantScoped: boolean;
  kind: WriteKind;
  /** 未ログイン時に 401 JSON ではなくログイン画面へリダイレクトする（Google からの戻り先） */
  redirect?: boolean;
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
  { method: "GET", path: "/api/settings", tenantScoped: false, kind: "session-read" },
  { method: "GET", path: "/api/usage", tenantScoped: false, kind: "session-read" },
  { method: "POST", path: "/api/youtube/connect", tenantScoped: false, kind: "session-owner" },
  { method: "POST", path: "/api/youtube/reconnect", tenantScoped: false, kind: "session-owner" },
  {
    method: "GET",
    path: "/api/youtube/channel-candidates",
    tenantScoped: false,
    kind: "session-owner",
  },
  { method: "POST", path: "/api/youtube/channel", tenantScoped: false, kind: "session-owner" },
  { method: "DELETE", path: "/api/youtube/connection", tenantScoped: false, kind: "session-owner" },
  { method: "PUT", path: "/api/youtube/captions-auto", tenantScoped: false, kind: "session-owner" },
  { method: "PUT", path: "/api/youtube/google-client", tenantScoped: false, kind: "session-owner" },
  {
    method: "DELETE",
    path: "/api/youtube/google-client",
    tenantScoped: false,
    kind: "session-owner",
  },
  {
    method: "GET",
    path: "/api/oauth/callback",
    tenantScoped: false,
    kind: "session-owner",
    redirect: true,
  },
  { method: "GET", path: "/api/imports", tenantScoped: false, kind: "session-read" },
  {
    method: "GET",
    path: "/api/imports/:importId/preview",
    tenantScoped: false,
    kind: "session-read",
  },
  {
    method: "GET",
    path: "/api/imports/:importId/mapping",
    tenantScoped: false,
    kind: "session-read",
  },
  { method: "POST", path: "/api/imports", tenantScoped: false, kind: "session-writer" },
  { method: "GET", path: "/api/skill-tokens", tenantScoped: false, kind: "session-read" },
  { method: "POST", path: "/api/skill-tokens", tenantScoped: false, kind: "session-writer" },
  {
    method: "DELETE",
    path: "/api/skill-tokens/:tokenId",
    tenantScoped: false,
    kind: "session-read",
  },
  { method: "POST", path: "/api/tenant/delete", tenantScoped: false, kind: "session-owner" },
  // ダッシュボード（読み取り専用・全役割が読める）
  { method: "GET", path: "/api/dashboard", tenantScoped: false, kind: "session-read" },
  { method: "GET", path: "/api/data/report-types", tenantScoped: false, kind: "session-read" },
  { method: "GET", path: "/api/data/analytics-raw", tenantScoped: false, kind: "session-read" },
  {
    method: "GET",
    path: "/api/data/analytics-raw/:reportKey/rows",
    tenantScoped: false,
    kind: "session-read",
  },
  { method: "GET", path: "/api/data/reporting-sync", tenantScoped: false, kind: "session-read" },
  { method: "GET", path: "/api/data/reporting-reports", tenantScoped: false, kind: "session-read" },
  {
    method: "GET",
    path: "/api/data/reporting-reports/:reportId/csv",
    tenantScoped: false,
    kind: "session-read",
  },
  { method: "POST", path: "/api/data/reporting-sync", tenantScoped: false, kind: "session-writer" },
  { method: "GET", path: "/api/dashboard/funnel", tenantScoped: false, kind: "session-read" },
  {
    method: "GET",
    path: "/api/media/thumbnails/:video_id",
    tenantScoped: false,
    kind: "session-read",
  },
];

/** 設定画面の API（セッションの選択中テナントが対象） */
export const SESSION_TENANT_ROUTES = PROTECTED_ROUTES.filter((r) => r.kind.startsWith("session-"));

export const PUBLIC_ROUTES = [
  "GET /api/health",
  "GET /api/auth/config",
  "GET /api/auth/login",
  "GET /api/auth/callback",
  "GET /api/auth/youtube/connect",
  "GET /api/auth/invite",
  "POST /api/auth/logout",
  "POST /api/auth/dev-login",
];

export function fill(
  path: string,
  ids: { id?: string; userId?: string; inviteId?: string; tokenId?: string },
): string {
  return path
    .replace(":tokenId", ids.tokenId ?? "00000000-0000-0000-0000-000000000003")
    .replace(":id", ids.id ?? "00000000-0000-0000-0000-000000000000")
    .replace(":userId", ids.userId ?? "00000000-0000-0000-0000-000000000001")
    .replace(":inviteId", ids.inviteId ?? "00000000-0000-0000-0000-000000000002");
}

/** 各ルートに送る妥当な本文（検証エラーで権限判定が隠れないようにする） */
export function bodyFor(route: ProtectedRoute): unknown {
  if (route.method === "GET") return undefined;
  if (route.method === "DELETE" && route.path !== "/api/youtube/connection") return undefined;
  if (route.path.endsWith("/members/:userId")) return { role: "viewer" };
  if (route.path.endsWith("/invites")) return { email: "someone@example.com", role: "viewer" };
  if (route.path === "/api/tenants") return { name: "テスト" };
  if (route.path === "/api/session/tenant")
    return { tenantId: "00000000-0000-0000-0000-000000000000" };
  if (route.path === "/api/invites/accept") return { token: "x".repeat(43) };
  if (route.path === "/api/skill-tokens") return { name: "テスト用" };
  if (route.path === "/api/youtube/channel") return { channelId: "UC_test" };
  if (route.path === "/api/youtube/captions-auto") return { enabled: true };
  if (route.path === "/api/youtube/google-client")
    return {
      clientId: "123456789012-routes0a1b2c3d.apps.googleusercontent.com",
      clientSecret: "GOCSPX-routes-secret-0123",
    };
  if (route.path === "/api/youtube/connection" || route.path === "/api/tenant/delete")
    return { confirmName: "x" };
  return {};
}
