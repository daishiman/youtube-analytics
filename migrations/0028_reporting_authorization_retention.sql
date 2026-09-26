-- Reporting 原本は、現在の OAuth 連携世代で直近30日以内にアクセスを再確認した場合だけ保持・公開する。
CREATE TABLE reporting_authorizations (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  token_updated_at TEXT NOT NULL,
  verified_at TEXT,
  revoked_at TEXT,
  PRIMARY KEY (tenant_id, channel_id)
);

-- 既存の現行世代原本は、保存時の Reporting API 成功を最終確認として引き継ぐ。
-- それ以前の世代・30日超の原本は読取ゲートで遮断され、cleanup が回収する。
INSERT INTO reporting_authorizations
  (tenant_id, channel_id, connected_at, token_updated_at, verified_at, revoked_at)
SELECT c.tenant_id, c.channel_id, c.connected_at, tok.updated_at,
       MAX(r.stored_at), NULL
  FROM channels c
  JOIN tenants t ON t.tenant_id = c.tenant_id
  JOIN channel_oauth_tokens tok ON tok.tenant_id = c.tenant_id AND tok.channel_id = c.channel_id
  JOIN reporting_raw_reports r ON r.tenant_id = c.tenant_id AND r.channel_id = c.channel_id
 WHERE c.status = '正常' AND t.deleted_at IS NULL AND tok.refresh_token_enc IS NOT NULL
   AND instr(' ' || tok.granted_scopes || ' ', ' https://www.googleapis.com/auth/yt-analytics.readonly ') > 0
   AND r.r2_key LIKE 'tenants/' || c.tenant_id || '/generations/g' || t.import_generation || '/reporting/%'
 GROUP BY c.tenant_id, c.channel_id;

-- 全原本キーを追跡する。現行行から参照されなくなったキーを回収し、並行差替えも取りこぼさない。
CREATE TABLE reporting_orphan_objects (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, r2_key)
);
CREATE INDEX idx_reporting_orphan_objects_created
  ON reporting_orphan_objects (created_at, tenant_id);
INSERT INTO reporting_orphan_objects (tenant_id, r2_key, created_at)
  SELECT tenant_id, r2_key, stored_at FROM reporting_raw_reports;
CREATE INDEX idx_reporting_raw_reports_stored
  ON reporting_raw_reports (stored_at, tenant_id);
CREATE INDEX idx_reporting_raw_reports_key
  ON reporting_raw_reports (tenant_id, r2_key);
