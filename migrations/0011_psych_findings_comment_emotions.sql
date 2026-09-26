-- 視聴者心理（推定）とコメント感情。どちらもレポート版の一部で追記のみ。コメント本文は持たず comment_id で参照する。
CREATE TABLE psych_findings (
  tenant_id          TEXT NOT NULL REFERENCES tenants (tenant_id),
  report_id          TEXT NOT NULL,
  finding_no         INTEGER NOT NULL,
  layer              TEXT NOT NULL CHECK (layer IN ('考え', '感情', '行動')),
  claim              TEXT NOT NULL,
  evidence_json      TEXT NOT NULL DEFAULT '[]',
  counter_hypothesis TEXT,
  confidence         REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  PRIMARY KEY (tenant_id, report_id, finding_no)
);

CREATE TABLE comment_emotions (
  tenant_id  TEXT NOT NULL REFERENCES tenants (tenant_id),
  report_id  TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  emotion    TEXT NOT NULL CHECK (emotion IN ('喜び', '信頼', '恐れ', '驚き', '悲しみ', '嫌悪', '怒り', '期待')),
  intent     TEXT CHECK (intent IS NULL OR intent IN ('質問', '共感', '反論', '体験談')),
  PRIMARY KEY (tenant_id, report_id, comment_id)
);

CREATE TRIGGER psych_findings_append_only BEFORE UPDATE ON psych_findings
BEGIN
  SELECT RAISE(ABORT, 'psych_findings are append-only');
END;
CREATE TRIGGER comment_emotions_append_only BEFORE UPDATE ON comment_emotions
BEGIN
  SELECT RAISE(ABORT, 'comment_emotions are append-only');
END;
