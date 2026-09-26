-- Data API は短い動画を Shorts と確定できない。ライブと形式未確定を長尺に混ぜない。
-- SQLite の CHECK は ALTER COLUMN できないため、データを保持して videos だけ再作成する。
CREATE TABLE videos_next (
  tenant_id     TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  published_at  TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'unknown'
                CHECK (content_type IN ('shorts', 'long', 'live', 'unknown')),
  duration_seconds REAL,
  live_broadcast_content TEXT,
  has_live_streaming_details INTEGER CHECK (has_live_streaming_details IN (0, 1)),
  thumbnail_url TEXT,
  fetched_at    TEXT NOT NULL,
  PRIMARY KEY (tenant_id, video_id)
);

INSERT INTO videos_next
  (tenant_id, video_id, channel_id, title, published_at, content_type, thumbnail_url, fetched_at)
SELECT tenant_id, video_id, channel_id, title, published_at, content_type, thumbnail_url, fetched_at
  FROM videos;

DROP TABLE videos;
ALTER TABLE videos_next RENAME TO videos;
