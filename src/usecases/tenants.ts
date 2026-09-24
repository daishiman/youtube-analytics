// テナント: 所属一覧・追加作成（MAX_TENANTS で受付停止）・選択テナントの切替・画面用の自分の情報
import { newId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { type Deps, iso, maxTenants, platform } from "./common";
import type { CurrentSession } from "./session";
import { settingsRepo } from "./settings-common";

export async function listMyTenants(deps: Deps, userId: string) {
  return (await platform(deps).listMemberships(userId)).map((m) => ({
    tenantId: m.tenant_id,
    name: m.name,
    role: m.role,
  }));
}

export async function isSignupClosed(deps: Deps): Promise<boolean> {
  return (await platform(deps).countActiveTenants()) >= maxTenants(deps.env);
}

export async function createTenant(deps: Deps, session: CurrentSession, name: unknown) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length < 1 || trimmed.length > 60) {
    throw new AppError("VALIDATION_FAILED", "ワークスペース名は1〜60文字で入力してください");
  }
  const repo = platform(deps);
  const tenantId = newId();
  const created = await repo.createTenantWithOwner({
    tenantId,
    name: trimmed,
    userId: session.userId,
    now: iso(deps.now),
    maxTenants: maxTenants(deps.env),
    onlyIfNoMembership: false,
  });
  if (!created) throw new AppError("SIGNUP_CLOSED");
  await repo.setSessionTenant(session.sessionIdHash, tenantId);
  return { tenantId, name: trimmed, role: "owner" as const };
}

export async function switchTenant(deps: Deps, session: CurrentSession, tenantId: unknown) {
  if (typeof tenantId !== "string")
    throw new AppError("VALIDATION_FAILED", "tenantId を指定してください");
  const repo = platform(deps);
  const role = await repo.getRole(tenantId, session.userId);
  if (!role) throw new AppError("NOT_FOUND");
  await repo.setSessionTenant(session.sessionIdHash, tenantId);
  return { tenantId, role };
}

export async function getMe(deps: Deps, session: CurrentSession) {
  const memberships = await platform(deps).listMemberships(session.userId);
  const tenants = memberships.map((m) => ({ tenantId: m.tenant_id, name: m.name, role: m.role }));
  const current = memberships.find((m) => m.tenant_id === session.tenantId);
  // ヘッダーの「最終更新」: 日次収集の最終時刻（未連携・未収集は null）
  const channel = current
    ? await settingsRepo(deps, { tenantId: current.tenant_id }).getChannel()
    : null;
  return {
    user: { userId: session.userId, email: session.email },
    tenants,
    // 連携状態は選択中テナントのバナー表示だけに使う（qa-065）
    currentTenant: current
      ? {
          tenantId: current.tenant_id,
          name: current.name,
          role: current.role,
          youtubeLinkStatus: current.youtube_link_status,
        }
      : null,
    signupClosed: await isSignupClosed(deps),
    lastUpdatedAt: channel?.last_collected_at ?? null,
  };
}
