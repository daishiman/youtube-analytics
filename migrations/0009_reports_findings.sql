-- レポート版（reports + findings）。集約『レポート版』は追記のみで、過去の版を更新しない（database 章 DDD 不変条件）。
-- 版番号は tenant_id + channel_id ごとの連番。POST /api/skill/reports の Idempotency-Key（request_id + 版番号）で
-- 二重送信でも版を増やさない。
CREATE TABLE reports (
  tenant_id             TEXT NOT NULL REFERENCES tenants (tenant_id),
  report_id             TEXT NOT NULL,
  channel_id            TEXT NOT NULL,
  request_id            TEXT NOT NULL,
  version               INTEGER NOT NULL CHECK (version >= 1),
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL DEFAULT '',
  conclusion            TEXT NOT NULL,
  -- 改善候補あり | 全指標目標達成 | 判定保留
  outcome               TEXT NOT NULL CHECK (outcome IN ('改善候補あり', '全指標目標達成', '判定保留')),
  candidate_stage       TEXT,
  candidate_metric      TEXT,
  period_start          TEXT NOT NULL,
  period_end            TEXT NOT NULL,
  brief_json            TEXT NOT NULL,
  results_json          TEXT NOT NULL,
  history_review_json   TEXT NOT NULL,
  ideas_json            TEXT NOT NULL DEFAULT '[]',
  actions_json          TEXT NOT NULL DEFAULT '[]',
  history_versions_used TEXT NOT NULL DEFAULT '[]',
  report_html           TEXT NOT NULL CHECK (length(CAST(report_html AS BLOB)) <= 2000000),
  idempotency_key       TEXT NOT NULL,
  created_by            TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  PRIMARY KEY (tenant_id, report_id),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, channel_id, version)
);

-- 要因ごとの統計的事実と解釈を分けて持つ。仮説は反証条件と 採用|棄却|保留 の判定を持つ
CREATE TABLE findings (
  tenant_id      TEXT NOT NULL REFERENCES tenants (tenant_id),
  report_id      TEXT NOT NULL,
  finding_no     INTEGER NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('factor', 'hypothesis')),
  title          TEXT NOT NULL,
  fact           TEXT,
  interpretation TEXT,
  stage          TEXT,
  metric         TEXT,
  hypothesis_id  TEXT,
  falsifier      TEXT,
  verdict        TEXT CHECK (verdict IS NULL OR verdict IN ('採用', '棄却', '保留')),
  evidence_json  TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, report_id, finding_no)
);

-- 追記のみを DB でも守る（削除はチャンネル・テナント削除の掃除だけが行う）
CREATE TRIGGER reports_append_only BEFORE UPDATE ON reports
BEGIN
  SELECT RAISE(ABORT, 'reports are append-only');
END;
CREATE TRIGGER findings_append_only BEFORE UPDATE ON findings
BEGIN
  SELECT RAISE(ABORT, 'findings are append-only');
END;
