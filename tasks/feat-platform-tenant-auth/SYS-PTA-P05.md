---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-platform-tenant-auth/SYS-PTA-P05.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P05 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "6e46c44289a97833c3c2c07fe53f3de4232895bd5c8f332291a34706873bafd6", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-platform-tenant-auth/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-21T14:53:23Z"
depends_on: ["SYS-PTA-P04"]
domain: "backend"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-platform-tenant-auth"
file_path: "tasks/feat-platform-tenant-auth/SYS-PTA-P05.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-PTA-P05"
implementation_readiness: {"checked_at": "2026-09-21T14:52:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-platform-tenant-auth"
phase_ref: "P05"
priority: null
project_id: "feature-package-feat-platform-tenant-auth"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-platform-tenant-auth"]
resource_scope: ["src/", "migrations/0001_platform.sql", "public/privacy.html", "public/terms.html"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-21T14:53:23Z", "origin_kind": "system-dev-planner", "source_digest": "6e46c44289a97833c3c2c07fe53f3de4232895bd5c8f332291a34706873bafd6", "source_path": ".dev-graph/published/feature-package-feat-platform-tenant-auth/task-specs/phase-05-implementation.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p05", "backend", "platform-tenant-auth"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "基盤・ログイン・テナント・招待の実装"
tracker_binding: "beads"
updated_at: "2026-09-21T14:53:23Z"
---

# SYS-PTA-P05 基盤・ログイン・テナント・招待の実装

## Machine-readable registration fields

- task_id: SYS-PTA-P05
- phase_ref: P05
- feature_package_id: feature-package/feat-platform-tenant-auth
- parent_feature: feat-platform-tenant-auth
- workstream_kind: backend
- build_target_kind: application-code
- depends_on: SYS-PTA-P04

## 目的

D1 マイグレーション(users, tenants, tenant_members, tenant_invites, skill_tokens)、Google ログイン、セッション、初回テナント自動作成と上限停止、招待とメンバー管理、TenantContext、静的ページとログイン前同意を実装する。

## 背景

feat-platform-tenant-auth は後続5機能すべての前提(tenant_id と役割)を提供する ready feature であり、確定仕様 system-spec の auth/security/database/infrastructure 章に根拠を持つ。

## 前提条件

- 先行 task: SYS-PTA-P04
- implementation_readiness: complete(completeness evaluator PASS)

## Workstream applicability

- 主: backend
- Frontend: 静的ページとログイン画面の最小範囲のみ。業務画面は feat-web-screens-actions の範囲

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- src/ 配下の Hono ルートと usecase・repository
- migrations/0001_platform.sql
- public/privacy.html と public/terms.html
- Write scope: src/, migrations/0001_platform.sql, public/privacy.html, public/terms.html

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- GitHub publication: local_only
- 完了: linked PR が default branch へ merge されたとき

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- YouTube API の読取連携と収集(feat-youtube-daily-collection)
- CSV・字幕・画像の取込(feat-csv-media-ingest)
- Claude Code 連携API とレポート(feat-skill-analysis-reports)
- ダッシュボード等の業務画面(feat-web-screens-actions)
- 保持期間の掃除と無料枠メーター(feat-retention-ops)

## Verification and evidence

- 検証: npm test
- 検証: npx wrangler d1 migrations apply DB --local
- 受入: P04 のテストがすべて通る
- 受入: 全 usecase の入口で TenantContext による役割検査が行われる

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 機能ブランチの revert とローカル D1 の再作成

## Handoff

- 次の task: SYS-PTA-P06

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/infrastructure.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- features/feat-platform-tenant-auth.context.json
