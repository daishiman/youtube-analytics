-- Reporting API 原本。列はレポート種類・版で変わるため、CSV をそのまま R2 に保存する。
CREATE TABLE reporting_jobs (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  report_type_id TEXT NOT NULL,
  name TEXT NOT NULL,
  system_managed INTEGER NOT NULL DEFAULT 0,
  job_created_at TEXT,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, channel_id, job_id)
);
CREATE INDEX idx_reporting_jobs_tenant_type ON reporting_jobs (tenant_id, channel_id, report_type_id);

-- 同じ reportType / 期間の更新版は create_time が後のものだけを現行原本とする。
CREATE TABLE reporting_raw_reports (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id TEXT NOT NULL,
  report_type_id TEXT NOT NULL,
  report_type_version TEXT,
  job_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  create_time TEXT NOT NULL,
  header_json TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  byte_count INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'stored'),
  stored_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, channel_id, report_type_id, start_time, end_time)
);
CREATE INDEX idx_reporting_raw_reports_tenant_created
  ON reporting_raw_reports (tenant_id, channel_id, create_time DESC);
