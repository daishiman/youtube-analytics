-- Studio CSVの原本はimports.r2_keyを正本とする。列と正規化結果の対応だけをD1へ記録する。
-- 実ファイル例が未確定のため、期間を推測せず表データのperiod_from/toはNULLを許す。
CREATE TABLE studio_csv_imports (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  import_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  studio_kind TEXT NOT NULL CHECK (studio_kind IN ('table', 'graph', 'total')),
  mapped_columns INTEGER NOT NULL,
  unmapped_columns INTEGER NOT NULL,
  normalized_rows INTEGER NOT NULL,
  unresolved_rows INTEGER NOT NULL,
  period_status TEXT NOT NULL CHECK (period_status IN ('unknown', 'daily')),
  imported_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, import_id)
);

CREATE TABLE studio_csv_columns (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  import_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  header TEXT NOT NULL,
  mapping_key TEXT,
  unit TEXT,
  status TEXT NOT NULL CHECK (status IN ('mapped', 'unmapped')),
  PRIMARY KEY (tenant_id, import_id, ordinal)
);

-- 表データの期間はCSVの列にない。期間確定まで期間指標を日次値と混ぜない。
-- metrics_jsonはカタログで単位が明示された数値だけを保存する。
CREATE TABLE video_period_metrics (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  import_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  video_id TEXT,
  is_total INTEGER NOT NULL CHECK (is_total IN (0, 1)),
  period_from TEXT,
  period_to TEXT,
  title TEXT,
  metrics_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, import_id, row_index)
);
CREATE INDEX idx_video_period_metrics_video
  ON video_period_metrics (tenant_id, channel_id, video_id);

-- 日付・動画ID・数値の形式が未確定の行を落とさず、理由と原本の行を示す。
CREATE TABLE studio_csv_unresolved_rows (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  import_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY (tenant_id, import_id, row_index)
);
