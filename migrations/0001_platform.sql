-- feat-platform-tenant-auth の土台（正本: database 章 qa-041〜qa-046、auth 章、security 章）
-- 日時はすべて ISO 8601 UTC 文字列（例 2026-09-22T00:00:00.000Z）。文字列順で大小比較できる。

-- 利用者。Google の sub で一意に識別し、メールは表示と招待の照合にだけ使う
CREATE TABLE users (
  user_id        TEXT PRIMARY KEY,
  google_sub     TEXT NOT NULL UNIQUE,
  email          TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  created_at     TEXT NOT NULL,
  last_login_at  TEXT,
  deleted_at     TEXT
);

-- テナント。db_binding は参照先 D1 を決める解決関数（src/repositories/db.ts）だけが読む
CREATE TABLE tenants (
  tenant_id  TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  db_binding TEXT NOT NULL DEFAULT 'DB',
  created_by TEXT NOT NULL REFERENCES users (user_id),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE tenant_members (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  user_id   TEXT NOT NULL REFERENCES users (user_id),
  role      TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);
-- ログイン時に「自分の所属一覧」を引くための逆引き
CREATE INDEX idx_tenant_members_user ON tenant_members (user_id);

-- 招待。平文トークンは保存せず SHA-256（hex）だけを持つ。7日・1回限り・取消可
CREATE TABLE tenant_invites (
  tenant_id   TEXT NOT NULL REFERENCES tenants (tenant_id),
  invite_id   TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT REFERENCES users (user_id),
  revoked_at  TEXT,
  created_by  TEXT NOT NULL REFERENCES users (user_id),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (tenant_id, invite_id)
);

-- サーバ側セッション。Cookie の平文 ID は保存せず SHA-256（hex）だけを持つ（30日）
-- tenant_id は「選択中テナント」。役割は要求ごとに tenant_members から読み直す
CREATE TABLE sessions (
  session_id_hash TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (user_id),
  tenant_id       TEXT REFERENCES tenants (tenant_id),
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- Claude Code 連携用トークンの土台（発行・利用 API は feat-skill-analysis-reports で実装）
CREATE TABLE skill_tokens (
  tenant_id    TEXT NOT NULL REFERENCES tenants (tenant_id),
  token_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users (user_id),
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT,
  PRIMARY KEY (tenant_id, token_id)
);
