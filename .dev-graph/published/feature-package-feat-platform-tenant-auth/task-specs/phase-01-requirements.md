# SYS-PTA-P01 要件の実装単位への確定

## Machine-readable registration fields

- task_id: SYS-PTA-P01
- phase_ref: P01
- feature_package_id: feature-package/feat-platform-tenant-auth
- parent_feature: feat-platform-tenant-auth
- workstream_kind: documentation
- build_target_kind: application-code
- depends_on: なし(package の起点)

## 目的

feature 受入6項目と system-spec の auth/security/database 章を、実装可能な要件表(API・状態遷移・エラーコード)へ落とす。

## 背景

feat-platform-tenant-auth は後続5機能すべての前提(tenant_id と役割)を提供する ready feature であり、確定仕様 system-spec の auth/security/database/infrastructure 章に根拠を持つ。

## 前提条件

- 先行 task: なし(package の起点)
- implementation_readiness: complete(completeness evaluator PASS)

## Workstream applicability

- 主: documentation
- Frontend: 静的ページとログイン画面の最小範囲のみ。業務画面は feat-web-screens-actions の範囲

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-platform-tenant-auth/requirements.md(受入6項目×根拠章×検証方法の対応表)
- Write scope: docs/feat-platform-tenant-auth/requirements.md

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

- 検証: 対応表の行数が受入項目数6と一致することを目視とスクリプトで確認
- 受入: 受入6項目すべてに根拠章と検証方法が1対1で対応している
- 受入: エラー形式 error.code/message/hint のコード一覧が確定している

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: requirements.md を直前版へ戻す

## Handoff

- 次の task: SYS-PTA-P02

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/infrastructure.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- features/feat-platform-tenant-auth.context.json
