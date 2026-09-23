// 招待: 発行・一覧・取消（owner のみ）と、プレビュー・受理（ログイン中の本人）
import { isInvitableRole, requirePermission, type TenantContext } from "../domain/tenant-context";
import { newId, randomToken, sha256Hex } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { controlDb } from "../repositories/db";
import type { InviteLookupRow } from "../repositories/platform-repository";
import { TenantScopedRepository } from "../repositories/tenant-scoped-repository";
import { addMs, type Deps, INVITE_TTL_MS, isEmail, iso, normalizeEmail, platform } from "./common";

function scoped(deps: Deps, ctx: TenantContext) {
  return new TenantScopedRepository(controlDb(deps.env), ctx);
}

export async function listInvites(deps: Deps, ctx: TenantContext) {
  requirePermission(ctx, "invites.manage");
  return scoped(deps, ctx).listPendingInvites(iso(deps.now));
}

/** 平文トークンは戻り値の URL にだけ含め、D1 には SHA-256 だけを保存する */
export async function createInvite(
  deps: Deps,
  ctx: TenantContext,
  input: { email: unknown; role: unknown },
  origin: string,
) {
  requirePermission(ctx, "invites.manage");
  if (!isEmail(input.email))
    throw new AppError("VALIDATION_FAILED", "メールアドレスの形式を確認してください");
  if (!isInvitableRole(input.role))
    throw new AppError("VALIDATION_FAILED", "役割は editor か viewer を選んでください");
  const token = randomToken();
  const inviteId = newId();
  const expiresAt = iso(addMs(deps.now, INVITE_TTL_MS));
  await scoped(deps, ctx).createInvite({
    inviteId,
    email: normalizeEmail(input.email),
    role: input.role,
    tokenHash: await sha256Hex(token),
    expiresAt,
    createdBy: ctx.userId,
    now: iso(deps.now),
  });
  return { inviteId, role: input.role, expiresAt, url: `${origin}/invite?token=${token}` };
}

export async function revokeInvite(deps: Deps, ctx: TenantContext, inviteId: string) {
  requirePermission(ctx, "invites.manage");
  const changed = await scoped(deps, ctx).revokeInvite(inviteId, iso(deps.now));
  if (changed === 0) throw new AppError("NOT_FOUND");
}

async function findUsableInvite(deps: Deps, token: unknown): Promise<InviteLookupRow> {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) {
    throw new AppError("INVITE_NOT_USABLE");
  }
  const invite = await platform(deps).findInviteByTokenHash(await sha256Hex(token));
  if (!invite || invite.accepted_at || invite.revoked_at || invite.expires_at <= iso(deps.now)) {
    throw new AppError("INVITE_NOT_USABLE");
  }
  return invite;
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

/** ログイン前のログイン画面用。テナント名・役割・伏せ字のメールだけを返す */
export async function previewInvite(deps: Deps, token: unknown) {
  const invite = await findUsableInvite(deps, token);
  return { tenantName: invite.tenant_name, role: invite.role, emailHint: maskEmail(invite.email) };
}

/**
 * 招待の受理。ハッシュ一致・期限内・未使用・未取消、かつ Google で確認済みのメールが一致するときだけ参加させる。
 * 受理は1回限り（条件付き UPDATE と追加を同じ batch で実行）。
 */
export async function acceptInvite(
  deps: Deps,
  user: { userId: string; email: string; emailVerified: boolean },
  token: unknown,
): Promise<{ tenantId: string }> {
  const invite = await findUsableInvite(deps, token);
  if (!user.emailVerified || normalizeEmail(user.email) !== normalizeEmail(invite.email)) {
    throw new AppError("INVITE_EMAIL_MISMATCH");
  }
  const repo = platform(deps);
  if (await repo.getRole(invite.tenant_id, user.userId)) throw new AppError("ALREADY_MEMBER");
  const ok = await repo.consumeInvite({
    tenantId: invite.tenant_id,
    inviteId: invite.invite_id,
    userId: user.userId,
    role: invite.role,
    now: iso(deps.now),
  });
  if (!ok) throw new AppError("INVITE_NOT_USABLE");
  return { tenantId: invite.tenant_id };
}
