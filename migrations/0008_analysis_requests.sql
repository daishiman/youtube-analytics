-- AI分析の依頼（正本 database 章 qa-089〜qa-092・feat-skill-analysis-reports）。
-- request_id はテナント内連番の 'A-0001' 形式で、主キーは (tenant_id, request_id)。
-- 状態は 待機中 → 実行中 → 完了|失敗 の一方向だけ（取消・created_via は feat-ai-analysis-screen で追加する）。
CREATE TABLE analysis_requests (
  tenant_id    TEXT NOT NULL REFERENCES tenants (tenant_id),
  request_id   TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  instruction  TEXT NOT NULL DEFAULT '' CHECK (length(instruction) <= 1000),
  status       TEXT NOT NULL DEFAULT '待機中' CHECK (status IN ('待機中', '実行中', '完了', '失敗')),
  progress     INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage        INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 3),
  error        TEXT,
  report_id    TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT,
  PRIMARY KEY (tenant_id, request_id)
);
CREATE INDEX idx_analysis_requests_tenant_created ON analysis_requests (tenant_id, created_at);
