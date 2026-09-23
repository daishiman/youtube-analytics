// メンバー: 一覧（全役割）・役割変更と削除（owner のみ）・脱退（本人）。最後の owner は外せない
import { isRole, requirePermission, type TenantContext } from "../domain/tenant-context";
import { AppError } from "../lib/errors";
import { controlDb } from "../repositories/db";
import { TenantScopedRepository } from "../repositories/tenant-scoped-repository";
import type { Deps } from "./common";

function scoped(deps: Deps, ctx: TenantContext) {
  return new TenantScopedRepository(controlDb(deps.env), ctx);
}

export async function listMembers(deps: Deps, ctx: TenantContext) {
  requirePermission(ctx, "tenant.read");
  return scoped(deps, ctx).listMembers();
}

export async function changeRole(deps: Deps, ctx: TenantContext, userId: string, role: unknown) {
  requirePermission(ctx, "members.manage");
  if (!isRole(role))
    throw new AppError("VALIDATION_FAILED", "役割は owner・editor・viewer から選んでください");
  const repo = scoped(deps, ctx);
  if (!(await repo.getMember(userId))) throw new AppError("NOT_FOUND");
  if ((await repo.updateRole(userId, role)) === 0) throw new AppError("LAST_OWNER");
  return repo.getMember(userId);
}

export async function removeMember(deps: Deps, ctx: TenantContext, userId: string) {
  requirePermission(ctx, "members.manage");
  const repo = scoped(deps, ctx);
  if (!(await repo.getMember(userId))) throw new AppError("NOT_FOUND");
  if ((await repo.removeMember(userId)) === 0) throw new AppError("LAST_OWNER");
}

export async function leaveTenant(deps: Deps, ctx: TenantContext) {
  requirePermission(ctx, "tenant.leave");
  if ((await scoped(deps, ctx).removeMember(ctx.userId)) === 0) throw new AppError("LAST_OWNER");
}
