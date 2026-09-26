---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-dashboard-redesign/sys-dbr-p08.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P08 phase slot への1対1写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-dashboard-redesign-r2/plan-findings.json", "evaluated_digest": "8753a49bb769c2bee8d85a0f15d801e6f97b49ed86837558895cbe090f08ab1d"}
confirmation_status: "confirmed"
created_at: "2026-09-24T10:58:07Z"
depends_on: ["SYS-DBR-P07"]
domain: "data"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-dashboard-redesign"
file_path: "tasks/feat-dashboard-redesign/sys-dbr-p08.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-DBR-P08"
implementation_readiness: {"status": "complete", "missing_sections": [], "checked_at": "2026-09-24T14:50:00Z"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-dashboard-redesign"
phase_ref: "P08"
priority: null
project_id: "feature-package-feat-dashboard-redesign"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-dashboard-redesign"]
resource_scope: ["src/", "web/", "migrations/", "scripts/seed-local.sql"]
scope_in: []
scope_out: []
source_lineage: {"origin_kind": "system-dev-planner", "source_plugin": "system-dev-planner", "source_path": ".dev-graph/published/feature-package-feat-dashboard-redesign-r2/task-specs/phase-08-refactoring-migration.md", "source_version": "0.1.0", "source_digest": "8753a49bb769c2bee8d85a0f15d801e6f97b49ed86837558895cbe090f08ab1d", "imported_at": "2026-09-24T15:08:34Z"}
start_date: null
status: "active"
tags: ["p08", "data", "dashboard-redesign"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "重複ロジックの整理とマイグレーション健全性確認"
tracker_binding: "beads"
updated_at: "2026-09-24T15:08:34Z"
---

# SYS-DBR-P08 重複ロジックの整理とマイグレーション健全性確認

## Machine-readable registration fields

- task_id: SYS-DBR-P08
- phase_ref: P08
- feature_package_id: feature-package/feat-dashboard-redesign
- parent_feature: feat-dashboard-redesign
- workstream_kind: data
- build_target_kind: application-code
- depends_on: SYS-DBR-P07

## 目的

重複した集計クエリ・空状態文言の定義を1か所へ寄せ、migrations/0016_dashboard_media_assets.sql が空の D1 と scripts/seed-local.sql 投入済みの既存データのある D1 の両方で通ること、CREATE TABLE IF NOT EXISTS が上流feature(feat-youtube-daily-collection・feat-csv-media-ingest・feat-skill-analysis-reports・feat-web-screens-actions)による将来の ALTER TABLE 列追加を妨げない設計であることを確認する。

## 背景

feat-dashboard-redesign はダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が『今週、何が効いたか』と次に打つ手をすぐ判断できるようにする feature で、確定仕様 system-spec の ui-ux/frontend/backend/security/database/infrastructure 章の qa-099〜qa-109 に根拠を持つ(qa-099〜qa-108 は id-renumber-for-merge receipt(eval-log/renumber-receipt-feat-dashboard-redesign-20260924.json)により旧 qa-074〜qa-083 から繰り上げ、qa-109 は期間切替を全画面共通の AppShell ヘッダー `?period=` へ統一する新規決定、appr-013 は appr-017 へ繰り上げ)。feat-settings-channel-link(AppShell・共通ヘッダー・PageHeader/SectionCard/StatusBadge/DataTable の土台)に依存し、本 feature はヘッダーの PERIODS に 7d を足すだけで土台は作り直さない。現状の web/pages/DashboardPage.tsx は仮画面であり、集約API・ファネルAPI・サムネイル配信API・daily_metrics/video_metrics/reports/actions の読み取りはまだ実装されていない。ダッシュボードが読む videos/daily_metrics/video_metrics/video_reach_daily/video_daily_metrics/reports/findings/actions/media_assets/business_funnel_weekly/funnel_targets は上流feature(feat-youtube-daily-collection・feat-csv-media-ingest・feat-skill-analysis-reports・feat-web-screens-actions)が未実装のため現リポジトリに存在せず、本featureのmigrations/0016_dashboard_media_assets.sqlでsystem-spec database章の列定義に沿って読み取りに必要な列だけをCREATE TABLE IF NOT EXISTSし、media_assetsにはfetched_at・source_urlと(tenant_id, kind, fetched_at)索引を持たせる。上流featureは後でこの表を引き継ぎALTERで列を足す想定で、本featureは書込み(収集・CSV取込・レポート生成・アクション状態遷移)を作らない。

## 前提条件

- 先行 task: SYS-DBR-P07
- implementation_readiness: complete(completeness evaluator r8 PASS)

## Workstream applicability

- 主: data

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- 整理コミット
- Write scope: src/, web/, migrations/, scripts/seed-local.sql

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- GitHub publication: local_only
- 完了: linked PR が default branch へ merge されたとき

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- YouTube データの収集処理と収集時刻の変更(feat-youtube-daily-collection。確定済みの毎日 JST 3:00 のまま)
- Studio CSV・週次事業 CSV の取込処理(feat-csv-media-ingest。ダッシュボードは取込ボタンから既存の取込画面へ遷移するだけ)
- AI 分析レポートの生成とアップロード(feat-skill-analysis-reports)
- 動画画面・AI分析画面・改善アクション画面・設定画面の本体と actions の状態遷移 API(feat-web-screens-actions)
- 画像のティール配色(qa-101 で既存インディゴ/マゼンタを維持と確定)
- YouTube の画像ホスト(i.ytimg.com)からの直接表示と CSP の拡張(qa-105 で自サイト経由と確定)
- AppShell・共通ヘッダーの土台と共通部品 PageHeader/SectionCard/StatusBadge/DataTable の新規実装(feat-settings-channel-link で確立済み。本 feature はヘッダーの PERIODS に 7d を足すだけ、qa-109)

## Verification and evidence

- 検証: pnpm test
- 検証: pnpm db:migrate:local を空DBとscripts/seed-local.sql投入済みDBの両方で実行
- 受入: 振る舞い変更0件(P06のテストが引き続きgreen)
- 受入: 空のD1と既存D1の両方へmigrations/0016_dashboard_media_assets.sqlが成功する(acc-12,acc-13)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 整理コミットをrevertする

## Handoff

- 次の task: SYS-DBR-P09

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/ui-ux.md
- system-spec/frontend.md
- system-spec/backend.md
- system-spec/security.md
- system-spec/database.md
- system-spec/infrastructure.md
- architecture/youtube-analytics-system.md
- specs/youtube-analytics-system.md
- docs/screens/02-dashboard.png
- features/feat-dashboard-redesign.context.json
