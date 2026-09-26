-- M1で使う平均視聴率の出典を、日次視聴回数の出典と別に保持する。
ALTER TABLE video_daily_metrics ADD COLUMN average_view_percentage_csv_import_id TEXT;
