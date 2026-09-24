-- テナントごとの Google Cloud OAuth クライアント（YouTube 連携用・system-spec qa-087）
-- 登録は必須（未登録のテナントは連携を始められない）。Google ログインはアプリ共通のクライアントのまま。
-- シークレットは TOKEN_ENC_KEY で暗号化し、API・画面には返さない
CREATE TABLE tenant_google_clients (
  tenant_id         TEXT PRIMARY KEY REFERENCES tenants (tenant_id),
  client_id         TEXT NOT NULL,
  client_secret_enc TEXT NOT NULL,
  updated_by        TEXT NOT NULL REFERENCES users (user_id),
  updated_at        TEXT NOT NULL
);
