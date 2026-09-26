-- AI分析画面の依頼拡張（正本 database 章 qa-093〜qa-095・feat-ai-analysis-screen）。
-- 仕様上の暫定番号 0008 は feat-skill-analysis-reports が先に使ったため 0013 へ振り直した
-- （eval-log/renumber-receipt-feat-ai-analysis-screen-20260925.json）。
-- 状態に終端の「取消」を加え、取消者・再実行元・作成経路（web/skill/import）を持たせる。
-- SQLite は CHECK を ALTER で変えられないため、表を作り直して既存行を写す。
CREATE TABLE analysis_requests_new (
  tenant_id    TEXT NOT NULL REFERENCES tenants (tenant_id),
  request_id   TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  instruction  TEXT NOT NULL DEFAULT '' CHECK (length(instruction) <= 1000),
  status       TEXT NOT NULL DEFAULT '待機中' CHECK (status IN ('待機中', '実行中', '完了', '失敗', '取消')),
  progress     INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage        INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 3),
  error        TEXT,
  report_id    TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT,
  retry_of     TEXT,
  canceled_at  TEXT,
  canceled_by  TEXT,
  created_via  TEXT NOT NULL DEFAULT 'web' CHECK (created_via IN ('web', 'skill', 'import')),
  PRIMARY KEY (tenant_id, request_id)
);
INSERT INTO analysis_requests_new (
  tenant_id, request_id, channel_id, period_start, period_end, instruction, status, progress,
  stage, error, report_id, created_by, created_at, updated_at, started_at, finished_at)
SELECT tenant_id, request_id, channel_id, period_start, period_end, instruction, status, progress,
  stage, error, report_id, created_by, created_at, updated_at, started_at, finished_at
FROM analysis_requests;
DROP TABLE analysis_requests;
ALTER TABLE analysis_requests_new RENAME TO analysis_requests;
CREATE INDEX idx_analysis_requests_tenant_created ON analysis_requests (tenant_id, created_at);
