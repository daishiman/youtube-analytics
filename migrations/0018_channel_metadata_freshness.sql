-- channels.listで得た表示用メタデータの取得時刻。既存行は連携時の取得時刻を引き継ぐ。
ALTER TABLE channels ADD COLUMN metadata_fetched_at TEXT;
UPDATE channels SET metadata_fetched_at = connected_at;
