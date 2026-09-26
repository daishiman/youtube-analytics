-- 改善アクション（集約『改善アクション』）。レポート版とは別集約で、状態は 未着手→実施中→効果測定中→完了 の一方向。
-- 状態遷移と判定の更新は feat-web-screens-actions が持つ。本 feature は登録（baseline 付き）だけを行う。
CREATE TABLE actions (
  tenant_id      TEXT NOT NULL REFERENCES tenants (tenant_id),
  action_id      TEXT NOT NULL,
  channel_id     TEXT NOT NULL,
  report_id      TEXT NOT NULL,
  title          TEXT NOT NULL,
  stage          TEXT NOT NULL CHECK (stage IN ('露出', '流入', '維持', '導線', '成約')),
  metric         TEXT NOT NULL CHECK (metric IN ('impressions', 'ctr', 'm1', 'lead_route_rate', 'inquiry_close_rate')),
  baseline_value REAL,
  target_value   REAL,
  result_value   REAL,
  status         TEXT NOT NULL DEFAULT '未着手' CHECK (status IN ('未着手', '実施中', '効果測定中', '完了')),
  judgement      TEXT CHECK (judgement IS NULL OR judgement IN ('効果あり', '不明', '効果なし')),
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (tenant_id, action_id)
);
CREATE INDEX idx_actions_tenant_channel ON actions (tenant_id, channel_id, created_at);
