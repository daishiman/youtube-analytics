-- レポートから選んで登録したアクションの出所（正本 database 章 qa-095・feat-ai-analysis-screen。暫定番号 0010 から振り直し）。
-- source_key はレポート JSON の actions 配列の位置（a1, a2, …）。同じ版・同じキーの二重登録を一意索引で防ぐ。
ALTER TABLE actions ADD COLUMN source_report_id TEXT;
ALTER TABLE actions ADD COLUMN source_key TEXT;
CREATE UNIQUE INDEX idx_actions_source ON actions (tenant_id, source_report_id, source_key);
