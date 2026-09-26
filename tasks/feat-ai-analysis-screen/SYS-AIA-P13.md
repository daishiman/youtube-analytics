---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-ai-analysis-screen/SYS-AIA-P13.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P13 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "0c0bad66583d733a2d8f79c4587656e2ba5a4bc0f03093cb72b4ccdb68b12894", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-ai-analysis-screen/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-24T15:54:55Z"
depends_on: ["SYS-AIA-P11", "SYS-AIA-P12"]
domain: "infrastructure"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-ai-analysis-screen"
file_path: "tasks/feat-ai-analysis-screen/SYS-AIA-P13.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-AIA-P13"
implementation_readiness: {"checked_at": "2026-09-25T00:30:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-ai-analysis-screen"
phase_ref: "P13"
priority: null
project_id: "feature-package-feat-ai-analysis-screen"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-ai-analysis-screen"]
resource_scope: [".github/workflows/", "wrangler.toml"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-24T15:54:55Z", "origin_kind": "system-dev-planner", "source_digest": "0c0bad66583d733a2d8f79c4587656e2ba5a4bc0f03093cb72b4ccdb68b12894", "source_path": ".dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-13-release-deploy.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p13", "infrastructure", "ai-analysis-screen"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "CI/CD とリリース"
tracker_binding: "beads"
updated_at: "2026-09-24T15:54:55Z"
---

# SYS-AIA-P13 CI/CD とリリース

## Machine-readable registration fields

- task_id: SYS-AIA-P13
- phase_ref: P13
- feature_package_id: feature-package/feat-ai-analysis-screen
- parent_feature: feat-ai-analysis-screen
- owners: daishiman / tags: p13, infrastructure, ai-analysis-screen / related_nodes: feat-ai-analysis-screen
- workstream_kind: infrastructure
- build_target_kind: application-code
- depends_on: SYS-AIA-P11, SYS-AIA-P12
- classification: confidence 0.95 / P13 phase slot への 1対1 写像 / tasks/feat-ai-analysis-screen/SYS-AIA-P13.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

追加マイグレーションの適用とWorkersデプロイをCIパイプラインに組み込み、mainへのpushでリリースが完了する状態にする。

## 背景

マイグレーションとデプロイの手動実行は取りこぼしのリスクがあるため、CIパイプラインに組み込み再現性を担保する。

## 前提条件

- 先行 task: SYS-AIA-P11, SYS-AIA-P12
- Required spec/architecture nodes: feat-ai-analysis-screen, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-ai-analysis-screen-20260924.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: N/A: 本 phase の成果物は Backend の変更を含まない
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: N/A: 本 phase の成果物は Data の変更を含まない
- Infrastructure: 主。マイグレーション適用とWorkersデプロイのCI組込み
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: 副。デプロイ後の確認手順

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: CI でのマイグレーション適用は既存分を含めて順に適用する。適用対象は P08 時点で確定したマイグレーション番号(計画時点の暫定番号は0008〜0010)とし、依存 feature(feat-skill-analysis-reports, feat-web-screens-actions)が作る analysis_requests / reports / actions のマイグレーションより後ろの番号であることを CI 実行前に確認する

## 成果物

- .github/workflows/ の deploy定義
- wrangler.toml の更新
- Consumed artifacts: P11・P12 の成果物
- Write scope: .github/workflows/, wrangler.toml

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

- 検証: Actions の実行ログで migrations apply と deploy の成功を確認
- 検証: CI で空 DB からの全マイグレーション適用と、既存 DB への差分マイグレーション適用の両方を実行し、いずれも成功する
- 受入: main への push で、P08 時点で確定したマイグレーション番号(計画時点の暫定番号は0008〜0010)の適用と deploy が完了する
- 受入: CI の migration 適用が、空 DB からの全件適用と既存 DB への差分適用の両方で通る
- 受入: PR で lint/test/E2E が必須チェックになっている

## Rollout and rollback

- Rollout: main へ merge された PR を CI が検知し、マイグレーション適用(本番)とデプロイを自動実行する
- Rollback: 直前の Workers バージョンへ wrangler rollback し、マイグレーションは前方修正で戻す

## Handoff

- 次の task: なし(package 内最終 task)

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
