-- ダッシュボード刷新（feat-dashboard-redesign / system-spec qa-099〜qa-109・appr-017）
-- ダッシュボードが「読む」表を、database 章の列定義に沿って用意する。
-- 書き込む処理（毎日収集・CSV取込・AI分析の受理・改善アクションの状態遷移）は上流 feature が作る。
-- 本 migration は読み取りに要る列だけを置き、上流 feature は ALTER TABLE ADD COLUMN で列を足して引き継ぐ。
-- 索引は主キーだけにする（索引の更新も D1 の書込行数に数えるため）。例外は media_assets の取り直し用索引（qa-108）。

-- 動画の基本情報（Data API videos.list 由来。30日で取り直す API データなので fetched_at を持つ・qa-035）
CREATE TABLE IF NOT EXISTS videos (
  tenant_id     TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  published_at  TEXT NOT NULL,              -- UTC ISO8601
  content_type  TEXT NOT NULL DEFAULT 'long' CHECK (content_type IN ('shorts', 'long')),
  thumbnail_url TEXT,                        -- snippet.thumbnails の元 URL（表示には使わず R2 経由で配る・qa-105）
  fetched_at    TEXT NOT NULL,
  PRIMARY KEY (tenant_id, video_id)
);

-- 切り口（利用者確定後は再分析で上書きしない）
CREATE TABLE IF NOT EXISTS video_angles (
  tenant_id    TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id     TEXT NOT NULL,
  angle        TEXT NOT NULL CHECK (angle IN ('つまずき解決型', '是非・意見型', '追加型')),
  confirmed_by TEXT,
  confirmed_at TEXT,
  PRIMARY KEY (tenant_id, video_id)
);

-- API 由来: チャンネル日次（Analytics API。content_type は creatorContentType）
CREATE TABLE IF NOT EXISTS daily_metrics (
  tenant_id                 TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id                TEXT NOT NULL,
  date                      TEXT NOT NULL,   -- YYYY-MM-DD
  content_type              TEXT NOT NULL,
  views                     INTEGER,
  estimated_minutes_watched INTEGER,
  subscribers_gained        INTEGER,
  subscribers_lost          INTEGER,
  fetched_at                TEXT NOT NULL,
  PRIMARY KEY (tenant_id, channel_id, date, content_type)
);

-- API 由来: 動画別の単日値（Analytics API・D-3 の単日クエリを積み上げる）
CREATE TABLE IF NOT EXISTS video_metrics (
  tenant_id                 TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id                  TEXT NOT NULL,
  date                      TEXT NOT NULL,
  views                     INTEGER,
  estimated_minutes_watched INTEGER,
  average_view_percentage   REAL,
  fetched_at                TEXT NOT NULL,
  PRIMARY KEY (tenant_id, video_id, date)
);

-- API 由来: サムネイルの表示回数と CTR（Reporting API の値をそのまま保存し、CTR を自前計算しない）
CREATE TABLE IF NOT EXISTS video_reach_daily (
  tenant_id                        TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id                         TEXT NOT NULL,
  date                             TEXT NOT NULL,
  video_thumbnail_impressions      INTEGER,
  video_thumbnail_impressions_ctr  REAL,     -- Reporting CSV の原値。実ファイルで数値の表現を確認するまで換算しない
  report_id                        TEXT,
  fetched_at                       TEXT NOT NULL,
  PRIMARY KEY (tenant_id, video_id, date)
);

-- CSV 由来: 動画別の日次（Studio グラフデータ.csv）。M1〜M10 はこの系統だけから計算する（qa-053）
CREATE TABLE IF NOT EXISTS video_daily_metrics (
  tenant_id               TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id                TEXT NOT NULL,
  date                    TEXT NOT NULL,
  views                   INTEGER,           -- 空欄は NULL、0 は実測 0
  engaged_views           INTEGER,
  average_view_percentage REAL,
  csv_import_id           TEXT,
  PRIMARY KEY (tenant_id, video_id, date)
);

-- CSV 由来: チャンネル合計の日次（Studio 合計.csv）
CREATE TABLE IF NOT EXISTS channel_daily_metrics (
  tenant_id       TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id      TEXT NOT NULL,
  date            TEXT NOT NULL,
  views           INTEGER,
  engaged_views   INTEGER,
  impressions     INTEGER,
  impressions_ctr REAL,
  csv_import_id   TEXT,
  imported_at     TEXT,
  PRIMARY KEY (tenant_id, channel_id, date)
);

-- レポート版（reports/findings）・改善アクション（actions）・画像（media_assets）は main の AI分析（0009・0010・0012）が
-- 作る。ダッシュボードはそれを読むだけにし、サムネイルの取り直しに要る2列と索引だけをここで足す。

-- 画像（R2 のキーは tenants/<tenant_id>/…）。ダッシュボードが YouTube から取り置くサムネイルは asset_id を
-- 'thumbnail:<video_id>' に固定して動画1本につき1行にし、fetched_at（R2 へ保存した実時刻）と source_url を必須にする（qa-108）。
-- /yt-analyze が送る画像（kind=thumbnail を含む・asset_id は乱数）は出所の列を持たないので、この条件の対象外にする。
-- ALTER TABLE では CHECK を足せないため、INSERT/UPDATE の trigger で同じ条件を守る
ALTER TABLE media_assets ADD COLUMN source_url TEXT;
ALTER TABLE media_assets ADD COLUMN fetched_at TEXT;
CREATE INDEX IF NOT EXISTS idx_media_assets_kind_fetched ON media_assets (tenant_id, kind, fetched_at);
CREATE TRIGGER media_assets_thumbnail_provenance_insert BEFORE INSERT ON media_assets
WHEN NEW.asset_id = 'thumbnail:' || NEW.video_id AND (NEW.source_url IS NULL OR NEW.fetched_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'thumbnail requires source_url and fetched_at');
END;
CREATE TRIGGER media_assets_thumbnail_provenance_update BEFORE UPDATE ON media_assets
WHEN NEW.asset_id = 'thumbnail:' || NEW.video_id AND (NEW.source_url IS NULL OR NEW.fetched_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'thumbnail requires source_url and fetched_at');
END;

-- 週次事業 CSV（week_start は JST 月曜。空欄は NULL、0 は実測 0）
CREATE TABLE IF NOT EXISTS business_funnel_weekly (
  tenant_id    TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id   TEXT NOT NULL,
  week_start   TEXT NOT NULL,
  route_label  TEXT NOT NULL DEFAULT 'LINE',
  route_visits INTEGER,
  inquiries    INTEGER,
  closed_deals INTEGER,
  revenue_jpy  INTEGER,
  imported_at  TEXT NOT NULL,
  imported_by  TEXT,
  PRIMARY KEY (tenant_id, channel_id, week_start)
);

CREATE TABLE IF NOT EXISTS funnel_targets (
  tenant_id      TEXT NOT NULL REFERENCES tenants (tenant_id),
  channel_id     TEXT NOT NULL,
  metric_id      TEXT NOT NULL CHECK (
    metric_id IN ('impressions', 'ctr', 'weighted_retention_m1', 'lead_route_rate', 'inquiry_close_rate')
  ),
  target_value   REAL,
  min_sample     INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  PRIMARY KEY (tenant_id, channel_id, metric_id, effective_from)
);
