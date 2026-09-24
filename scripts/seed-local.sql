-- ローカル画面テスト用のデータ（pnpm db:seed:local）。本番 D1 には流さない。何度流しても同じ状態に戻る
-- 開発用ログイン（DEV_LOGIN=1）は google_sub = 'dev:<メール>' で利用者を引くため、同じ形で入れる
-- 招待トークン（平文）: local-invite-editor-0000000000000000000000000 … invitee@example.com を編集者として招待（有効）
--                       local-invite-expired-000000000000000000000000 … expired@example.com（期限切れ）
-- E2Eが作るdev:e2e-*も依存順に掃除し、反復実行でMAX_TENANTSへ近づかないようにする。
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

DELETE FROM sessions WHERE user_id LIKE 'seed-%';
-- 設定画面（feat-settings-channel-link）の表。tenants より先に消す（外部キー）
DELETE FROM oauth_pending WHERE tenant_id LIKE 'seed-%';
DELETE FROM oauth_tokens WHERE tenant_id LIKE 'seed-%';
DELETE FROM channels WHERE tenant_id LIKE 'seed-%';
DELETE FROM imports WHERE tenant_id LIKE 'seed-%';
DELETE FROM skill_tokens WHERE tenant_id LIKE 'seed-%';
DELETE FROM audit_log WHERE tenant_id LIKE 'seed-%';
DELETE FROM data_deletions WHERE tenant_id LIKE 'seed-%';
DELETE FROM rate_limits;
DELETE FROM usage_counters;
DELETE FROM usage_snapshots;
DELETE FROM tenant_invites WHERE tenant_id LIKE 'seed-%';
DELETE FROM tenant_members WHERE tenant_id LIKE 'seed-%' OR user_id LIKE 'seed-%';
UPDATE users SET last_tenant_id = NULL WHERE user_id LIKE 'seed-%';
DELETE FROM tenants WHERE tenant_id LIKE 'seed-%';
DELETE FROM users WHERE user_id LIKE 'seed-%' OR google_sub IN (
  'dev:owner@example.com', 'dev:editor@example.com', 'dev:viewer@example.com',
  'dev:other-owner@example.com', 'dev:invitee@example.com', 'dev:expired@example.com');

INSERT INTO users (user_id, google_sub, email, email_verified, created_at) VALUES
  ('seed-owner',       'dev:owner@example.com',       'owner@example.com',       1, '2026-09-01T00:00:00.000Z'),
  ('seed-editor',      'dev:editor@example.com',      'editor@example.com',      1, '2026-09-01T00:00:00.000Z'),
  ('seed-viewer',      'dev:viewer@example.com',      'viewer@example.com',      1, '2026-09-01T00:00:00.000Z'),
  ('seed-other-owner', 'dev:other-owner@example.com', 'other-owner@example.com', 1, '2026-09-01T00:00:00.000Z');

INSERT INTO tenants (tenant_id, name, created_by, created_at) VALUES
  ('seed-tenant-a', 'テストチャンネルA', 'seed-owner',       '2026-09-01T00:00:00.000Z'),
  ('seed-tenant-b', '別チャンネルB',     'seed-other-owner', '2026-09-01T00:00:00.000Z');

INSERT INTO tenant_members (tenant_id, user_id, role, joined_at) VALUES
  ('seed-tenant-a', 'seed-owner',       'owner',  '2026-09-01T00:00:00.000Z'),
  ('seed-tenant-a', 'seed-editor',      'editor', '2026-09-02T00:00:00.000Z'),
  ('seed-tenant-a', 'seed-viewer',      'viewer', '2026-09-03T00:00:00.000Z'),
  ('seed-tenant-b', 'seed-other-owner', 'owner',  '2026-09-01T00:00:00.000Z'),
  -- owner@example.com は B にも閲覧者で所属（テナント切替と役割による表示差の確認用）
  ('seed-tenant-b', 'seed-owner',       'viewer', '2026-09-04T00:00:00.000Z');

INSERT INTO tenant_invites (tenant_id, invite_id, email, role, token_hash, expires_at, created_by, created_at) VALUES
  ('seed-tenant-a', 'seed-invite-editor', 'invitee@example.com', 'editor', '367430ed9fb4b9061ce3537ceee57d119cc4a95fb745f37f96e6720352e19366',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 days'), 'seed-owner', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-tenant-a', 'seed-invite-expired', 'expired@example.com', 'viewer', 'b8b157ad329a944395262ac25713d1a835b720aec98eb0801ad0f6f18f0d21e0',
   '2026-09-01T00:00:00.000Z', 'seed-owner', '2026-08-25T00:00:00.000Z');

-- 設定画面の表示確認用（feat-settings-channel-link）
-- テナントA: チャンネル連携済み（読み取りのみ・字幕OFF）。テナントB: 未連携のまま（「YouTubeと連携」の表示確認）
-- refresh token は入れない（ローカルで Google を呼ばない）。トークン平文は画面に出ないので hash はダミー
INSERT INTO channels (tenant_id, channel_id, title, thumbnail_url, subscriber_count, status, connected_by, connected_at, last_collected_at) VALUES
  ('seed-tenant-a', 'UCseedChannelA000000000', 'テストチャンネルA', NULL, 12345, '正常', 'seed-owner',
   '2026-09-01T00:00:00.000Z', strftime('%Y-%m-%dT03:00:00.000Z', 'now'));

INSERT INTO oauth_tokens (tenant_id, channel_id, refresh_token_enc, granted_scopes, updated_at) VALUES
  ('seed-tenant-a', 'UCseedChannelA000000000', NULL,
   'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
   '2026-09-01T00:00:00.000Z');

INSERT INTO imports (tenant_id, import_id, kind, file_name, period, rows, status, error, r2_key, created_by, created_at) VALUES
  ('seed-tenant-a', 'seed-import-1', 'csv',     'studio_2026-08.csv', '2026/08/01〜2026/08/31', 31, '完了', NULL, NULL, 'seed-owner',  '2026-09-20T10:00:00.000Z'),
  ('seed-tenant-a', 'seed-import-2', 'caption', 'intro.vtt',          NULL,                     120, '完了', NULL, NULL, 'seed-editor', '2026-09-21T09:30:00.000Z'),
  ('seed-tenant-a', 'seed-import-3', 'csv',     'broken.csv',         NULL,                     NULL, '失敗', '見出し行に「日付」がありません', NULL, 'seed-editor', '2026-09-22T08:15:00.000Z'),
  ('seed-tenant-a', 'seed-import-4', 'image',   'thumbnail.png',      NULL,                     NULL, '処理待ち', NULL, NULL, 'seed-owner', '2026-09-23T12:00:00.000Z');

INSERT INTO skill_tokens (tenant_id, token_id, user_id, token_hash, label, name, created_at, last_used_at) VALUES
  ('seed-tenant-a', 'seed-token-1', 'seed-owner', 'seed-dummy-hash-0001', '', '自宅のMac',   '2026-09-10T00:00:00.000Z', '2026-09-23T21:00:00.000Z'),
  ('seed-tenant-a', 'seed-token-2', 'seed-owner', 'seed-dummy-hash-0002', '', '会社のノートPC', '2026-09-15T00:00:00.000Z', NULL);

-- 無料枠（全テナント合計）。YouTube API・D1 容量は緑、D1 書込は黄（82%）、R2・Workers は赤（91%超）になる値
INSERT INTO usage_counters (date, kind, value) VALUES
  (strftime('%Y-%m-%d', 'now'), 'youtube_units', 1240),
  (strftime('%Y-%m-%d', 'now'), 'caption_count', 2),
  (strftime('%Y-%m-%d', 'now'), 'd1_writes', 82000);

-- fetched_at を今にして「1時間キャッシュ」内に置く（ローカルで Cloudflare API を呼ばない）
INSERT INTO usage_snapshots (kind, value, fetched_at) VALUES
  ('d1_storage_bytes', 375809638, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('r2_storage_bytes', 9800000000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('workers_requests', 91500, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO audit_log (audit_id, tenant_id, user_id, action, detail, at) VALUES
  ('seed-audit-1', 'seed-tenant-a', 'seed-owner', 'youtube.connect', '{"channelId":"UCseedChannelA000000000"}', '2026-09-01T00:00:00.000Z'),
  ('seed-audit-2', 'seed-tenant-a', 'seed-owner', 'token.issue', '{"tokenId":"seed-token-1"}', '2026-09-10T00:00:00.000Z'),
  ('seed-audit-3', 'seed-tenant-a', 'seed-owner', 'token.issue', '{"tokenId":"seed-token-2"}', '2026-09-15T00:00:00.000Z');
