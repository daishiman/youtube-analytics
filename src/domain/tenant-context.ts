// 役割と権限（正本 security 章の権限表）。usecase の入口で TenantContext を1回だけ検査する
import { AppError } from "../lib/errors";

export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const INVITABLE_ROLES = ["editor", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * 操作 → 許可する役割。
 * - owner: 全操作・招待・役割変更・テナント削除
 * - editor: 取込・分析依頼・結果取込・アクション更新（content.write。後続 feature が使う）
 * - viewer: 閲覧のみ
 */
export const PERMISSIONS = {
  "tenant.read": ["owner", "editor", "viewer"],
  "tenant.leave": ["owner", "editor", "viewer"],
  "content.write": ["owner", "editor"],
  "members.manage": ["owner"],
  "invites.manage": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** tenant_id と user_id はセッションだけから導く。role は要求ごとに tenant_members から読み直した値 */
export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: Role;
}

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!can(ctx.role, permission)) throw new AppError("FORBIDDEN");
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isInvitableRole(value: unknown): value is InvitableRole {
  return typeof value === "string" && (INVITABLE_ROLES as readonly string[]).includes(value);
}
