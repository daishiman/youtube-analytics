-- Analytics reports.query のチャンネル別原本。列順・未知の列・明示的な 0/null を維持する。
-- 各 report_key は最新の35日窓だけを保持し、未返却の行は生成しない。
CREATE TABLE analytics_raw_reports (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id TEXT NOT NULL,
  report_key TEXT NOT NULL CHECK (report_key IN ('traffic_daily', 'device_daily', 'country_period')),
  connected_at TEXT NOT NULL,
  token_updated_at TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  availability TEXT NOT NULL CHECK (availability IN ('available', 'empty', 'permission_denied')),
  column_headers_json TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, channel_id, report_key)
);

CREATE TABLE analytics_raw_rows (
  tenant_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  report_key TEXT NOT NULL,
  row_key TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  values_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, channel_id, report_key, row_key),
  FOREIGN KEY (tenant_id, channel_id, report_key)
    REFERENCES analytics_raw_reports (tenant_id, channel_id, report_key) ON DELETE CASCADE
);
CREATE INDEX idx_analytics_raw_rows_order
  ON analytics_raw_rows (tenant_id, channel_id, report_key, ordinal);
