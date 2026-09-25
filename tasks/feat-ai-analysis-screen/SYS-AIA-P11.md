---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-ai-analysis-screen/SYS-AIA-P11.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P11 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "0c0bad66583d733a2d8f79c4587656e2ba5a4bc0f03093cb72b4ccdb68b12894", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-ai-analysis-screen/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-24T15:54:55Z"
depends_on: ["SYS-AIA-P10"]
domain: "documentation"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-ai-analysis-screen"
file_path: "tasks/feat-ai-analysis-screen/SYS-AIA-P11.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-AIA-P11"
implementation_readiness: {"checked_at": "2026-09-25T00:30:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-ai-analysis-screen"
phase_ref: "P11"
priority: null
project_id: "feature-package-feat-ai-analysis-screen"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-ai-analysis-screen"]
resource_scope: ["evidence/feat-ai-analysis-screen/"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-24T15:54:55Z", "origin_kind": "system-dev-planner", "source_digest": "0c0bad66583d733a2d8f79c4587656e2ba5a4bc0f03093cb72b4ccdb68b12894", "source_path": ".dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-11-evidence.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p11", "documentation", "ai-analysis-screen"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "証跡の集約"
tracker_binding: "beads"
updated_at: "2026-09-24T15:54:55Z"
---

# SYS-AIA-P11 証跡の集約

## Machine-readable registration fields

- task_id: SYS-AIA-P11
- phase_ref: P11
- feature_package_id: feature-package/feat-ai-analysis-screen
- parent_feature: feat-ai-analysis-screen
- owners: daishiman / tags: p11, documentation, ai-analysis-screen / related_nodes: feat-ai-analysis-screen
- workstream_kind: documentation
- build_target_kind: application-code
- depends_on: SYS-AIA-P10
- classification: confidence 0.95 / P11 phase slot への 1対1 写像 / tasks/feat-ai-analysis-screen/SYS-AIA-P11.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

acceptance 13項目それぞれに対応する実行証跡(テスト結果・スクリーンショット・ログ)を evidence/feat-ai-analysis-screen/ に集約し、索引を作る。

## 背景

完了判定の根拠を後から追跡できるように、受入項目ごとの実行証跡を1か所に集約する。

## 前提条件

- 先行 task: SYS-AIA-P10
- Required spec/architecture nodes: feat-ai-analysis-screen, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-ai-analysis-screen-20260924.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: N/A: 本 phase の成果物は Backend の変更を含まない
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: N/A: 本 phase の成果物は Data の変更を含まない
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: 主。acceptance 13項目の実行証跡集約
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: documentation
- Compatibility/migration/backfill: N/A: 本 phase の成果物はスキーマ互換性に影響しない

## 成果物

- evidence/feat-ai-analysis-screen/index.json
- evidence/feat-ai-analysis-screen/ 配下の証跡ファイル
- Consumed artifacts: P07〜P10 の成果物
- Write scope: evidence/feat-ai-analysis-screen/

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- Publication mode: local_only
- Project aliases / labels / milestone: N/A: GitHub 投影を行わない
- PR completion policy: linked_pr_merged_all(linked PR が default branch へ merge されたとき完了)

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- 個人トークンの検証・スキル連携のエクスポート/レポート取込本体と履歴射影本体・週次自動実行の設定(基盤feature)
- 改善アクション画面と改善アクション集約の状態遷移・詳細API(改善アクションfeature)
- 共通レイアウトと既存共通部品の作成・設定画面の機能(共通レイアウトfeature)
- テナント別 OAuth クライアントの実装設計の見直し
- アプリ内 LLM 呼出し・因果推論・Web からの Claude Code 実行の停止(取消は以後の送信拒否だけ)
- 画像の配色の採用と新しい色トークンの追加、全文検索索引の作成

## Verification and evidence

- 検証: index.json の全参照先ファイルが実在することを確認
- 受入: 受入13項目すべてに証跡がある

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: index.json を直前版へ戻す

## Handoff

- 次の task: SYS-AIA-P13

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
- docs/analysis/dashboard-analysis-catalog.md
- docs/screens/03-ai-analysis.png
- features/feat-ai-analysis-screen.context.json
