-- 字幕の自動取得。試行は YouTube クォータ日（Pacific Time）単位で予約する。
-- 1本につき list 50 + download 200 units を全額予約し、応答が不明でも返金しない。
CREATE TABLE caption_attempts (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  quota_date TEXT NOT NULL,
  video_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  token_updated_at TEXT NOT NULL,
  generation INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('reserved', 'listing', 'listed', 'no_track', 'downloading', 'stored', 'failed')),
  caption_id TEXT,
  language TEXT,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, quota_date, video_id)
);
CREATE INDEX idx_caption_attempts_tenant_day ON caption_attempts (tenant_id, quota_date);

CREATE TABLE caption_records (
  tenant_id TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  caption_id TEXT NOT NULL,
  language TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, video_id)
);
