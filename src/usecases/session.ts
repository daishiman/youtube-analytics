// ログイン（Google で確認済みの本人情報 → 利用者・初回テナント・招待受理・セッション発行）とセッション操作。
// OAuth コールバックと開発専用ログインの両方がこの loginWithIdentity を通る（分岐を1か所に集める）
import type { Role } from "../domain/tenant-context";
import { newId, randomToken, sha256Hex } from "../lib/crypto";
import { AppError, type ErrorCode } from "../lib/errors";
import {
  addMs,
  type Deps,
  defaultTenantName,
  iso,
  maxTenants,
  platform,
  SESSION_CLEANUP_BATCH_SIZE,
  SESSION_TTL_MS,
} from "./common";
import { acceptInvite } from "./invites";

export interface VerifiedIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
}

export type LoginOutcome =
  | "tenant_created"
  | "existing"
  | "invite_accepted"
  | "invite_failed"
  | "signup_closed";

export interface LoginResult {
  sessionId: string;
  userId: string;
  tenantId: string | null;
  outcome: LoginOutcome;
  inviteError?: ErrorCode;
}

export async function loginWithIdentity(
  deps: Deps,
  identity: VerifiedIdentity,
  options: { inviteToken?: string | null } = {},
): Promise<LoginResult> {
  if (!identity.emailVerified) throw new AppError("EMAIL_NOT_VERIFIED");
  const repo = platform(deps);
  const now = iso(deps.now);
  await repo.deleteExpiredSessions(now, SESSION_CLEANUP_BATCH_SIZE);
  const user = await repo.upsertUser({
    userId: newId(),
    googleSub: identity.sub,
    email: identity.email,
    emailVerified: identity.emailVerified,
    now,
  });

  let outcome: LoginOutcome = "existing";
  let inviteError: ErrorCode | undefined;
  let preferred: string | null = null;

  if (options.inviteToken) {
    // 招待から来た人には自動でテナントを作らない（別アカウントで来た人の空テナントを作らない・上限の対象外）
    try {
      preferred = (
        await acceptInvite(
          deps,
          { userId: user.user_id, email: user.email, emailVerified: true },
          options.inviteToken,
        )
      ).tenantId;
      outcome = "invite_accepted";
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      outcome = "invite_failed";
      inviteError = e.code;
    }
  }

  let memberships = await repo.listMemberships(user.user_id);
  if (memberships.length === 0 && !options.inviteToken) {
    const created = await repo.createTenantWithOwner({
      tenantId: newId(),
      name: defaultTenantName(user.email),
      userId: user.user_id,
      now,
      maxTenants: maxTenants(deps.env),
      onlyIfNoMembership: true,
    });
    memberships = await repo.listMemberships(user.user_id);
    if (created) outcome = "tenant_created";
    else if (memberships.length === 0) outcome = "signup_closed";
  }

  const ids = new Set(memberships.map((m) => m.tenant_id));
  const last = await repo.lastSelectedTenant(user.user_id);
  const tenantId =
    (preferred && ids.has(preferred) ? preferred : null) ??
    (last && ids.has(last) ? last : null) ??
    memberships[0]?.tenant_id ??
    null;

  const sessionId = randomToken();
  await repo.createSession({
    sessionIdHash: await sha256Hex(sessionId),
    userId: user.user_id,
    tenantId,
    now,
    expiresAt: iso(addMs(deps.now, SESSION_TTL_MS)),
  });
  return { sessionId, userId: user.user_id, tenantId, outcome, inviteError };
}

export interface CurrentSession {
  sessionIdHash: string;
  userId: string;
  email: string;
  tenantId: string | null;
  role: Role | null;
}

/** Cookie のセッション ID から現在の利用者と選択中テナントの役割を引く（役割は毎回読み直す） */
export async function resolveSession(
  deps: Deps,
  sessionId: string,
): Promise<CurrentSession | null> {
  if (sessionId.length < 32 || sessionId.length > 128) return null;
  const repo = platform(deps);
  const sessionIdHash = await sha256Hex(sessionId);
  const row = await repo.findSession(sessionIdHash, iso(deps.now));
  if (!row) return null;
  const role = row.tenant_id ? await repo.getRole(row.tenant_id, row.user_id) : null;
  return {
    sessionIdHash,
    userId: row.user_id,
    email: row.email,
    tenantId: role ? row.tenant_id : null,
    role,
  };
}

export async function logout(deps: Deps, sessionId: string): Promise<void> {
  await platform(deps).deleteSession(await sha256Hex(sessionId));
}
