# SYS-PTA-P09 セキュリティと品質の保証

## Machine-readable registration fields

- task_id: SYS-PTA-P09
- phase_ref: P09
- feature_package_id: feature-package/feat-platform-tenant-auth
- parent_feature: feat-platform-tenant-auth
- workstream_kind: security
- build_target_kind: application-code
- depends_on: SYS-PTA-P08

## 目的

lint・型検査・依存の脆弱性確認、Cookie 属性・CSRF・招待トークンの使い捨て・Secrets の非露出を確認する。

## 背景

feat-platform-tenant-auth は後続5機能すべての前提(tenant_id と役割)を提供する ready feature であり、確定仕様 system-spec の auth/security/database/infrastructure 章に根拠を持つ。

## 前提条件

- 先行 task: SYS-PTA-P08
- implementation_readiness: complete(completeness evaluator PASS)

## Workstream applicability

- 主: security
- Frontend: 静的ページとログイン画面の最小範囲のみ。業務画面は feat-web-screens-actions の範囲

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-platform-tenant-auth/qa-report.md
- Write scope: docs/feat-platform-tenant-auth/qa-report.md

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

- 検証: npm run lint
- 検証: npx tsc --noEmit
- 検証: npm audit --audit-level=high
- 受入: high 以上の脆弱性0件
- 受入: Secrets がリポジトリとログに現れない

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: qa-report.md の是正事項を P05 へ差し戻す

## Handoff

- 次の task: SYS-PTA-P10

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/infrastructure.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- features/feat-platform-tenant-auth.context.json
