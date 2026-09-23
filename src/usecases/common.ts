import type { Bindings } from "../env";
import { controlDb } from "../repositories/db";
import { PlatformRepository } from "../repositories/platform-repository";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** usecase の依存。now を注入できるようにして期限切れをテストで再現する */
export interface Deps {
  env: Bindings;
  now: Date;
}

export const iso = (d: Date) => d.toISOString();
export const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);

export function platform(deps: Deps): PlatformRepository {
  return new PlatformRepository(controlDb(deps.env));
}

export function maxTenants(env: Bindings): number {
  const n = Number.parseInt(env.MAX_TENANTS, 10);
  return Number.isFinite(n) && n >= 0 ? n : 100;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());
}

/** 初回テナントの既定名（メールのローカル部）。利用者が後で変えられる前提の仮名 */
export function defaultTenantName(email: string): string {
  const local = email.split("@")[0] ?? "";
  return `${local || "新しい"}のテナント`;
}
