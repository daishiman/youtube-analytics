// Claude Code 連携用の個人トークン。平文は発行時に1回だけ返し、DB には SHA-256 だけを保存する（qa-083）
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { newId, randomToken, sha256Hex } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { type Deps, iso } from "./common";
import { audit, rateLimit, settingsRepo } from "./settings-common";

/** 1人あたりの有効トークン上限（テナントをまたいで数える） */
export const TOKEN_LIMIT = 5;
const TOKEN_NAME_MAX = 40;
const ISSUE_LIMIT_PER_HOUR = 10;

export async function listSkillTokens(deps: Deps, ctx: TenantContext) {
  requirePermission(ctx, "tenant.read");
  return settingsRepo(deps, ctx).listSkillTokens(ctx.userId);
}

export async function issueSkillToken(deps: Deps, ctx: TenantContext, name: unknown) {
  requirePermission(ctx, "content.write");
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || Array.from(trimmed).length > TOKEN_NAME_MAX) {
    throw new AppError(
      "VALIDATION_FAILED",
      `トークンの名前を1〜${TOKEN_NAME_MAX}文字で入力してください`,
    );
  }
  await rateLimit(deps, `token:${ctx.userId}`, ISSUE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  const plain = `yta_${randomToken()}`;
  const tokenId = newId();
  const inserted = await settingsRepo(deps, ctx).insertSkillTokenWithinLimit({
    tokenId,
    userId: ctx.userId,
    name: trimmed,
    tokenHash: await sha256Hex(plain),
    limit: TOKEN_LIMIT,
    now: iso(deps.now),
  });
  if (inserted === 0) throw new AppError("TOKEN_LIMIT");
  await audit(deps, ctx, "token.issue", tokenId);
  return { tokenId, name: trimmed, token: plain, createdAt: iso(deps.now) };
}

export async function revokeSkillToken(deps: Deps, ctx: TenantContext, tokenId: string) {
  requirePermission(ctx, "tenant.read");
  const changed = await settingsRepo(deps, ctx).revokeSkillToken(
    ctx.userId,
    tokenId,
    iso(deps.now),
  );
  // 他人のトークン・存在しないトークンは区別せず 404
  if (changed === 0) throw new AppError("NOT_FOUND");
  await audit(deps, ctx, "token.revoke", tokenId);
}
