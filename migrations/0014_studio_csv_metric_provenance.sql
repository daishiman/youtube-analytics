-- 日次 Studio CSV は列ごとに部分取込される。各値の出典を個別に保持する。
-- csv_import_id は従来どおり、その行に最後に適用した取込を示す。
ALTER TABLE video_daily_metrics ADD COLUMN views_csv_import_id TEXT;
ALTER TABLE video_daily_metrics ADD COLUMN engaged_views_csv_import_id TEXT;

ALTER TABLE channel_daily_metrics ADD COLUMN views_csv_import_id TEXT;
ALTER TABLE channel_daily_metrics ADD COLUMN engaged_views_csv_import_id TEXT;
