// 設定系 usecase の共通部品（repository の生成・監査ログ・レート制限・字幕トグルの機能フラグ）
import type { TenantContext } from "../domain/tenant-context";
import type { Bindings } from "../env";
import { newId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { controlDb } from "../repositories/db";
import { SettingsRepository, UsageRepository } from "../repositories/settings-repository";
import { type Deps, iso } from "./common";

export const DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
/** 字幕の自動取得は1日5本まで（captions.download 200 units × 5 = 1,000 units・qa-070） */
export const CAPTION_DAILY_LIMIT = 5;
export const NEXT_COLLECTION_TEXT = "毎日 3:00 JST";

export function settingsRepo(deps: Deps, ctx: Pick<TenantContext, "tenantId">) {
  return new SettingsRepository(controlDb(deps.env), ctx);
}

export function usageRepo(deps: Deps) {
  return new UsageRepository(controlDb(deps.env));
}

export async function audit(deps: Deps, ctx: TenantContext, action: string, detail?: string) {
  await settingsRepo(deps, ctx).audit({
    auditId: newId(),
    userId: ctx.userId,
    action,
    detail,
    now: iso(deps.now),
  });
}

export async function rateLimit(deps: Deps, key: string, limit: number, windowMs: number) {
  if (!(await usageRepo(deps).hit(key, limit, windowMs, deps.now))) {
    throw new AppError("RATE_LIMITED");
  }
}

export type CaptionsAvailability = "available" | "preparing";

/**
 * force-ssl の Google 検証が通るまでは、運営者テナントのオーナーだけが字幕トグルを使える（qa-070）。
 * 検証後は FORCE_SSL_VERIFIED=1 で全テナントのオーナーへ開放する
 */
export function captionsAvailability(env: Bindings, ctx: TenantContext): CaptionsAvailability {
  if (env.FORCE_SSL_VERIFIED === "1") return "available";
  return env.OPERATOR_TENANT_ID && env.OPERATOR_TENANT_ID === ctx.tenantId && ctx.role === "owner"
    ? "available"
    : "preparing";
}
