# SYS-PTA-P12 運用手順とドキュメント

## Machine-readable registration fields

- task_id: SYS-PTA-P12
- phase_ref: P12
- feature_package_id: feature-package/feat-platform-tenant-auth
- parent_feature: feat-platform-tenant-auth
- workstream_kind: operations
- build_target_kind: application-code
- depends_on: SYS-PTA-P10

## 目的

Google OAuth クライアントの設定手順、Workers Secrets の登録手順、MAX_TENANTS の変更方法、招待の取消と退会の運用を記述する。

## 背景

feat-platform-tenant-auth は後続5機能すべての前提(tenant_id と役割)を提供する ready feature であり、確定仕様 system-spec の auth/security/database/infrastructure 章に根拠を持つ。

## 前提条件

- 先行 task: SYS-PTA-P10
- implementation_readiness: complete(completeness evaluator PASS)

## Workstream applicability

- 主: operations
- Frontend: 静的ページとログイン画面の最小範囲のみ。業務画面は feat-web-screens-actions の範囲

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-platform-tenant-auth/runbook.md
- README.md のセットアップ節
- Write scope: docs/feat-platform-tenant-auth/runbook.md, README.md

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

- 検証: runbook の手順を新規環境で1回通す
- 受入: 初見の担当者が runbook だけで preview 環境を構築できる

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: ドキュメントを直前版へ戻す

## Handoff

- 次の task: SYS-PTA-P13

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/infrastructure.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- features/feat-platform-tenant-auth.context.json
