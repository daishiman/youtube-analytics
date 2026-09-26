-- Reporting 原本は先に保存し、reach のみ検証済みステージから原子的に反映する。
ALTER TABLE reporting_raw_reports ADD COLUMN normalized_at TEXT;

CREATE TABLE reporting_reach_stage (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  date TEXT NOT NULL,
  video_id TEXT NOT NULL,
  video_thumbnail_impressions INTEGER,
  video_thumbnail_impressions_ctr REAL,
  PRIMARY KEY (tenant_id, channel_id, report_id, date, video_id)
);
CREATE INDEX idx_reporting_reach_stage_report
  ON reporting_reach_stage (tenant_id, channel_id, report_id);
