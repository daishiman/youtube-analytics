-- ローカル画面テスト用のデータ（pnpm db:seed:local）。本番 D1 には流さない。何度流しても同じ状態に戻る
-- 開発用ログイン（DEV_LOGIN=1）は google_sub = 'dev:<メール>' で利用者を引くため、同じ形で入れる
-- 招待トークン（平文）: local-invite-editor-0000000000000000000000000 … invitee@example.com を編集者として招待（有効）
--                       local-invite-expired-000000000000000000000000 … expired@example.com（期限切れ）
-- YouTube 連携状態（画面の「YouTube 連携が未完了です」バナー確認用）:
--   テストチャンネルA = partial / 別チャンネルB = partial（owner@ は閲覧者なので「再連携」なし、other-owner@ は「再連携」あり）
--   partial@example.com … 自分がオーナーの「一部許可チャンネルP」= partial（「再連携」ボタンあり）
-- E2Eが作るdev:e2e-*も依存順に掃除し、反復実行でMAX_TENANTSへ近づかないようにする。
-- AI分析（feat-skill-analysis-reports / feat-ai-analysis-screen）の表。tenants より先に消す（外部キー）
-- reports 系は追記のみ（UPDATE を拒否するトリガ）だが DELETE は通る
DELETE FROM report_archives WHERE tenant_id LIKE 'seed-%' OR tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%'));
DELETE FROM actions WHERE tenant_id LIKE 'seed-%' OR tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%'));
DELETE FROM comment_emotions WHERE tenant_id LIKE 'seed-%' OR tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%'));
DELETE FROM psych_findings WHERE tenant_id LIKE 'seed-%' OR tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%'));
DELETE FROM findings WHERE tenant_id LIKE 'seed-%' OR tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%'));
DELETE FROM reports WHERE tenant_id LIKE 'seed-%' OR tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%'));
DELETE FROM analysis_requests WHERE tenant_id LIKE 'seed-%' OR tenant_id IN (
  SELECT tenant_id FROM tenants WHERE created_by IN (SELECT user_id FROM users WHERE google_sub LIKE 'dev:e2e-%'));

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
-- 設定画面（feat-settings-channel-link）の表。tenants より先に消す（外部キー）
DELETE FROM oauth_pending WHERE tenant_id LIKE 'seed-%';
DELETE FROM channel_oauth_tokens WHERE tenant_id LIKE 'seed-%';
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

-- 設定画面の表示確認用（feat-settings-channel-link）
-- テナントA: チャンネル連携済み（読み取りのみ・字幕OFF）。テナントB: 未連携のまま（「YouTubeと連携」の表示確認）
-- refresh token は入れない（ローカルで Google を呼ばない）。トークン平文は画面に出ないので hash はダミー
INSERT INTO channels (tenant_id, channel_id, title, thumbnail_url, subscriber_count, status, connected_by, connected_at, last_collected_at) VALUES
  ('seed-tenant-a', 'UCseedChannelA000000000', 'テストチャンネルA', NULL, 12345, '正常', 'seed-owner',
   '2026-09-01T00:00:00.000Z', strftime('%Y-%m-%dT03:00:00.000Z', 'now'));

INSERT INTO channel_oauth_tokens (tenant_id, channel_id, refresh_token_enc, granted_scopes, updated_at) VALUES
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

-- AI分析画面（feat-ai-analysis-screen）の表示確認用。テナントAに5状態の依頼と2版のレポートを置く
--   A-0001 完了（v1・web）/ A-0002 完了（v2・skill 自動）/ A-0003 失敗 / A-0004 実行中 / A-0005 待機中
--   v1 のアクション a1 は改善アクションへ登録済み（チェックボックスが出ないことの確認用）
--   結果 JSON（results / history_review）は正本 fixture（tests/fixtures/skill-analysis-report.json）と同じ形。
--   v1 は初回分析（成約段は判定保留）、v2 は v1 を参照し候補が流入→維持へ変わる。
--   parseReport を通ることは tests/analysis/history-review.test.ts で確かめる
INSERT INTO analysis_requests (tenant_id, request_id, channel_id, period_start, period_end, instruction, status, progress,
  stage, error, report_id, created_by, created_at, updated_at, started_at, finished_at, created_via) VALUES
  ('seed-tenant-a', 'A-0001', 'UCseedChannelA000000000', '2026-07-01', '2026-07-28', '初回の全体診断をお願いします', '完了', 100, 3, NULL,
   'seed-report-1', 'seed-owner', '2026-08-01T01:00:00.000Z', '2026-08-01T01:20:00.000Z', '2026-08-01T01:05:00.000Z', '2026-08-01T01:20:00.000Z', 'web'),
  ('seed-tenant-a', 'A-0002', 'UCseedChannelA000000000', '2026-08-01', '2026-08-28', '', '完了', 100, 3, NULL,
   'seed-report-2', 'seed-owner', '2026-09-01T01:00:00.000Z', '2026-09-01T01:25:00.000Z', '2026-09-01T01:00:00.000Z', '2026-09-01T01:25:00.000Z', 'skill'),
  ('seed-tenant-a', 'A-0003', 'UCseedChannelA000000000', '2026-08-29', '2026-09-25', 'コメントの傾向を重点的に', '失敗', 40, 1,
   'YouTube API の1日の上限に達しました。明日以降に再実行してください',
   NULL, 'seed-editor', '2026-09-24T02:00:00.000Z', '2026-09-24T02:10:00.000Z', '2026-09-24T02:01:00.000Z', '2026-09-24T02:10:00.000Z', 'web'),
  ('seed-tenant-a', 'A-0004', 'UCseedChannelA000000000', '2026-08-29', '2026-09-25', 'サムネイル変更の反応を見てください', '実行中', 60, 2, NULL,
   NULL, 'seed-owner', '2026-09-25T00:30:00.000Z', '2026-09-25T00:40:00.000Z', '2026-09-25T00:31:00.000Z', NULL, 'web'),
  ('seed-tenant-a', 'A-0005', 'UCseedChannelA000000000', '2026-06-27', '2026-09-25', '', '待機中', 0, 0, NULL,
   NULL, 'seed-editor', '2026-09-25T01:00:00.000Z', '2026-09-25T01:00:00.000Z', NULL, NULL, 'web');

INSERT INTO reports (tenant_id, report_id, channel_id, request_id, version, title, summary, conclusion, outcome,
  candidate_stage, candidate_metric, period_start, period_end, brief_json, results_json, history_review_json,
  ideas_json, actions_json, history_versions_used, report_html, idempotency_key, created_by, created_at) VALUES
  ('seed-tenant-a', 'seed-report-1', 'UCseedChannelA000000000', 'A-0001', 1, '7月の全体診断',
   '2026-07-20週の5原因指標のうち、目標との差が最も大きいのは流入段のクリック率（実績 3.80%・目標 5.00%・目標比 ▲24.0%）でした。成約段は問い合わせが少なく判定保留です。',
   '次の一手は流入段（クリック率）の改善候補を試すことです。', '改善候補あり', '流入', 'ctr', '2026-07-01', '2026-07-28',
   '{"question":"どの段を最初に改善すべきか"}',
   '{"status":"改善候補あり","candidate":{"stage":"流入","metric":"ctr","target_gap":-0.24},"target_week":"2026-07-20","funnel":[{"metric":"impressions","label":"インプレッション","stage":"露出","unit":"回","actual":15200,"target":15000,"target_gap":0.0133,"pending_reason":null},{"metric":"ctr","label":"クリック率","stage":"流入","unit":"%","actual":3.8,"target":5,"target_gap":-0.24,"pending_reason":null},{"metric":"m1","label":"加重平均視聴率","stage":"維持","unit":"%","actual":33.9,"target":35,"target_gap":-0.0314,"pending_reason":null},{"metric":"lead_route_rate","label":"導線誘導率","stage":"導線","unit":"%","actual":1.9,"target":1.5,"target_gap":0.2667,"pending_reason":null},{"metric":"inquiry_close_rate","label":"問い合わせ→成約率（同週）","stage":"成約","unit":"%","actual":0,"target":25,"target_gap":null,"pending_reason":"サンプル不足（2 < 5）"}],"pending_reasons":[{"metric":"inquiry_close_rate","reason":"サンプル不足（2 < 5）"}],"downstream":{"inquiries":2,"closed_deals":0,"revenue_jpy":0,"subscribers":18},"weekly":[{"week":"2026-07-06","impressions":14000,"ctr":3.6,"m1":34.2,"lead_route_rate":1.8,"inquiry_close_rate":0.0,"views":504,"engaged_views":440,"route_visits":9,"inquiries":1,"closed_deals":0,"revenue_jpy":0,"subscribers":15},{"week":"2026-07-13","impressions":14600,"ctr":3.7,"m1":34.0,"lead_route_rate":1.85,"inquiry_close_rate":50.0,"views":540,"engaged_views":470,"route_visits":10,"inquiries":2,"closed_deals":1,"revenue_jpy":240000,"subscribers":17},{"week":"2026-07-20","impressions":15200,"ctr":3.8,"m1":33.9,"lead_route_rate":1.9,"inquiry_close_rate":0.0,"views":578,"engaged_views":505,"route_visits":11,"inquiries":2,"closed_deals":0,"revenue_jpy":0,"subscribers":18}]}',
   '{"first_analysis":true,"versions_used":[],"previous_hypotheses":[],"action_effects":[],"changes":null}',
   '[{"title":"流入段（クリック率）の改善案を1件選んで試す","stage":"流入","metric":"ctr","options":["タイトル案","サムネイル"]}]',
   '[{"title":"サムネイルの文字量を減らす","stage":"流入","metric":"ctr","baseline_value":3.8,"target_value":5},{"title":"冒頭30秒で結論を言う","stage":"維持","metric":"m1","baseline_value":33.9,"target_value":35}]',
   '[]', '<!doctype html><html lang="ja"><body><h1>7月の全体診断</h1><p>流入段（CTR）が最大の改善候補です。</p></body></html>',
   'A-0001:v1', 'seed-owner', '2026-08-01T01:20:00.000Z'),
  ('seed-tenant-a', 'seed-report-2', 'UCseedChannelA000000000', 'A-0002', 2, '8月の振り返り',
   '2026-08-17週の5原因指標のうち、目標との差が最も大きいのは維持段の加重平均視聴率（実績 30.10%・目標 35.00%・目標比 ▲14.0%）でした。クリック率は前回の 3.80% から 4.40% に上がりましたが、施策との因果は判定していません。',
   '次の一手は維持段（加重平均視聴率）の改善候補を試すことです。前回のクリック率の仮説は保留のままです。', '改善候補あり', '維持', 'm1', '2026-08-01', '2026-08-28',
   '{"question":"前回の施策の効果はあったか"}',
   '{"status":"改善候補あり","candidate":{"stage":"維持","metric":"m1","target_gap":-0.14},"target_week":"2026-08-17","funnel":[{"metric":"impressions","label":"インプレッション","stage":"露出","unit":"回","actual":13500,"target":15000,"target_gap":-0.1,"pending_reason":null},{"metric":"ctr","label":"クリック率","stage":"流入","unit":"%","actual":4.4,"target":5,"target_gap":-0.12,"pending_reason":null},{"metric":"m1","label":"加重平均視聴率","stage":"維持","unit":"%","actual":30.1,"target":35,"target_gap":-0.14,"pending_reason":null},{"metric":"lead_route_rate","label":"導線誘導率","stage":"導線","unit":"%","actual":1.6,"target":1.5,"target_gap":0.0667,"pending_reason":null},{"metric":"inquiry_close_rate","label":"問い合わせ→成約率（同週）","stage":"成約","unit":"%","actual":33.33,"target":25,"target_gap":0.3332,"pending_reason":null}],"pending_reasons":[],"downstream":{"inquiries":6,"closed_deals":2,"revenue_jpy":480000,"subscribers":22},"weekly":[{"week":"2026-08-03","impressions":12600,"ctr":4.1,"m1":31.0,"lead_route_rate":1.5,"inquiry_close_rate":33.33,"views":517,"engaged_views":450,"route_visits":8,"inquiries":3,"closed_deals":1,"revenue_jpy":240000,"subscribers":20},{"week":"2026-08-10","impressions":13100,"ctr":4.3,"m1":30.6,"lead_route_rate":1.55,"inquiry_close_rate":0.0,"views":563,"engaged_views":490,"route_visits":9,"inquiries":3,"closed_deals":0,"revenue_jpy":0,"subscribers":21},{"week":"2026-08-17","impressions":13500,"ctr":4.4,"m1":30.1,"lead_route_rate":1.6,"inquiry_close_rate":33.33,"views":594,"engaged_views":517,"route_visits":10,"inquiries":6,"closed_deals":2,"revenue_jpy":480000,"subscribers":22}]}',
   '{"first_analysis":false,"versions_used":[1],"previous_hypotheses":[{"version":1,"hypothesis_id":"H1","title":"サムネイルの文字量を減らすと CTR が上がる","previous_verdict":"保留","current_verdict":"保留","review":"同じ反証条件で今回の期間を再判定"}],"action_effects":[{"action_id":"seed-action-1","title":"サムネイルの文字量を減らす","stage":"流入","metric":"ctr","baseline":3.8,"current":4.4,"delta":0.6,"week":"2026-08-17","downstream":{"inquiries":6,"closed_deals":2,"revenue_jpy":480000},"status":"効果測定中","report_id":"seed-report-1"}],"changes":{"compared_version":1,"previous_candidate":{"stage":"流入","metric":"ctr"},"current_candidate":{"stage":"維持","metric":"m1"},"same_candidate":false,"downstream_delta":{"inquiries":4,"closed_deals":2,"revenue_jpy":480000}}}',
   '[]',
   '[{"title":"冒頭30秒で結論を言う","stage":"維持","metric":"m1","baseline_value":30.1,"target_value":35},{"title":"概要欄に問い合わせ導線を置く","stage":"導線","metric":"lead_route_rate","baseline_value":1.6,"target_value":2}]',
   '[1]', '<!doctype html><html lang="ja"><body><h1>8月の振り返り</h1><p>維持段（加重平均視聴率）が次の改善候補です。</p></body></html>',
   'A-0002:v2', 'seed-owner', '2026-09-01T01:25:00.000Z');

INSERT INTO findings (tenant_id, report_id, finding_no, kind, title, fact, interpretation, stage, metric, hypothesis_id, falsifier, verdict, evidence_json) VALUES
  ('seed-tenant-a', 'seed-report-1', 1, 'factor', 'CTR が目標未達', 'CTR は 3.8%（目標 5.0%）', 'サムネイルの訴求が弱い可能性があります', '流入', 'ctr', NULL, NULL, NULL, '{}'),
  ('seed-tenant-a', 'seed-report-1', 2, 'hypothesis', 'サムネイルの文字量を減らすと CTR が上がる', NULL, NULL, NULL, NULL, 'H1', '2週間で CTR が 0.3pt 以上上がらなければ棄却', '保留', '{}'),
  ('seed-tenant-a', 'seed-report-2', 1, 'factor', '加重平均視聴率が目標未達', '加重平均視聴率は 30.10%（目標 35.00%）', '冒頭の前置きが長い可能性があります', '維持', 'm1', NULL, NULL, NULL, '{}'),
  ('seed-tenant-a', 'seed-report-2', 2, 'factor', 'CTR は改善傾向', 'CTR は 3.8% → 4.4%', 'サムネイル変更と同時期ですが、因果は断定できません', '流入', 'ctr', NULL, NULL, NULL, '{}'),
  ('seed-tenant-a', 'seed-report-2', 3, 'hypothesis', '冒頭30秒で結論を言うと加重平均視聴率が上がる', NULL, NULL, NULL, NULL, 'H2', '3本で加重平均視聴率が 3pt 以上上がらなければ棄却', '保留', '{}');

INSERT INTO psych_findings (tenant_id, report_id, finding_no, layer, claim, evidence_json, counter_hypothesis, confidence) VALUES
  ('seed-tenant-a', 'seed-report-1', 1, '感情', '視聴者は結論の速さを期待している', '[{"comment_id":"c1","quote":"早く結論が知りたい"}]', '単に動画が長いだけ', 0.6),
  ('seed-tenant-a', 'seed-report-2', 1, '考え', '自分に関係ある話かを冒頭で判断している', '[{"comment_id":"c2","quote":"最初に対象者を言ってほしい"}]', '音量や画質が原因', 0.55),
  ('seed-tenant-a', 'seed-report-2', 2, '行動', '関係ないと判断すると1分以内に離脱する', '[{"comment_id":"c3","quote":"途中で閉じちゃった"}]', NULL, 0.5);

INSERT INTO comment_emotions (tenant_id, report_id, comment_id, emotion, intent) VALUES
  ('seed-tenant-a', 'seed-report-1', 'c1', '期待', '質問'),
  ('seed-tenant-a', 'seed-report-2', 'c2', '期待', '質問'),
  ('seed-tenant-a', 'seed-report-2', 'c3', '悲しみ', '体験談'),
  ('seed-tenant-a', 'seed-report-2', 'c4', '喜び', '共感');

INSERT INTO actions (tenant_id, action_id, channel_id, report_id, title, stage, metric, baseline_value, target_value, result_value,
  status, judgement, created_by, created_at, updated_at, source_report_id, source_key) VALUES
  ('seed-tenant-a', 'seed-action-1', 'UCseedChannelA000000000', 'seed-report-1', 'サムネイルの文字量を減らす', '流入', 'ctr', 3.8, 5, NULL,
   '効果測定中', NULL, 'seed-owner', '2026-08-02T00:00:00.000Z', '2026-08-20T00:00:00.000Z', 'seed-report-1', 'a1');

-- AI分析の E2E 用。3サイズ（mobile/tablet/desktop）が並列で版番号を奪い合わないよう、サイズごとに独立したテナントを置く
INSERT INTO users (user_id, google_sub, email, email_verified, created_at) VALUES
  ('seed-analysis-mobile',  'dev:analysis-mobile@example.com',  'analysis-mobile@example.com',  1, '2026-09-01T00:00:00.000Z'),
  ('seed-analysis-tablet',  'dev:analysis-tablet@example.com',  'analysis-tablet@example.com',  1, '2026-09-01T00:00:00.000Z'),
  ('seed-analysis-desktop', 'dev:analysis-desktop@example.com', 'analysis-desktop@example.com', 1, '2026-09-01T00:00:00.000Z');
INSERT INTO tenants (tenant_id, name, created_by, created_at, youtube_link_status) VALUES
  ('seed-tenant-e2e-mobile',  'E2E分析mobile',  'seed-analysis-mobile',  '2026-09-01T00:00:00.000Z', 'linked'),
  ('seed-tenant-e2e-tablet',  'E2E分析tablet',  'seed-analysis-tablet',  '2026-09-01T00:00:00.000Z', 'linked'),
  ('seed-tenant-e2e-desktop', 'E2E分析desktop', 'seed-analysis-desktop', '2026-09-01T00:00:00.000Z', 'linked');
INSERT INTO tenant_members (tenant_id, user_id, role, joined_at) VALUES
  ('seed-tenant-e2e-mobile',  'seed-analysis-mobile',  'owner', '2026-09-01T00:00:00.000Z'),
  ('seed-tenant-e2e-tablet',  'seed-analysis-tablet',  'owner', '2026-09-01T00:00:00.000Z'),
  ('seed-tenant-e2e-desktop', 'seed-analysis-desktop', 'owner', '2026-09-01T00:00:00.000Z');
INSERT INTO channels (tenant_id, channel_id, title, thumbnail_url, subscriber_count, status, connected_by, connected_at, last_collected_at) VALUES
  ('seed-tenant-e2e-mobile',  'UCseedE2EMobile00000000',  'E2E分析mobile',  NULL, 100, '正常', 'seed-analysis-mobile',  '2026-09-01T00:00:00.000Z', NULL),
  ('seed-tenant-e2e-tablet',  'UCseedE2ETablet00000000',  'E2E分析tablet',  NULL, 100, '正常', 'seed-analysis-tablet',  '2026-09-01T00:00:00.000Z', NULL),
  ('seed-tenant-e2e-desktop', 'UCseedE2EDesktop0000000', 'E2E分析desktop', NULL, 100, '正常', 'seed-analysis-desktop', '2026-09-01T00:00:00.000Z', NULL);
