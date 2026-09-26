-- 適用済み0015の失敗を保持しつつ、系列ごとの最新サイクルを記録する。
CREATE TABLE IF NOT EXISTS collection_series_status (
  tenant_id        TEXT NOT NULL REFERENCES tenants (tenant_id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('collect', 'reporting', 'analytics-dimensions')),
  report_key       TEXT NOT NULL DEFAULT '',
  channel_id       TEXT NOT NULL,
  connected_at     TEXT NOT NULL,
  token_updated_at TEXT NOT NULL,
  cycle_started_at TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('ok', 'failed')),
  changed_at       TEXT NOT NULL,
  PRIMARY KEY (tenant_id, kind, report_key),
  CHECK ((kind = 'analytics-dimensions') = (report_key <> ''))
);

-- 旧通には周期時刻がない。connected_at を最古の周期として扱い、新周期の状態を優先する。
INSERT INTO collection_series_status
  (tenant_id, kind, report_key, channel_id, connected_at, token_updated_at,
   cycle_started_at, status, changed_at)
SELECT tenant_id, kind, report_key, channel_id, connected_at, token_updated_at,
       connected_at, 'failed', failed_at
  FROM collection_series_failures
 WHERE 1
ON CONFLICT (tenant_id, kind, report_key) DO NOTHING;

DROP TABLE collection_series_failures;
