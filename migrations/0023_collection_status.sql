-- 0015 は適用済みDBとの互換性のため不変。系列ごとの収集失敗を保持する。
CREATE TABLE collection_series_failures (
  tenant_id        TEXT NOT NULL REFERENCES tenants (tenant_id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('collect', 'reporting', 'analytics-dimensions')),
  report_key       TEXT NOT NULL DEFAULT '',
  channel_id       TEXT NOT NULL,
  connected_at     TEXT NOT NULL,
  token_updated_at TEXT NOT NULL,
  failed_at        TEXT NOT NULL,
  PRIMARY KEY (tenant_id, kind, report_key),
  CHECK ((kind = 'analytics-dimensions') = (report_key <> ''))
);
