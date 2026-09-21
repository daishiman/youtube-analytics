# SYS-PTA-P13 CI/CD とリリース

## Machine-readable registration fields

- task_id: SYS-PTA-P13
- phase_ref: P13
- feature_package_id: feature-package/feat-platform-tenant-auth
- parent_feature: feat-platform-tenant-auth
- workstream_kind: infrastructure
- build_target_kind: application-code
- depends_on: SYS-PTA-P11、SYS-PTA-P12

## 目的

GitHub Actions で PR 時に lint/test/dry-run、main への push で D1 マイグレーション適用のあと deploy する。Secrets は Actions secrets と Workers Secrets に分ける。

## 背景

feat-platform-tenant-auth は後続5機能すべての前提(tenant_id と役割)を提供する ready feature であり、確定仕様 system-spec の auth/security/database/infrastructure 章に根拠を持つ。

## 前提条件

- 先行 task: SYS-PTA-P11、SYS-PTA-P12
- implementation_readiness: complete(completeness evaluator PASS)

## Workstream applicability

- 主: infrastructure
- Frontend: 静的ページとログイン画面の最小範囲のみ。業務画面は feat-web-screens-actions の範囲

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- .github/workflows/ci.yml
- .github/workflows/deploy.yml
- Write scope: .github/workflows/

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

- 検証: Actions の実行ログで migrations apply と deploy の成功を確認
- 受入: main への push で D1 マイグレーションと deploy が完了する
- 受入: PR で lint/test/dry-run が必須チェックになっている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 直前の Workers バージョンへ wrangler rollback し、マイグレーションは前方修正で戻す

## Handoff

- 次の task: 完了(dev-graph の completion reconciliation へ)

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/infrastructure.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- features/feat-platform-tenant-auth.context.json
