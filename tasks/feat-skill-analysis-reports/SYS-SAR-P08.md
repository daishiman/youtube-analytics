---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-skill-analysis-reports/SYS-SAR-P08.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P08 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-skill-analysis-reports/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-25T00:09:44Z"
depends_on: ["SYS-SAR-P07"]
domain: "data"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-skill-analysis-reports"
file_path: "tasks/feat-skill-analysis-reports/SYS-SAR-P08.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-SAR-P08"
implementation_readiness: {"checked_at": "2026-09-25T00:30:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-skill-analysis-reports"
phase_ref: "P08"
priority: null
project_id: "feature-package-feat-skill-analysis-reports"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-skill-analysis-reports"]
resource_scope: ["src/", "migrations/"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-25T00:09:44Z", "origin_kind": "system-dev-planner", "source_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "source_path": ".dev-graph/published/feature-package-feat-skill-analysis-reports/task-specs/phase-08-refactoring-migration.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p08", "data", "skill-analysis-reports"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "共通化の整理とマイグレーション整理"
tracker_binding: "beads"
updated_at: "2026-09-25T00:09:44Z"
---

# SYS-SAR-P08 共通化の整理とマイグレーション整理

## Machine-readable registration fields

- task_id: SYS-SAR-P08
- phase_ref: P08
- feature_package_id: feature-package/feat-skill-analysis-reports
- parent_feature: feat-skill-analysis-reports
- owners: daishiman / tags: p08, data, skill-analysis-reports / related_nodes: feat-skill-analysis-reports
- workstream_kind: data
- build_target_kind: application-code
- depends_on: SYS-SAR-P07
- classification: confidence 0.95 / P08 phase slot への 1対1 写像 / tasks/feat-skill-analysis-reports/SYS-SAR-P08.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

実装で生じた重複・仮実装をリファクタリングし、追加マイグレーション5件を最終形へ整理したうえで、P06のテストが引き続き green であることを確認する。

## 背景

実装フェーズでは速度優先で重複コードやマイグレーションの仮置きが生じやすいため、リリース前に整理し保守性を確保する。AIA(feat-ai-analysis-screen)は本featureが作るanalysis_requests/reports/actionsのマイグレーションより後ろの番号で自身のALTERマイグレーションを適用する前提であるため、番号確定はAIA側の番号帯とも衝突しないことを確認する。

## 前提条件

- 先行 task: SYS-SAR-P07
- Required spec/architecture nodes: feat-skill-analysis-reports, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-skill-analysis-reports-20260925.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.14 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json


## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: 副。重複コードの整理
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: 主。追加マイグレーション5件の整理
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: 追加マイグレーションの整理は空DBへの適用順序を変えない範囲に限る。P05で採番したマイグレーション番号(計画時点の暫定番号は0011〜0015)は、依存 feature(feat-youtube-daily-collection, feat-csv-media-ingest)側の番号帯および下流 feature(feat-ai-analysis-screen)が本featureの番号より後ろを前提にしている点と衝突していないかを本taskで再確認し、衝突があればP05の確定規則(依存 feature(feat-youtube-daily-collection、feat-csv-media-ingest)の計画後に確定する暫定番号。実装着手時に origin/main と依存 feature 作業ブランチの migrations/ を再走査し最大番号+1 から連番で採番し直し、renumber の記録を残す)に従って付け替える

## 成果物

- 整理後の src/, migrations/(P05で確定したマイグレーション番号。計画時点の暫定番号は0011〜0015)
- マイグレーション番号の衝突検査結果: 衝突があれば eval-log/renumber-receipt-feat-skill-analysis-reports-実施日.json に記録する
- Consumed artifacts: P07 の受入結果
- Write scope: src/, migrations/

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- Publication mode: local_only
- Project aliases / labels / milestone: N/A: GitHub 投影を行わない
- PR completion policy: linked_pr_merged_all(linked PR が default branch へ merge されたとき完了)

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- レポート閲覧画面と改善アクション画面(feat-web-screens-actions)
- アプリ内 LLM 呼出し
- 因果推論・予測
- トークン管理画面・トークン名・1人5本上限・GET/POST/DELETE /api/skill-tokens(feat-settings-channel-link)
- AI分析画面向けの依頼取消・再実行・進捗段階・POST /api/skill/requestsのエンドポイント本体(個人トークン検証・created_via='skill'付与・content.write喪失時403の判定はAIAのsrc/。本featureはこのエンドポイントをクライアントとして呼ぶ/yt-analyzeのrequest_id無し起動分岐だけを持つ)・アーカイブ版の履歴除外・画面からのJSON取込(feat-ai-analysis-screen)
- report-design-system スキル本体の改変(更新は .claude/report-design-system.ORIGIN.md の手順で取込元から丸ごと差し替える)と、同スキル対象外の重回帰・機械学習・生存分析
- feat-youtube-daily-collection・feat-csv-media-ingest が提供する週次集計・Studio CSV・事業実績・目標のテーブル/APIの新規作成(前提として存在する境界として扱う)

## Verification and evidence

- 検証: pnpm test
- 検証: npx wrangler d1 migrations apply DB --local を空 DB で実行
- 受入: 振る舞い変更0件(P06 のテストが引き続き green)
- 受入: 空の D1 へ、その時点で確定しているマイグレーション番号(計画時点の暫定番号は0011〜0015)が順に成功する
- 受入: 番号の重複検査を実行し、衝突がない、または衝突を付け替えて eval-log/renumber-receipt-feat-skill-analysis-reports-実施日.json に記録済みである

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 整理コミットを revert する

## Handoff

- 次の task: SYS-SAR-P09

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/backend.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- architecture/youtube-analytics-system.md
- specs/youtube-analytics-system.md
- docs/analysis/dashboard-analysis-catalog.md
- .claude/skills/report-design-system/SKILL.md
- .claude/report-design-system.ORIGIN.md
- features/feat-skill-analysis-reports.context.json
