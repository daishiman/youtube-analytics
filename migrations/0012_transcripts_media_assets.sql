-- /yt-analyze がローカルで作った文字起こし（時刻付き）と縮小画像の索引。画像本体は R2（tenants/<tenant_id>/media/…）。
CREATE TABLE transcripts (
  tenant_id  TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id   TEXT NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('srt', 'vtt', 'whisper', 'captions_api')),
  seq        INTEGER NOT NULL,
  start_ms   INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms     INTEGER NOT NULL CHECK (end_ms >= start_ms),
  text       TEXT NOT NULL,
  request_id TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, video_id, source, seq)
);

CREATE TABLE media_assets (
  tenant_id    TEXT NOT NULL REFERENCES tenants (tenant_id),
  asset_id     TEXT NOT NULL,
  video_id     TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('thumbnail', 'scene', 'screenshot')),
  at_ms        INTEGER,
  r2_key       TEXT NOT NULL,
  content_type TEXT NOT NULL,
  width        INTEGER,
  height       INTEGER,
  bytes        INTEGER NOT NULL,
  request_id   TEXT,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (tenant_id, asset_id)
);
CREATE INDEX idx_media_assets_video ON media_assets (tenant_id, video_id);
