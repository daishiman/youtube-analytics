-- feat-login-redesign（正本: database 章 qa-065・qa-073、security 章 qa-072）
-- テナントの YouTube 連携状態。none=未連携 / partial=権限または継続利用用トークンが不足 / linked=読み取り2スコープと保存済みトークンがある
ALTER TABLE tenants ADD COLUMN youtube_link_status TEXT NOT NULL DEFAULT 'none'
  CHECK (youtube_link_status IN ('none', 'partial', 'linked'));

-- 規約・プライバシーポリシーへの同意の証跡。ログインが成功するたびに追記し、更新しない（アカウント削除時だけ消す）
CREATE TABLE consent_records (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (user_id),
  terms_version   TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  consented_at    TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('login', 'reconsent'))
);
CREATE INDEX idx_consent_records_user ON consent_records (user_id, consented_at);

-- テナントごとの Google OAuth 付与状態。refresh token は AES-256-GCM で暗号化して保存する（平文は持たない）
CREATE TABLE oauth_tokens (
  tenant_id         TEXT PRIMARY KEY REFERENCES tenants (tenant_id),
  user_id           TEXT NOT NULL REFERENCES users (user_id),
  scope             TEXT NOT NULL,
  refresh_token_enc TEXT,
  updated_at        TEXT NOT NULL
);
