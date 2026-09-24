-- ローカル画面テスト用のデータ（pnpm db:seed:local）。本番 D1 には流さない。何度流しても同じ状態に戻る
-- 開発用ログイン（DEV_LOGIN=1）は google_sub = 'dev:<メール>' で利用者を引くため、同じ形で入れる
-- 招待トークン（平文）: local-invite-editor-0000000000000000000000000 … invitee@example.com を編集者として招待（有効）
--                       local-invite-expired-000000000000000000000000 … expired@example.com（期限切れ）
-- YouTube 連携状態（画面の「YouTube 連携が未完了です」バナー確認用）:
--   テストチャンネルA = partial / 別チャンネルB = partial（owner@ は閲覧者なので「再連携」なし、other-owner@ は「再連携」あり）
--   partial@example.com … 自分がオーナーの「一部許可チャンネルP」= partial（「再連携」ボタンあり）
-- E2Eが作るdev:e2e-*も依存順に掃除し、反復実行でMAX_TENANTSへ近づかないようにする。
DELETE FROM consent_records WHERE user_id IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%');
DELETE FROM oauth_tokens WHERE user_id IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%')
  OR tenant_id IN (
    SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%')
  );
DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%');
DELETE FROM tenant_invites WHERE tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%')
);
DELETE FROM tenant_members WHERE tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%')
) OR user_id IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%');
UPDATE users SET last_tenant_id = NULL WHERE google_sub LIKE 'dev:e2e-%';
DELETE FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%');
DELETE FROM users WHERE google_sub LIKE 'dev:e2e-%';

-- 開発用ログインで作られた seed 以外の固定アカウント（invitee@ など）の行も消してから users を消す
DELETE FROM consent_records WHERE user_id IN (SELECT user_id FROM users WHERE user_id LIKE 'seed-%' OR google_sub IN (
  'dev:owner@example.com', 'dev:editor@example.com', 'dev:viewer@example.com', 'dev:other-owner@example.com',
  'dev:partial@example.com', 'dev:invitee@example.com', 'dev:expired@example.com'));
DELETE FROM oauth_tokens WHERE tenant_id LIKE 'seed-%' OR user_id LIKE 'seed-%';
DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM users WHERE user_id LIKE 'seed-%' OR google_sub IN (
  'dev:owner@example.com', 'dev:editor@example.com', 'dev:viewer@example.com', 'dev:other-owner@example.com',
  'dev:partial@example.com', 'dev:invitee@example.com', 'dev:expired@example.com'));
DELETE FROM tenant_invites WHERE tenant_id LIKE 'seed-%';
DELETE FROM tenant_members WHERE tenant_id LIKE 'seed-%' OR user_id LIKE 'seed-%';
UPDATE users SET last_tenant_id = NULL WHERE user_id LIKE 'seed-%';
DELETE FROM tenants WHERE tenant_id LIKE 'seed-%';
DELETE FROM users WHERE user_id LIKE 'seed-%' OR google_sub IN (
  'dev:owner@example.com', 'dev:editor@example.com', 'dev:viewer@example.com',
  'dev:other-owner@example.com', 'dev:partial@example.com', 'dev:invitee@example.com', 'dev:expired@example.com');

INSERT INTO users (user_id, google_sub, email, email_verified, created_at) VALUES
  ('seed-owner',       'dev:owner@example.com',       'owner@example.com',       1, '2026-09-01T00:00:00.000Z'),
  ('seed-editor',      'dev:editor@example.com',      'editor@example.com',      1, '2026-09-01T00:00:00.000Z'),
  ('seed-viewer',      'dev:viewer@example.com',      'viewer@example.com',      1, '2026-09-01T00:00:00.000Z'),
  ('seed-other-owner', 'dev:other-owner@example.com', 'other-owner@example.com', 1, '2026-09-01T00:00:00.000Z'),
  ('seed-partial',     'dev:partial@example.com',     'partial@example.com',     1, '2026-09-01T00:00:00.000Z');

INSERT INTO tenants (tenant_id, name, created_by, created_at, youtube_link_status) VALUES
  ('seed-tenant-a', 'テストチャンネルA', 'seed-owner',       '2026-09-01T00:00:00.000Z', 'partial'),
  ('seed-tenant-b', '別チャンネルB',     'seed-other-owner', '2026-09-01T00:00:00.000Z', 'partial'),
  ('seed-tenant-p', '一部許可チャンネルP', 'seed-partial',   '2026-09-01T00:00:00.000Z', 'partial');

-- 付与スコープの記録。refresh token を持たない seed は連携完了にしない
INSERT INTO oauth_tokens (tenant_id, user_id, scope, refresh_token_enc, updated_at) VALUES
  ('seed-tenant-a', 'seed-owner', 'openid email https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly', NULL, '2026-09-01T00:00:00.000Z'),
  ('seed-tenant-b', 'seed-other-owner', 'openid email https://www.googleapis.com/auth/youtube.readonly', NULL, '2026-09-01T00:00:00.000Z'),
  ('seed-tenant-p', 'seed-partial', 'openid email', NULL, '2026-09-01T00:00:00.000Z');

INSERT INTO tenant_members (tenant_id, user_id, role, joined_at) VALUES
  ('seed-tenant-a', 'seed-owner',       'owner',  '2026-09-01T00:00:00.000Z'),
  ('seed-tenant-a', 'seed-editor',      'editor', '2026-09-02T00:00:00.000Z'),
  ('seed-tenant-a', 'seed-viewer',      'viewer', '2026-09-03T00:00:00.000Z'),
  ('seed-tenant-b', 'seed-other-owner', 'owner',  '2026-09-01T00:00:00.000Z'),
  -- owner@example.com は B にも閲覧者で所属（テナント切替と役割による表示差の確認用）
  ('seed-tenant-b', 'seed-owner',       'viewer', '2026-09-04T00:00:00.000Z'),
  ('seed-tenant-p', 'seed-partial',     'owner',  '2026-09-01T00:00:00.000Z');

INSERT INTO tenant_invites (tenant_id, invite_id, email, role, token_hash, expires_at, created_by, created_at) VALUES
  ('seed-tenant-a', 'seed-invite-editor', 'invitee@example.com', 'editor', '367430ed9fb4b9061ce3537ceee57d119cc4a95fb745f37f96e6720352e19366',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 days'), 'seed-owner', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-tenant-a', 'seed-invite-expired', 'expired@example.com', 'viewer', 'b8b157ad329a944395262ac25713d1a835b720aec98eb0801ad0f6f18f0d21e0',
   '2026-09-01T00:00:00.000Z', 'seed-owner', '2026-08-25T00:00:00.000Z');
