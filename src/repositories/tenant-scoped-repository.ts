// テナント内の読み書きはすべてこの型を通す。生成時に TenantContext の tenant_id を固定し、
// 全クエリの WHERE に tenant_id を必ず入れる（他テナントの ID を渡しても 0 件 → 404 になる）
import type { InvitableRole, Role, TenantContext } from "../domain/tenant-context";

export interface MemberRow {
  user_id: string;
  email: string;
  role: Role;
  joined_at: string;
}

export interface InviteRow {
  invite_id: string;
  email: string;
  role: InvitableRole;
  expires_at: string;
  created_at: string;
}

export class TenantScopedRepository {
  readonly tenantId: string;

  constructor(
    private readonly db: D1Database,
    ctx: Pick<TenantContext, "tenantId">,
  ) {
    this.tenantId = ctx.tenantId;
  }

  async getTenant(): Promise<{ tenant_id: string; name: string; created_at: string } | null> {
    return this.db
      .prepare(
        "SELECT tenant_id, name, created_at FROM tenants WHERE tenant_id = ?1 AND deleted_at IS NULL",
      )
      .bind(this.tenantId)
      .first();
  }

  async listMembers(): Promise<MemberRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT m.user_id, u.email, m.role, m.joined_at
           FROM tenant_members m JOIN users u ON u.user_id = m.user_id
          WHERE m.tenant_id = ?1 ORDER BY m.joined_at, u.email, m.user_id`,
      )
      .bind(this.tenantId)
      .all<MemberRow>();
    return results;
  }

  async getMember(userId: string): Promise<MemberRow | null> {
    return this.db
      .prepare(
        `SELECT m.user_id, u.email, m.role, m.joined_at
           FROM tenant_members m JOIN users u ON u.user_id = m.user_id
          WHERE m.tenant_id = ?1 AND m.user_id = ?2`,
      )
      .bind(this.tenantId, userId)
      .first<MemberRow>();
  }

  /**
   * 役割変更。owner から外す変更は「変更後も owner が1人以上残る」ときだけ適用する（条件付き UPDATE）。
   * 戻り値: 更新した行数（0 なら最後の owner を外そうとした）
   */
  async updateRole(userId: string, role: Role): Promise<number> {
    const res = await this.db
      .prepare(
        `UPDATE tenant_members SET role = ?3
          WHERE tenant_id = ?1 AND user_id = ?2
            AND (?3 = 'owner' OR role <> 'owner'
                 OR (SELECT COUNT(*) FROM tenant_members WHERE tenant_id = ?1 AND role = 'owner') > 1)`,
      )
      .bind(this.tenantId, userId, role)
      .run();
    return res.meta.changes;
  }

  /** メンバー削除（脱退も同じ）。最後の owner は削除しない。戻り値: 削除した行数 */
  async removeMember(userId: string): Promise<number> {
    const [res] = await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM tenant_members
            WHERE tenant_id = ?1 AND user_id = ?2
              AND (role <> 'owner'
                   OR (SELECT COUNT(*) FROM tenant_members WHERE tenant_id = ?1 AND role = 'owner') > 1)`,
        )
        .bind(this.tenantId, userId),
      // 抜けた人のセッションが、このテナントを選んだまま残らないようにする
      this.db
        .prepare(
          `UPDATE sessions SET tenant_id = NULL
            WHERE tenant_id = ?1 AND user_id = ?2
              AND NOT EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id = ?1 AND user_id = ?2)`,
        )
        .bind(this.tenantId, userId),
    ]);
    return res?.meta.changes ?? 0;
  }

  async listPendingInvites(now: string): Promise<InviteRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT invite_id, email, role, expires_at, created_at FROM tenant_invites
          WHERE tenant_id = ?1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
          ORDER BY created_at DESC, invite_id`,
      )
      .bind(this.tenantId, now)
      .all<InviteRow>();
    return results;
  }

  async createInvite(input: {
    inviteId: string;
    email: string;
    role: InvitableRole;
    tokenHash: string;
    expiresAt: string;
    createdBy: string;
    now: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO tenant_invites (tenant_id, invite_id, email, role, token_hash, expires_at, created_by, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        this.tenantId,
        input.inviteId,
        input.email,
        input.role,
        input.tokenHash,
        input.expiresAt,
        input.createdBy,
        input.now,
      )
      .run();
  }

  /** 未使用の招待だけを取り消す。戻り値: 取り消した行数（0 なら存在しないか使用済み/取消済み） */
  async revokeInvite(inviteId: string, now: string): Promise<number> {
    const res = await this.db
      .prepare(
        `UPDATE tenant_invites SET revoked_at = ?3
          WHERE tenant_id = ?1 AND invite_id = ?2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      )
      .bind(this.tenantId, inviteId, now)
      .run();
    return res.meta.changes;
  }
}
