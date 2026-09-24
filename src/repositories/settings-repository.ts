// 設定画面の永続化。テナント配下の表は生成時に tenant_id を固定し、全クエリの WHERE に入れる（TenantScopedRepository と同じ規則）

import type { ImportKind } from "../domain/import-rules";
import type { TenantContext } from "../domain/tenant-context";

export type ChannelStatus = "正常" | "要再連携";
export type ImportStatus = "処理待ち" | "完了" | "失敗";
export type PendingPurpose = "connect" | "reconnect" | "captions";

export interface ChannelRow {
  channel_id: string;
  title: string;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  status: ChannelStatus;
  connected_at: string;
  last_collected_at: string | null;
}

export interface PendingRow {
  state: string;
  user_id: string;
  purpose: PendingPurpose;
  verifier_enc: string;
  candidates_enc: string | null;
  token_enc: string | null;
  expires_at: string;
}

export interface ImportRow {
  import_id: string;
  kind: ImportKind;
  file_name: string;
  period: string | null;
  rows: number | null;
  status: ImportStatus;
  error: string | null;
  created_at: string;
}

export interface SkillTokenRow {
  token_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface GoogleClientRow {
  client_id: string;
  client_secret_enc: string;
  updated_at: string;
}

/** channels.channel_id の UNIQUE 違反（別テナントで連携済み） */
export class ChannelTakenError extends Error {}

/** 旧チャンネルのデータ削除が終わる前に連携を確定しようとした */
export class ChannelDeletionPendingError extends Error {}

export class SettingsRepository {
  readonly tenantId: string;

  constructor(
    private readonly db: D1Database,
    ctx: Pick<TenantContext, "tenantId">,
  ) {
    this.tenantId = ctx.tenantId;
  }

  async getTenant(): Promise<{ name: string; captions_auto: number } | null> {
    return this.db
      .prepare(
        "SELECT name, captions_auto FROM tenants WHERE tenant_id = ?1 AND deleted_at IS NULL",
      )
      .bind(this.tenantId)
      .first();
  }

  async getChannel(): Promise<ChannelRow | null> {
    return this.db
      .prepare(
        `SELECT channel_id, title, thumbnail_url, subscriber_count, status, connected_at, last_collected_at
           FROM channels WHERE tenant_id = ?1`,
      )
      .bind(this.tenantId)
      .first<ChannelRow>();
  }

  async getGrantedScopes(): Promise<string[]> {
    const row = await this.db
      .prepare("SELECT granted_scopes FROM channel_oauth_tokens WHERE tenant_id = ?1")
      .bind(this.tenantId)
      .first<{ granted_scopes: string }>();
    return row ? row.granted_scopes.split(" ").filter(Boolean) : [];
  }

  async getRefreshTokenEnc(): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT refresh_token_enc FROM channel_oauth_tokens WHERE tenant_id = ?1")
      .bind(this.tenantId)
      .first<{ refresh_token_enc: string | null }>();
    return row?.refresh_token_enc ?? null;
  }

  /** チャンネルとトークンを1トランザクションで保存する。channel_id の UNIQUE 違反は ChannelTakenError */
  async insertChannel(input: {
    channel: {
      channelId: string;
      title: string;
      thumbnailUrl: string | null;
      subscriberCount: number | null;
    };
    userId: string;
    refreshTokenEnc: string | null;
    scopes: string[];
    now: string;
  }): Promise<void> {
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO channels (tenant_id, channel_id, title, thumbnail_url, subscriber_count, status, connected_by, connected_at)
             VALUES (?1, ?2, ?3, ?4, ?5, '正常', ?6, ?7)`,
          )
          .bind(
            this.tenantId,
            input.channel.channelId,
            input.channel.title,
            input.channel.thumbnailUrl,
            input.channel.subscriberCount,
            input.userId,
            input.now,
          ),
        this.upsertTokenStmt(
          input.channel.channelId,
          input.refreshTokenEnc,
          input.scopes,
          input.now,
        ),
      ]);
    } catch (err) {
      if (
        err instanceof Error &&
        /UNIQUE constraint failed: channels\.channel_id/.test(err.message)
      ) {
        throw new ChannelTakenError();
      }
      if (err instanceof Error && err.message.includes("CHANNEL_DELETION_PENDING")) {
        throw new ChannelDeletionPendingError();
      }
      throw err;
    }
  }

  /** 再連携・字幕の追加許可後にトークンとスコープを差し替え、状態を正常に戻す */
  async refreshConnection(input: {
    channelId: string;
    refreshTokenEnc: string | null;
    scopes: string[];
    captionsAuto: boolean;
    now: string;
  }): Promise<void> {
    await this.db.batch([
      this.upsertTokenStmt(input.channelId, input.refreshTokenEnc, input.scopes, input.now),
      this.db
        .prepare("UPDATE channels SET status = '正常' WHERE tenant_id = ?1 AND channel_id = ?2")
        .bind(this.tenantId, input.channelId),
      this.db
        .prepare("UPDATE tenants SET captions_auto = ?2 WHERE tenant_id = ?1")
        .bind(this.tenantId, input.captionsAuto ? 1 : 0),
    ]);
  }

  /** 字幕 OFF: トークンを捨てて要再連携にする（読み取り専用で連携し直すまで収集しない） */
  async dropTokenForReconnect(): Promise<void> {
    await this.db.batch(this.invalidateTokenStmts());
  }

  /** 連携解除: チャンネル行とトークンを消し、旧チャンネルのデータ削除を予約する */
  async disconnect(input: {
    channelId: string;
    deletionId: string;
    userId: string;
    now: string;
    dueAt: string;
  }): Promise<void> {
    await this.db.batch([
      this.deleteAllPendingStmt(),
      this.db.prepare("DELETE FROM channel_oauth_tokens WHERE tenant_id = ?1").bind(this.tenantId),
      this.db.prepare("DELETE FROM channels WHERE tenant_id = ?1").bind(this.tenantId),
      this.db
        .prepare("UPDATE tenants SET captions_auto = 0 WHERE tenant_id = ?1")
        .bind(this.tenantId),
      this.db
        .prepare(
          `INSERT INTO data_deletions (deletion_id, tenant_id, scope, channel_id, requested_by, requested_at, due_at)
           VALUES (?1, ?2, 'channel', ?3, ?4, ?5, ?6)`,
        )
        .bind(
          input.deletionId,
          this.tenantId,
          input.channelId,
          input.userId,
          input.now,
          input.dueAt,
        ),
    ]);
  }

  private upsertTokenStmt(
    channelId: string,
    refreshTokenEnc: string | null,
    scopes: string[],
    now: string,
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO channel_oauth_tokens (tenant_id, channel_id, refresh_token_enc, granted_scopes, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (tenant_id) DO UPDATE SET channel_id = excluded.channel_id,
           refresh_token_enc = COALESCE(excluded.refresh_token_enc, channel_oauth_tokens.refresh_token_enc),
           granted_scopes = excluded.granted_scopes, updated_at = excluded.updated_at`,
      )
      .bind(this.tenantId, channelId, refreshTokenEnc, scopes.join(" "), now);
  }

  // ---- テナントの Google Cloud OAuth クライアント（qa-087） ----

  async getGoogleClient(): Promise<GoogleClientRow | null> {
    return this.db
      .prepare(
        "SELECT client_id, client_secret_enc, updated_at FROM tenant_google_clients WHERE tenant_id = ?1",
      )
      .bind(this.tenantId)
      .first<GoogleClientRow>();
  }

  /**
   * クライアントを登録・更新する。invalidate=true（クライアントID が変わる）のときは、旧クライアントで
   * 始めた OAuth 手続きと得たトークンが使えなくなるので、手続きを捨ててトークンを消し、要再連携にする
   */
  async saveGoogleClient(input: {
    clientId: string;
    clientSecretEnc: string;
    userId: string;
    now: string;
    invalidate: boolean;
  }): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO tenant_google_clients (tenant_id, client_id, client_secret_enc, updated_by, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT (tenant_id) DO UPDATE SET client_id = excluded.client_id,
             client_secret_enc = excluded.client_secret_enc, updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
        )
        .bind(this.tenantId, input.clientId, input.clientSecretEnc, input.userId, input.now),
      ...(input.invalidate ? [this.deleteAllPendingStmt(), ...this.invalidateTokenStmts()] : []),
    ]);
  }

  async deleteGoogleClient(): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM tenant_google_clients WHERE tenant_id = ?1").bind(this.tenantId),
      this.deleteAllPendingStmt(),
      ...this.invalidateTokenStmts(),
    ]);
  }

  private deleteAllPendingStmt(): D1PreparedStatement {
    return this.db.prepare("DELETE FROM oauth_pending WHERE tenant_id = ?1").bind(this.tenantId);
  }

  private invalidateTokenStmts(): D1PreparedStatement[] {
    return [
      this.db
        .prepare(
          "UPDATE channel_oauth_tokens SET refresh_token_enc = NULL, granted_scopes = '' WHERE tenant_id = ?1",
        )
        .bind(this.tenantId),
      this.db
        .prepare("UPDATE channels SET status = '要再連携' WHERE tenant_id = ?1")
        .bind(this.tenantId),
      this.db
        .prepare("UPDATE tenants SET captions_auto = 0 WHERE tenant_id = ?1")
        .bind(this.tenantId),
    ];
  }

  // ---- OAuth 一時状態 ----

  async createPending(input: {
    state: string;
    userId: string;
    purpose: PendingPurpose;
    verifierEnc: string;
    now: string;
    expiresAt: string;
  }): Promise<void> {
    await this.db.batch([
      // 同じ人の古い手続きは捨てる（候補の取り違えを防ぐ）
      this.db
        .prepare(
          "DELETE FROM oauth_pending WHERE tenant_id = ?1 AND (user_id = ?2 OR expires_at <= ?3)",
        )
        .bind(this.tenantId, input.userId, input.now),
      this.db
        .prepare(
          `INSERT INTO oauth_pending (state, tenant_id, user_id, purpose, verifier_enc, created_at, expires_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(
          input.state,
          this.tenantId,
          input.userId,
          input.purpose,
          input.verifierEnc,
          input.now,
          input.expiresAt,
        ),
    ]);
  }

  async getPendingByState(state: string): Promise<PendingRow | null> {
    return this.db
      .prepare(
        `SELECT state, user_id, purpose, verifier_enc, candidates_enc, token_enc, expires_at
           FROM oauth_pending WHERE tenant_id = ?1 AND state = ?2`,
      )
      .bind(this.tenantId, state)
      .first<PendingRow>();
  }

  /** コールバック後、チャンネル選択を待っている手続き（本人の最新1件） */
  async getSelectablePending(userId: string, now: string): Promise<PendingRow | null> {
    return this.db
      .prepare(
        `SELECT state, user_id, purpose, verifier_enc, candidates_enc, token_enc, expires_at
           FROM oauth_pending
          WHERE tenant_id = ?1 AND user_id = ?2 AND purpose = 'connect'
            AND candidates_enc IS NOT NULL AND expires_at > ?3
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(this.tenantId, userId, now)
      .first<PendingRow>();
  }

  async savePendingResult(state: string, candidatesEnc: string, tokenEnc: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE oauth_pending SET candidates_enc = ?3, token_enc = ?4 WHERE tenant_id = ?1 AND state = ?2",
      )
      .bind(this.tenantId, state, candidatesEnc, tokenEnc)
      .run();
  }

  async deletePending(state: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM oauth_pending WHERE tenant_id = ?1 AND state = ?2")
      .bind(this.tenantId, state)
      .run();
  }

  // ---- 取込履歴 ----

  async listImports(limit = 20): Promise<ImportRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT import_id, kind, file_name, period, rows, status, error, created_at
           FROM imports WHERE tenant_id = ?1 ORDER BY created_at DESC, import_id DESC LIMIT ?2`,
      )
      .bind(this.tenantId, limit)
      .all<ImportRow>();
    return results;
  }

  async lastCsvImportAt(): Promise<string | null> {
    const row = await this.db
      .prepare(
        "SELECT MAX(created_at) AS at FROM imports WHERE tenant_id = ?1 AND kind = 'csv' AND status = '完了'",
      )
      .bind(this.tenantId)
      .first<{ at: string | null }>();
    return row?.at ?? null;
  }

  async getImportGeneration(): Promise<number> {
    const row = await this.db
      .prepare("SELECT import_generation FROM tenants WHERE tenant_id = ?1")
      .bind(this.tenantId)
      .first<{ import_generation: number }>();
    return row?.import_generation ?? 0;
  }

  /** アップロードの意思を R2.put より先に永続化する。削除予約との順序は D1 が確定する。 */
  async beginImportUpload(input: {
    importId: string;
    r2Key: string;
    expectedGeneration: number;
    now: string;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO import_uploads (tenant_id, import_id, r2_key, started_at)
         SELECT ?1, ?2, ?3, ?4 FROM tenants
          WHERE tenant_id = ?1 AND import_generation = ?5
            AND NOT EXISTS (
              SELECT 1 FROM data_deletions
               WHERE tenant_id = ?1 AND scope IN ('channel', 'tenant') AND done_at IS NULL
            )`,
      )
      .bind(this.tenantId, input.importId, input.r2Key, input.now, input.expectedGeneration)
      .run();
    return result.meta.changes === 1;
  }

  async finishImportUpload(importId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM import_uploads WHERE tenant_id = ?1 AND import_id = ?2")
      .bind(this.tenantId, importId)
      .run();
  }

  async insertImport(input: {
    importId: string;
    kind: ImportKind;
    fileName: string;
    status: ImportStatus;
    error: string | null;
    r2Key: string | null;
    userId: string;
    now: string;
    expectedGeneration: number;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO imports (tenant_id, import_id, kind, file_name, status, error, r2_key, created_by, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 FROM tenants
          WHERE tenant_id = ?1 AND import_generation = ?10
            AND NOT EXISTS (
              SELECT 1 FROM data_deletions
               WHERE tenant_id = ?1 AND scope IN ('channel', 'tenant') AND done_at IS NULL
            )`,
      )
      .bind(
        this.tenantId,
        input.importId,
        input.kind,
        input.fileName,
        input.status,
        input.error,
        input.r2Key,
        input.userId,
        input.now,
        input.expectedGeneration,
      )
      .run();
    return result.meta.changes === 1;
  }

  // ---- 個人トークン（自分の分だけ） ----

  async listSkillTokens(userId: string): Promise<SkillTokenRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT token_id, name, created_at, last_used_at FROM skill_tokens
          WHERE tenant_id = ?1 AND user_id = ?2 AND revoked_at IS NULL
          ORDER BY created_at DESC, token_id`,
      )
      .bind(this.tenantId, userId)
      .all<SkillTokenRow>();
    return results;
  }

  /** 上限を超えない場合だけ挿入する（条件付き INSERT で同時発行の競合も防ぐ）。戻り値: 挿入行数 */
  async insertSkillTokenWithinLimit(input: {
    tokenId: string;
    userId: string;
    name: string;
    tokenHash: string;
    limit: number;
    now: string;
  }): Promise<number> {
    const res = await this.db
      .prepare(
        `INSERT INTO skill_tokens (tenant_id, token_id, user_id, token_hash, label, name, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?5, ?6
          WHERE (SELECT COUNT(*) FROM skill_tokens WHERE user_id = ?3 AND revoked_at IS NULL) < ?7`,
      )
      .bind(
        this.tenantId,
        input.tokenId,
        input.userId,
        input.tokenHash,
        input.name,
        input.now,
        input.limit,
      )
      .run();
    return res.meta.changes;
  }

  async revokeSkillToken(userId: string, tokenId: string, now: string): Promise<number> {
    const res = await this.db
      .prepare(
        `UPDATE skill_tokens SET revoked_at = ?4
          WHERE tenant_id = ?1 AND user_id = ?2 AND token_id = ?3 AND revoked_at IS NULL`,
      )
      .bind(this.tenantId, userId, tokenId, now)
      .run();
    return res.meta.changes;
  }

  // ---- 削除予約・監査 ----

  /** 解除後の旧データが残る間は、新しいチャンネルを同じテナントへ入れない */
  async getPendingChannelDeletion(): Promise<{ due_at: string } | null> {
    return this.db
      .prepare(
        `SELECT due_at FROM data_deletions
          WHERE tenant_id = ?1 AND scope = 'channel' AND done_at IS NULL
          ORDER BY requested_at DESC LIMIT 1`,
      )
      .bind(this.tenantId)
      .first();
  }

  async getPendingDeletion(): Promise<{ scope: string; due_at: string } | null> {
    return this.db
      .prepare(
        `SELECT scope, due_at FROM data_deletions
          WHERE tenant_id = ?1 AND scope = 'tenant' AND done_at IS NULL
          ORDER BY requested_at DESC LIMIT 1`,
      )
      .bind(this.tenantId)
      .first();
  }

  async requestTenantDeletion(input: {
    deletionId: string;
    userId: string;
    now: string;
    dueAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO data_deletions (deletion_id, tenant_id, scope, requested_by, requested_at, due_at)
         VALUES (?1, ?2, 'tenant', ?3, ?4, ?5)`,
      )
      .bind(input.deletionId, this.tenantId, input.userId, input.now, input.dueAt)
      .run();
  }

  async audit(input: {
    auditId: string;
    userId: string;
    action: string;
    detail?: string;
    now: string;
  }): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO audit_log (audit_id, tenant_id, user_id, action, detail, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .bind(
        input.auditId,
        this.tenantId,
        input.userId,
        input.action,
        input.detail ?? null,
        input.now,
      )
      .run();
  }
}

/** テナントをまたぐ集計（無料枠・レート制限・連携済みチャンネルの有無）。内訳は返さない */
export class UsageRepository {
  constructor(private readonly db: D1Database) {}

  async snapshots(): Promise<{ kind: string; value: number; fetched_at: string }[]> {
    const { results } = await this.db
      .prepare("SELECT kind, value, fetched_at FROM usage_snapshots")
      .all<{ kind: string; value: number; fetched_at: string }>();
    return results;
  }

  async saveSnapshots(values: Record<string, number>, now: string): Promise<void> {
    await this.db.batch(
      Object.entries(values).map(([kind, value]) =>
        this.db
          .prepare(
            `INSERT INTO usage_snapshots (kind, value, fetched_at) VALUES (?1, ?2, ?3)
             ON CONFLICT (kind) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
          )
          .bind(kind, value, now),
      ),
    );
  }

  async tenantCount(): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS n FROM tenants WHERE deleted_at IS NULL")
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  /** 別テナントで連携済みか（候補一覧の表示用。どのテナントかは返さない） */
  async linkedChannelIds(channelIds: string[], exceptTenantId: string): Promise<Set<string>> {
    if (channelIds.length === 0) return new Set();
    const marks = channelIds.map((_, i) => `?${i + 2}`).join(",");
    const { results } = await this.db
      .prepare(`SELECT channel_id FROM channels WHERE tenant_id <> ?1 AND channel_id IN (${marks})`)
      .bind(exceptTenantId, ...channelIds)
      .all<{ channel_id: string }>();
    return new Set(results.map((r) => r.channel_id));
  }

  /**
   * 固定窓のレート制限。窓内の回数を1増やし、上限を超えたら false。
   * 1文の UPSERT で数えるので、同時要求でも上限を超えて通さない
   */
  async hit(key: string, limit: number, windowMs: number, now: Date): Promise<boolean> {
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
    const row = await this.db
      .prepare(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
           window_start = excluded.window_start
         RETURNING count`,
      )
      .bind(key, windowStart)
      .first<{ count: number }>();
    return (row?.count ?? 1) <= limit;
  }
}
