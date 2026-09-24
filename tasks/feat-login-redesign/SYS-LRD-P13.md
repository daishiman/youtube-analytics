---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-login-redesign/SYS-LRD-P13.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P13 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "29168572259f12bd579bfd638d8873c2d090a586c249d7502922bbf951df0cf7", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-login-redesign/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-24T01:18:10Z"
depends_on: ["SYS-LRD-P11", "SYS-LRD-P12"]
domain: "infrastructure"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-login-redesign"
file_path: "tasks/feat-login-redesign/SYS-LRD-P13.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-LRD-P13"
implementation_readiness: {"checked_at": "2026-09-24T01:14:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-login-redesign"
phase_ref: "P13"
priority: null
project_id: "feature-package-feat-login-redesign"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-login-redesign"]
resource_scope: [".github/workflows/", "wrangler.toml"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-24T01:18:10Z", "origin_kind": "system-dev-planner", "source_digest": "29168572259f12bd579bfd638d8873c2d090a586c249d7502922bbf951df0cf7", "source_path": ".dev-graph/published/feature-package-feat-login-redesign/task-specs/phase-13-release-deploy.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p13", "infrastructure", "login-redesign"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "リリースとデプロイ"
tracker_binding: "beads"
updated_at: "2026-09-24T01:18:10Z"
---

# SYS-LRD-P13 リリースとデプロイ

## Machine-readable registration fields

- task_id: SYS-LRD-P13
- phase_ref: P13
- feature_package_id: feature-package/feat-login-redesign
- parent_feature: feat-login-redesign
- workstream_kind: infrastructure
- build_target_kind: application-code
- depends_on: SYS-LRD-P11, SYS-LRD-P12

## 目的

PR の必須チェック(lint/test/e2e/dry-run)を通し、main への merge で D1 マイグレーション 0003 と deploy を完了させる。

## 背景

feat-login-redesign はログイン画面を docs/screens/01-login.png どおりに刷新し、表示する権限と要求スコープの一致・同意記録・部分許可時の継続・画面の防御を加える feature で、確定仕様 system-spec の auth/ui-ux/frontend/security/backend/database 章の qa-062〜qa-073 に根拠を持つ。土台は feat-platform-tenant-auth の実装(Google ログイン・テナント・招待・規約ページ)である。

## 前提条件

- 先行 task: SYS-LRD-P11, SYS-LRD-P12
- implementation_readiness: complete(completeness evaluator r3 PASS)

## Workstream applicability

- 主: infrastructure

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- 本番の D1 マイグレーション適用と deploy の実行記録
- Write scope: .github/workflows/, wrangler.toml

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- GitHub publication: local_only
- 完了: linked PR が default branch へ merge されたとき

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- ログイン試行の回数制限とそのためのテーブル・Cron(qa-071 で設けないと確定)
- Google OAuth の検証申請手続き(既存の『80人で検証申請』運用のまま)
- テナント作成・招待・役割の仕組みそのもの(feat-platform-tenant-auth で実装済みの土台を使う)
- YouTube データの収集処理(feat-youtube-daily-collection)
- ダッシュボード・設定画面の本体機能(feat-web-screens-actions。本 feature は再連携バナーの差し込みだけを持つ)
- レポート HTML の sandbox iframe 用ヘッダ(既存方針のまま)

## Verification and evidence

- 検証: Actions の実行ログで migrations apply と deploy の成功を確認
- 受入: main への push で D1 マイグレーション(consent_records・youtube_link_status)と deploy が完了する
- 受入: 本番のログイン画面が画像どおりに表示される

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 直前の Workers バージョンへ wrangler rollback し、マイグレーションは前方修正で戻す

## Handoff

- 次の task: なし(feature 完了。dev-graph sync で feature の完了を反映)

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/auth.md
- system-spec/ui-ux.md
- system-spec/frontend.md
- system-spec/security.md
- system-spec/backend.md
- system-spec/database.md
- docs/screens/01-login.png
- features/feat-login-redesign.context.json
