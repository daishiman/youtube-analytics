# SYS-PTA-P02 Workers/D1/R2 構成とテナント分離の設計

## Machine-readable registration fields

- task_id: SYS-PTA-P02
- phase_ref: P02
- feature_package_id: feature-package/feat-platform-tenant-auth
- parent_feature: feat-platform-tenant-auth
- workstream_kind: infrastructure
- build_target_kind: application-code
- depends_on: SYS-PTA-P01

## 目的

Workers 1本(Hono v4)+D1(binding DB)+R2 1バケットの wrangler 構成、TenantScopedRepository と TenantContext の層構成、MAX_TENANTS=100 の置き場所を設計する。

## 背景

feat-platform-tenant-auth は後続5機能すべての前提(tenant_id と役割)を提供する ready feature であり、確定仕様 system-spec の auth/security/database/infrastructure 章に根拠を持つ。

## 前提条件

- 先行 task: SYS-PTA-P01
- implementation_readiness: complete(completeness evaluator PASS)

## Workstream applicability

- 主: infrastructure
- Frontend: 静的ページとログイン画面の最小範囲のみ。業務画面は feat-web-screens-actions の範囲

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- docs/feat-platform-tenant-auth/architecture.md(層構成・binding 名・環境変数一覧)
- wrangler.toml の雛形(binding DB・R2・vars MAX_TENANTS)
- Write scope: docs/feat-platform-tenant-auth/architecture.md, wrangler.toml

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

- 検証: npx wrangler deploy --dry-run が構成エラーなく通る
- 受入: 全リポジトリ層の関数が tenant_id を必須引数に取る設計になっている
- 受入: Secrets と vars の区別が一覧化されている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: wrangler.toml と architecture.md を直前版へ戻す

## Handoff

- 次の task: SYS-PTA-P03

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/infrastructure.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- features/feat-platform-tenant-auth.context.json
