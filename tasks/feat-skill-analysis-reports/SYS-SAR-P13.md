---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-skill-analysis-reports/SYS-SAR-P13.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P13 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-skill-analysis-reports/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-25T00:09:44Z"
depends_on: ["SYS-SAR-P11", "SYS-SAR-P12"]
domain: "infrastructure"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-skill-analysis-reports"
file_path: "tasks/feat-skill-analysis-reports/SYS-SAR-P13.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-SAR-P13"
implementation_readiness: {"checked_at": "2026-09-25T00:30:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-skill-analysis-reports"
phase_ref: "P13"
priority: null
project_id: "feature-package-feat-skill-analysis-reports"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-skill-analysis-reports"]
resource_scope: [".github/workflows/", "wrangler.toml"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-25T00:09:44Z", "origin_kind": "system-dev-planner", "source_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "source_path": ".dev-graph/published/feature-package-feat-skill-analysis-reports/task-specs/phase-13-release-deploy.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p13", "infrastructure", "skill-analysis-reports"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "CI/CD とリリース"
tracker_binding: "beads"
updated_at: "2026-09-25T00:09:44Z"
---

# SYS-SAR-P13 CI/CD とリリース

## Machine-readable registration fields

- task_id: SYS-SAR-P13
- phase_ref: P13
- feature_package_id: feature-package/feat-skill-analysis-reports
- parent_feature: feat-skill-analysis-reports
- owners: daishiman / tags: p13, infrastructure, skill-analysis-reports / related_nodes: feat-skill-analysis-reports
- workstream_kind: infrastructure
- build_target_kind: application-code
- depends_on: SYS-SAR-P11, SYS-SAR-P12
- classification: confidence 0.95 / P13 phase slot への 1対1 写像 / tasks/feat-skill-analysis-reports/SYS-SAR-P13.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

追加マイグレーション5件の適用とWorkersデプロイをCIパイプラインに組み込み、mainへのpushでリリースが完了する状態にする。本featureのリリース対象は.claude/skills/yt-analyze/(request_id無し起動時の依頼作成クライアント分岐を含む)とlaunchd起動設定であり、本番launchctl bootstrap有効化はfeat-ai-analysis-screenがPOST /api/skill/requestsのエンドポイント本体を出荷した後の運用前提条件として release-condition に明記する。

## 背景

マイグレーションとデプロイの手動実行は取りこぼしのリスクがあるため、CIパイプラインに組み込み再現性を担保する。/yt-analyzeのrequest_id無し起動分岐はコードとしてはmainへの本featureのpushで既にデプロイされるが、呼び出し先のPOST /api/skill/requestsエンドポイント本体がAIA側で出荷されるまでは403/404で失敗する。launchdの本番有効化(launchctl bootstrap)はCIやdepends_onで機械的に強制せず、運用ドキュメント(P12 runbook)とrelease-conditionの記述だけで前提を伝える(feature間のDAG上の依存edgeは追加しない。AIAが既にSARへ依存しているため逆方向のedgeは循環を生む)。

## 前提条件

- 先行 task: SYS-SAR-P11, SYS-SAR-P12
- Required spec/architecture nodes: feat-skill-analysis-reports, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-skill-analysis-reports-20260925.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.14 / run-system-spec-compile / assign-system-spec-completeness-evaluator
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
- Compatibility/migration/backfill: CIでのマイグレーション適用は既存分を含めて順に適用する。適用対象はP08時点で確定したマイグレーション番号(計画時点の暫定番号は0011〜0015)とし、依存 feature(feat-youtube-daily-collection, feat-csv-media-ingest)のマイグレーションより後ろで、かつ下流 feature(feat-ai-analysis-screen)のマイグレーション(計画時点の暫定番号0008〜0010)より前の番号であることをCI実行前に確認する(実装着手時の再採番により実番号は入れ替わり得る)

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

- レポート閲覧画面と改善アクション画面(feat-web-screens-actions)
- アプリ内 LLM 呼出し
- 因果推論・予測
- トークン管理画面・トークン名・1人5本上限・GET/POST/DELETE /api/skill-tokens(feat-settings-channel-link)
- AI分析画面向けの依頼取消・再実行・進捗段階・POST /api/skill/requestsのエンドポイント本体(個人トークン検証・created_via='skill'付与・content.write喪失時403の判定はAIAのsrc/。本featureはこのエンドポイントをクライアントとして呼ぶ/yt-analyzeのrequest_id無し起動分岐だけを持つ)・アーカイブ版の履歴除外・画面からのJSON取込(feat-ai-analysis-screen)
- report-design-system スキル本体の改変(更新は .claude/report-design-system.ORIGIN.md の手順で取込元から丸ごと差し替える)と、同スキル対象外の重回帰・機械学習・生存分析
- feat-youtube-daily-collection・feat-csv-media-ingest が提供する週次集計・Studio CSV・事業実績・目標のテーブル/APIの新規作成(前提として存在する境界として扱う)

## Verification and evidence

- 検証: Actions の実行ログで migrations apply と deploy の成功を確認
- 検証: CI で空 DB からの全マイグレーション適用と、既存 DB への差分マイグレーション適用の両方を実行し、いずれも成功する
- 検証: plutil -lint ops/launchd/com.youtube-analytics.weekly-analysis.plist をデプロイ成果物に対して実行する
- 受入: main への push で、P08 時点で確定したマイグレーション番号(計画時点の暫定番号は0011〜0015)の適用と deploy が完了する
- 受入: CI の migration 適用が、空 DB からの全件適用と既存 DB への差分適用の両方で通る
- 受入: PR で lint/test が必須チェックになっている
- 受入: release-condition に、本番launchctl bootstrap有効化はfeat-ai-analysis-screenがPOST /api/skill/requestsのエンドポイント本体(SYS-AIA-P05のsrc/)を出荷した後の運用前提条件であることが明記されており、task-graph.json にはこの前提に対応するdepends_on/edgeが追加されていない(SAR→AIA方向のfeature間依存edgeは循環を生むため作らない)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 直前の Workers バージョンへ wrangler rollback し、マイグレーションは前方修正で戻す

## Handoff

- 次の task: なし(package 内最終 task)

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
