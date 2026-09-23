// テナントをまたぐ管理操作（ログイン・セッション・テナント作成・招待トークン照合）。
// テナント内の読み書きは TenantScopedRepository を使い、ここに tenant_id を省いた業務クエリを足さない。
import type { InvitableRole, Role } from "../domain/tenant-context";

export interface UserRow {
  user_id: string;
  google_sub: string;
  email: string;
  email_verified: number;
}

export interface MembershipRow {
  tenant_id: string;
  name: string;
  role: Role;
  joined_at: string;
}

export interface SessionRow {
  user_id: string;
  email: string;
  tenant_id: string | null;
  expires_at: string;
}

export interface InviteLookupRow {
  tenant_id: string;
  invite_id: string;
  email: string;
  role: InvitableRole;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  tenant_name: string;
}

export class PlatformRepository {
  constructor(private readonly db: D1Database) {}

  /** google_sub で一意に upsert し、最新のメールと確認状態を反映する */
  async upsertUser(input: {
    userId: string;
    googleSub: string;
    email: string;
    emailVerified: boolean;
    now: string;
  }): Promise<UserRow> {
    const row = await this.db
      .prepare(
        `INSERT INTO users (user_id, google_sub, email, email_verified, created_at, last_login_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT (google_sub) DO UPDATE SET
           email = excluded.email, email_verified = excluded.email_verified, last_login_at = excluded.last_login_at
         RETURNING user_id, google_sub, email, email_verified`,
      )
      .bind(input.userId, input.googleSub, input.email, input.emailVerified ? 1 : 0, input.now)
      .first<UserRow>();
    if (!row) throw new Error("users の upsert に失敗しました");
    return row;
  }

  async listMemberships(userId: string): Promise<MembershipRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT m.tenant_id, t.name, m.role, m.joined_at
           FROM tenant_members m JOIN tenants t ON t.tenant_id = m.tenant_id
          WHERE m.user_id = ?1 AND t.deleted_at IS NULL
          ORDER BY m.joined_at, m.tenant_id`,
      )
      .bind(userId)
      .all<MembershipRow>();
    return results;
  }

  async getRole(tenantId: string, userId: string): Promise<Role | null> {
    const row = await this.db
      .prepare(
        `SELECT m.role FROM tenant_members m JOIN tenants t ON t.tenant_id = m.tenant_id
          WHERE m.tenant_id = ?1 AND m.user_id = ?2 AND t.deleted_at IS NULL`,
      )
      .bind(tenantId, userId)
      .first<{ role: Role }>();
    return row?.role ?? null;
  }

  async countActiveTenants(): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS n FROM tenants WHERE deleted_at IS NULL")
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  /**
   * テナントと owner を1組だけ作る。上限判定と作成を同じ batch（1トランザクション）で行い、
   * 並行ログインでも二重作成・上限超過が起きないようにする。
   * onlyIfNoMembership=true（初回ログイン）のときは、既に所属があれば作らない。
   */
  async createTenantWithOwner(input: {
    tenantId: string;
    name: string;
    userId: string;
    now: string;
    maxTenants: number;
    onlyIfNoMembership: boolean;
  }): Promise<boolean> {
    const guard = input.onlyIfNoMembership
      ? "AND NOT EXISTS (SELECT 1 FROM tenant_members WHERE user_id = ?3)"
      : "";
    const [insertTenant] = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO tenants (tenant_id, name, db_binding, created_by, created_at)
           SELECT ?1, ?2, 'DB', ?3, ?4
            WHERE (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL) < ?5 ${guard}`,
        )
        .bind(input.tenantId, input.name, input.userId, input.now, input.maxTenants),
      this.db
        .prepare(
          `INSERT INTO tenant_members (tenant_id, user_id, role, joined_at)
           SELECT ?1, ?2, 'owner', ?3 WHERE EXISTS (SELECT 1 FROM tenants WHERE tenant_id = ?1)`,
        )
        .bind(input.tenantId, input.userId, input.now),
    ]);
    return (insertTenant?.meta.changes ?? 0) === 1;
  }

  async findInviteByTokenHash(tokenHash: string): Promise<InviteLookupRow | null> {
    return this.db
      .prepare(
        `SELECT i.tenant_id, i.invite_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at,
                t.name AS tenant_name
           FROM tenant_invites i JOIN tenants t ON t.tenant_id = i.tenant_id
          WHERE i.token_hash = ?1 AND t.deleted_at IS NULL`,
      )
      .bind(tokenHash)
      .first<InviteLookupRow>();
  }

  /** 未使用・未取消・期限内のときだけ使用済みにし、同じ batch でメンバーを追加する（1回限り） */
  async consumeInvite(input: {
    tenantId: string;
    inviteId: string;
    userId: string;
    role: InvitableRole;
    now: string;
  }): Promise<boolean> {
    const [consume] = await this.db.batch([
      this.db
        .prepare(
          `UPDATE tenant_invites SET accepted_at = ?3, accepted_by = ?4
            WHERE tenant_id = ?1 AND invite_id = ?2
              AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?3`,
        )
        .bind(input.tenantId, input.inviteId, input.now, input.userId),
      this.db
        .prepare(
          `INSERT INTO tenant_members (tenant_id, user_id, role, joined_at)
           SELECT ?1, ?3, ?4, ?5
            WHERE EXISTS (SELECT 1 FROM tenant_invites
                           WHERE tenant_id = ?1 AND invite_id = ?2 AND accepted_by = ?3 AND accepted_at = ?5)
           ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        )
        .bind(input.tenantId, input.inviteId, input.userId, input.role, input.now),
    ]);
    return (consume?.meta.changes ?? 0) === 1;
  }

  async createSession(input: {
    sessionIdHash: string;
    userId: string;
    tenantId: string | null;
    now: string;
    expiresAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO sessions (session_id_hash, user_id, tenant_id, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(input.sessionIdHash, input.userId, input.tenantId, input.now, input.expiresAt)
      .run();
  }

  async findSession(sessionIdHash: string, now: string): Promise<SessionRow | null> {
    return this.db
      .prepare(
        `SELECT s.user_id, u.email, s.tenant_id, s.expires_at
           FROM sessions s JOIN users u ON u.user_id = s.user_id
          WHERE s.session_id_hash = ?1 AND s.expires_at > ?2 AND u.deleted_at IS NULL`,
      )
      .bind(sessionIdHash, now)
      .first<SessionRow>();
  }

  async setSessionTenant(sessionIdHash: string, tenantId: string | null): Promise<void> {
    await this.db
      .prepare("UPDATE sessions SET tenant_id = ?2 WHERE session_id_hash = ?1")
      .bind(sessionIdHash, tenantId)
      .run();
  }

  async deleteSession(sessionIdHash: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM sessions WHERE session_id_hash = ?1")
      .bind(sessionIdHash)
      .run();
  }

  /** 最後に選んでいたテナント（同じ利用者の直近セッション）を次のログインの既定にする */
  async lastSelectedTenant(userId: string): Promise<string | null> {
    const row = await this.db
      .prepare(
        `SELECT tenant_id FROM sessions WHERE user_id = ?1 AND tenant_id IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(userId)
      .first<{ tenant_id: string }>();
    return row?.tenant_id ?? null;
  }
}
