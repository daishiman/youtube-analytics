-- 設定画面・YouTube チャンネル紐付け（feat-settings-channel-link / system-spec qa-074〜qa-086）
-- 追加のみ。既存テーブルは列追加だけで壊さない。既存テナントは channels 行なし = 未連携として扱う

-- 字幕の自動取得（既定 OFF・qa-076）
ALTER TABLE tenants ADD COLUMN captions_auto INTEGER NOT NULL DEFAULT 0 CHECK (captions_auto IN (0, 1));

-- 個人トークンの名前（必須・qa-083）。既存行は空文字になり、画面では「（名前なし）」と出す
ALTER TABLE skill_tokens ADD COLUMN name TEXT NOT NULL DEFAULT '';

-- 1テナント1チャンネル（qa-075）。channel_id の UNIQUE で別テナントの連携を DB でも拒否する（qa-081）
CREATE TABLE channels (
  tenant_id        TEXT PRIMARY KEY REFERENCES tenants (tenant_id),
  channel_id       TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  thumbnail_url    TEXT,
  subscriber_count INTEGER,               -- 表示のみ（非公開チャンネルは NULL）
  status           TEXT NOT NULL DEFAULT '正常' CHECK (status IN ('正常', '要再連携')),
  connected_by     TEXT NOT NULL REFERENCES users (user_id),
  connected_at     TEXT NOT NULL,
  last_collected_at TEXT                  -- 日次収集（feat-youtube-daily-collection）が更新する
);

-- OAuth の refresh token（暗号化）と付与スコープ（qa-076）。収集ジョブもこの行を読む
-- ワークスペースの OAuth クライアント（qa-087）で得たトークンだけを置く。ログイン時の付与記録
-- oauth_tokens（0003・アプリ共通クライアント）とは発行元が違い、混ぜると更新に失敗するので表を分ける
CREATE TABLE channel_oauth_tokens (
  tenant_id         TEXT PRIMARY KEY REFERENCES tenants (tenant_id),
  channel_id        TEXT NOT NULL,
  refresh_token_enc TEXT,
  granted_scopes    TEXT NOT NULL DEFAULT '',  -- 空白区切り
  updated_at        TEXT NOT NULL
);

-- OAuth 開始〜チャンネル確定の一時状態（有効10分・確定時に削除）。verifier・候補・トークンは暗号化
CREATE TABLE oauth_pending (
  state          TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants (tenant_id),
  user_id        TEXT NOT NULL REFERENCES users (user_id),
  purpose        TEXT NOT NULL CHECK (purpose IN ('connect', 'reconnect', 'captions')),
  verifier_enc   TEXT NOT NULL,
  candidates_enc TEXT,
  token_enc      TEXT,
  created_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL
);
CREATE INDEX idx_oauth_pending_tenant ON oauth_pending (tenant_id, user_id, created_at);

-- CSV・字幕・画像の取込履歴を1つに統合（設定画面は最新20件）
CREATE TABLE imports (
  tenant_id  TEXT NOT NULL REFERENCES tenants (tenant_id),
  import_id  TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('csv', 'caption', 'image')),
  file_name  TEXT NOT NULL,
  period     TEXT,                        -- 例 2026/08/25〜2026/09/21（解析後に取込処理が入れる）
  rows       INTEGER,
  status     TEXT NOT NULL CHECK (status IN ('処理待ち', '完了', '失敗')),
  error      TEXT,
  r2_key     TEXT,
  created_by TEXT NOT NULL REFERENCES users (user_id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, import_id)
);
CREATE INDEX idx_imports_recent ON imports (tenant_id, created_at);

-- 無料枠の自前カウンタ（日付 × 種類。全テナント合計・qa-078）
CREATE TABLE usage_counters (
  date  TEXT NOT NULL,                    -- YYYY-MM-DD（UTC。YouTube のクォータ日とずれる点は runbook に記載）
  kind  TEXT NOT NULL CHECK (kind IN ('youtube_units', 'caption_count', 'd1_writes')),
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, kind)
);

-- Cloudflare GraphQL Analytics の取得値（1時間キャッシュ）
CREATE TABLE usage_snapshots (
  kind       TEXT PRIMARY KEY CHECK (kind IN ('d1_storage_bytes', 'r2_storage_bytes', 'workers_requests')),
  value      INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);

-- 操作の監査ログ（連携・解除・字幕切替・トークン発行/失効・削除）
CREATE TABLE audit_log (
  audit_id  TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  action    TEXT NOT NULL,
  detail    TEXT,
  at        TEXT NOT NULL
);
CREATE INDEX idx_audit_log_tenant ON audit_log (tenant_id, at);

-- データ削除の予約（実行は feat-retention-ops。期限 = 受付 + 7日）
CREATE TABLE data_deletions (
  deletion_id  TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  scope        TEXT NOT NULL CHECK (scope IN ('channel', 'tenant')),
  channel_id   TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  due_at       TEXT NOT NULL,
  done_at      TEXT
);
CREATE INDEX idx_data_deletions_due ON data_deletions (done_at, due_at);

-- 固定窓のレート制限（トークン発行・OAuth 開始）
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL
);
