-- レポート版のアーカイブ（正本 database 章 qa-094・feat-ai-analysis-screen。暫定番号 0009 から振り直し）。
-- reports は append-only（更新トリガで拒否）なので、アーカイブは別表の行の有無で表す。
-- 解除は行の削除。一覧・スキルの分析履歴（analysis_history）はここにある版を除く。
CREATE TABLE report_archives (
  tenant_id   TEXT NOT NULL REFERENCES tenants (tenant_id),
  report_id   TEXT NOT NULL,
  archived_by TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, report_id)
);
