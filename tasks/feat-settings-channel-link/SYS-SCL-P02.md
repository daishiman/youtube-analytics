---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-settings-channel-link/SYS-SCL-P02.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P02 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "b99f16a19d6b011e9af0228340cc1112273911b4f51180dbad5a1f5b16c529b8", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-settings-channel-link/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-24T01:20:21Z"
depends_on: ["SYS-SCL-P01"]
domain: "api"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-settings-channel-link"
file_path: "tasks/feat-settings-channel-link/SYS-SCL-P02.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-SCL-P02"
implementation_readiness: {"checked_at": "2026-09-24T01:20:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-settings-channel-link"
phase_ref: "P02"
priority: null
project_id: "feature-package-feat-settings-channel-link"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-settings-channel-link"]
resource_scope: ["docs/feat-settings-channel-link/architecture.md"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-24T01:20:21Z", "origin_kind": "system-dev-planner", "source_digest": "b99f16a19d6b011e9af0228340cc1112273911b4f51180dbad5a1f5b16c529b8", "source_path": ".dev-graph/published/feature-package-feat-settings-channel-link/task-specs/phase-02-architecture.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p02", "api", "settings-channel-link"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "AppShell・設定API・channels データモデルの設計"
tracker_binding: "beads"
updated_at: "2026-09-24T01:20:21Z"
---

# SYS-SCL-P02 AppShell・設定API・channels データモデルの設計

## Machine-readable registration fields

- task_id: SYS-SCL-P02
- phase_ref: P02
- feature_package_id: feature-package/feat-settings-channel-link
- parent_feature: feat-settings-channel-link
- owners: daishiman / tags: p02, api, settings-channel-link / related_nodes: feat-settings-channel-link
- workstream_kind: api
- build_target_kind: application-code
- depends_on: SYS-SCL-P01
- classification: confidence 0.95 / P02 phase slot への 1対1 写像 / tasks/feat-settings-channel-link/SYS-SCL-P02.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

AppShell(Sidebar/Header/main/Footer)と共通部品8種の境界、GET /api/settings・YouTube 紐付け系・captions-auto・imports・skill-tokens・usage の API 契約、channels(UNIQUE tenant_id/UNIQUE channel_id)・oauth_pending・skill_tokens.name・usage_counters・usage_snapshots・audit_log のマイグレーション設計を決める。

## 背景

feat-settings-channel-link は、設定画面(docs/screens/05-settings.png)を画像どおりに実装し、1テナント1チャンネルの YouTube 紐付けと共通レイアウト AppShell を全画面へ提供する feature である。根拠は確定仕様 system-spec の qa-074〜qa-086(ui-ux/frontend/backend/auth/security/database/maintenance-ops 章)にあり、配色は web/styles.css の既存 CSS 変数だけを使う(qa-080)。

## 前提条件

- 先行 task: SYS-SCL-P01
- Required spec/architecture nodes: feat-settings-channel-link, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(completeness evaluator PASS: eval-log/completeness-findings-20260924-r3.json)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: 副。AppShell・設定API・channels データモデルの設計のうち Frontend に関わる部分
- Backend: 副。AppShell・設定API・channels データモデルの設計のうち Backend に関わる部分
- API: 主。AppShell(Sidebar/Header/main/Footer)と共通部品8種の境界、GET /api/settings・YouTube 紐付け系・captions-auto・imports・skill-tokens・usage の API 契約、channels(UNIQUE tenant_id/UNIQUE channel_id)・oauth_pending・skill_tokens.name・usage_counters・usage_snapshots・audit_log のマイグレーション設計を決める。
- Data: 副。AppShell・設定API・channels データモデルの設計のうち Data に関わる部分
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: documentation
- Compatibility/migration/backfill: N/A: 本 phase はスキーマを変更しない

## 成果物

- docs/feat-settings-channel-link/architecture.md(部品境界・API契約・テーブル定義・状態遷移: 未連携→正常→要再連携→解除)
- Consumed artifacts: features/feat-settings-channel-link.context.json, 先行 task の成果物
- Write scope: docs/feat-settings-channel-link/architecture.md

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- Publication mode: local_only
- Project aliases / labels / milestone: N/A: GitHub 投影を行わない
- PR completion policy: linked_pr_merged_all(linked PR が default branch へ merge されたとき完了)

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- 日次収集ジョブ本体と refresh token の暗号化保存・更新(feat-youtube-daily-collection)
- CSV/字幕/画像の解析・正規化・保存処理(feat-csv-media-ingest)
- 個人トークンの検証とスキル連携 API(feat-skill-analysis-reports)
- テナント・メンバー・招待のサーバ処理(feat-platform-tenant-auth)
- データ削除・cleanup の実行処理(feat-retention-ops)
- ダッシュボード/動画/AI分析/改善アクション画面の中身(feat-web-screens-actions)
- 1テナントで複数チャンネルを同時に紐付けること
- 画像の配色の採用と新しい色トークンの追加

## Verification and evidence

- 検証: architecture.md の API 一覧が scope_in の API と過不足なく一致することを確認
- 受入: 全 API がテナントスコープの repository 経由で tenant_id を必須引数に取る設計になっている
- 受入: 共通部品の色指定が既存 CSS 変数名だけで記述されている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: architecture.md を直前版へ戻す

## Handoff

- 次の task: SYS-SCL-P03

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/ui-ux.md
- system-spec/frontend.md
- system-spec/backend.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- architecture/youtube-analytics-system.md
- specs/youtube-analytics-system.md
- docs/screens/05-settings.png
- features/feat-settings-channel-link.context.json
