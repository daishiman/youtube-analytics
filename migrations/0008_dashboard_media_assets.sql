-- ダッシュボード刷新（feat-dashboard-redesign / system-spec qa-089〜qa-099・appr-015）
-- ダッシュボードが「読む」表を、database 章の列定義に沿って用意する。
-- 書き込む処理（毎日収集・CSV取込・AI分析の受理・改善アクションの状態遷移）は上流 feature が作る。
-- 本 migration は読み取りに要る列だけを置き、上流 feature は ALTER TABLE ADD COLUMN で列を足して引き継ぐ。
-- 索引は主キーだけにする（索引の更新も D1 の書込行数に数えるため）。例外は media_assets の取り直し用索引（qa-098）。

-- 動画の基本情報（Data API videos.list 由来。30日で取り直す API データなので fetched_at を持つ・qa-035）
CREATE TABLE IF NOT EXISTS videos (
  tenant_id     TEXT NOT NULL REFERENCES tenants (tenant_id),
  video_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  published_at  TEXT NOT NULL,              -- UTC ISO8601
  content_type  TEXT NOT NULL DEFAULT 'long' CHECK (content_type IN ('shorts', 'long')),
  thumbnail_url TEXT,                        -- snippet.thumbnails の元 URL（表示には使わず R2 経由で配る・qa-095）
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

-- レポート版（追記のみ）
CREATE TABLE IF NOT EXISTS reports (
  tenant_id  TEXT NOT NULL REFERENCES tenants (tenant_id),
  report_id  TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  version    INTEGER NOT NULL,
  title      TEXT NOT NULL,
  conclusion TEXT,
  status     TEXT NOT NULL DEFAULT '完了' CHECK (status IN ('待機中', '実行中', '完了', '失敗')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, report_id)
);

CREATE TABLE IF NOT EXISTS findings (
  tenant_id  TEXT NOT NULL REFERENCES tenants (tenant_id),
  finding_id TEXT NOT NULL,
  report_id  TEXT NOT NULL,
  ordinal    INTEGER NOT NULL,
  claim      TEXT NOT NULL,
  PRIMARY KEY (tenant_id, finding_id)
);

-- 改善アクション（未着手→実施中→効果測定中→完了 の一方向。遷移 API は feat-web-screens-actions）
CREATE TABLE IF NOT EXISTS actions (
  tenant_id      TEXT NOT NULL REFERENCES tenants (tenant_id),
  action_id      TEXT NOT NULL,
  channel_id     TEXT NOT NULL,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('未着手', '実施中', '効果測定中', '完了')),
  metric_label   TEXT,
  baseline_value REAL,
  latest_value   REAL,
  unit           TEXT,
  started_at     TEXT,
  ends_at        TEXT,
  verdict        TEXT CHECK (verdict IS NULL OR verdict IN ('効果あり', '不明', '効果なし')),
  created_by     TEXT,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (tenant_id, action_id)
);

-- 画像（R2 のキーは tenants/<tenant_id>/…）。kind=thumbnail は asset_id を 'thumbnail:<video_id>' に固定し、
-- 動画1本につき1行にする。thumbnail 行は fetched_at（R2 へ保存した実時刻）と source_url を必須にする（qa-098）
CREATE TABLE IF NOT EXISTS media_assets (
  tenant_id    TEXT NOT NULL REFERENCES tenants (tenant_id),
  asset_id     TEXT NOT NULL,
  video_id     TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('thumbnail', 'scene', 'screenshot')),
  at_ms        INTEGER,
  r2_key       TEXT NOT NULL,
  content_type TEXT,
  width        INTEGER,
  height       INTEGER,
  bytes        INTEGER,
  source_url   TEXT,
  fetched_at   TEXT,
  PRIMARY KEY (tenant_id, asset_id),
  CHECK (kind <> 'thumbnail' OR (source_url IS NOT NULL AND fetched_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_media_assets_kind_fetched ON media_assets (tenant_id, kind, fetched_at);

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
