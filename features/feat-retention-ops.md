---
acceptance: ["fetched_at が30日を超えた行が翌日の cleanup 後に残らない", "データ削除の依頼から7日以内に D1 行と R2 画像が0件になる", "レポートがコメント本文を複製していない"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "confidence": 0.95, "candidate_path": "features/feat-retention-ops.md"}, {"artifact_kind": "issue", "confidence": 0.2, "candidate_path": "issues/feat-retention-ops.md"}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:dev-graph-integrity-auditor", "evidence_ref": "eval-log/dev-graph-decompose-audit-20260921.json", "evaluated_digest": "93222146ee6089f0c1ef0c6fcc62e9250c03338dfe9e49a328952d6fef7749b9"}
confirmation_status: "confirmed"
created_at: "2026-09-21T15:15:00Z"
depends_on: ["feat-youtube-daily-collection"]
domain: "youtube-analytics"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: null
file_path: "features/feat-retention-ops.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "毎日の cleanup で30日を超えた指標以外の API データと更新失敗の利用者の指標が消え、データ削除は7日以内に完了し、無料枠の使用率が80%で警告される"
graph_node_id: "feat-retention-ops"
implementation_readiness: {"status": "complete", "missing_sections": [], "checked_at": "2026-09-21T15:15:00Z"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "YouTube API 規約の保持期間・削除義務を自動で守り、無料枠を超えずに運用を続けられるようにする"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["cleanup 通の処理(fetched_at 30日超の削除・失敗した削除の再試行・30日超 token 更新失敗の指標削除)", "DELETE /api/me/data とテナント全体削除(即時実行+毎日再試行で7日以内)とアカウント削除", "runbook 7本(OAuth 再連携・無料枠超過・スキル更新・R2 逼迫・テナント別DB移行・割り当て確認・Reporting 60日欠損の CSV 補填)。『チャンネルを変更する』は feat-settings-channel-link"]
scope_out: ["収集処理本体(feat-youtube-daily-collection)", "設定画面の UI と無料枠メーター(/api/usage・usage_counters・GraphQL 取得・70%/90%警告)(feat-settings-channel-link)", "チャンネル解除予約の旧 imports と R2 原本の削除実行(feat-settings-channel-link で実装済み)", "有料プランへの移行"]
source_lineage: {"origin_kind": "generated", "source_plugin": "dev-graph", "source_path": "specs/youtube-analytics-system.md", "source_version": "1.0.0", "source_digest": "cd7db6eaf6be63b19ffc8bdd66d03c986abcc5473426f7762afc7dac9df8c486", "imported_at": "2026-09-21T15:15:00Z"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "保持・削除と運用監視"
tracker_binding: "beads"
updated_at: "2026-09-24T01:00:12Z"
---

# 目的

YouTube API 規約の保持期間・削除義務を自動で守り、無料枠を超えずに運用を続けられるようにする(資するゴール: G3, G4)

## 到達状態

毎日の cleanup で30日を超えた指標以外の API データと更新失敗の利用者の指標が消え、データ削除は7日以内に完了し、無料枠の使用率が80%で警告される

## スコープ

### 含む

- cleanup 通の処理(fetched_at 30日超の削除・失敗した削除の再試行・30日超 token 更新失敗の指標削除)
- DELETE /api/me/data とテナント全体削除(即時実行+毎日再試行で7日以内)とアカウント削除
- runbook 7本(OAuth 再連携・無料枠超過・スキル更新・R2 逼迫・テナント別DB移行・割り当て確認・Reporting 60日欠損の CSV 補填)。『チャンネルを変更する』は feat-settings-channel-link

### 含まない

- 収集処理本体(feat-youtube-daily-collection)
- 設定画面の UI と無料枠メーター(/api/usage・usage_counters・GraphQL 取得・70%/90%警告)(feat-settings-channel-link)
- チャンネル解除予約の旧 `imports` と R2 原本の削除実行(feat-settings-channel-link で実装済み)
- 有料プランへの移行

## 受入

- fetched_at が30日を超えた行が翌日の cleanup 後に残らない
- データ削除の依頼から7日以内に D1 行と R2 画像が0件になる
- レポートがコメント本文を複製していない

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/security.md, system-spec/infrastructure.md, system-spec/maintenance-ops.md, system-spec/database.md

## 機能間依存

- feat-youtube-daily-collection

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-retention-ops --feature-context features/feat-retention-ops.context.json` で生成する。本ノードは task を持たない。
