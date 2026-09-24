# SYS-LRD-P12 運用手順とドキュメント

## Machine-readable registration fields

- task_id: SYS-LRD-P12
- phase_ref: P12
- feature_package_id: feature-package/feat-login-redesign
- parent_feature: feat-login-redesign
- workstream_kind: operations
- build_target_kind: application-code
- depends_on: SYS-LRD-P10

## 目的

規約改定時の LEGAL_VERSIONS 更新と再同意の流れ、OAuth 同意画面のアプリ名を Channel Insight にする手順、部分許可ユーザーへの案内を runbook にまとめる。

## 背景

feat-login-redesign はログイン画面を docs/screens/01-login.png どおりに刷新し、表示する権限と要求スコープの一致・同意記録・部分許可時の継続・画面の防御を加える feature で、確定仕様 system-spec の auth/ui-ux/frontend/security/backend/database 章の qa-062〜qa-073 に根拠を持つ。土台は feat-platform-tenant-auth の実装(Google ログイン・テナント・招待・規約ページ)である。

## 前提条件

- 先行 task: SYS-LRD-P10
- implementation_readiness: complete(completeness evaluator r3 PASS)

## Workstream applicability

- 主: operations

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-login-redesign/runbook.md
- README.md の更新
- Write scope: docs/feat-login-redesign/runbook.md, README.md, docs/setup/

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

- 検証: runbook の手順を preview 環境で1回通す
- 受入: 規約改定から再同意までの手順が runbook だけで実行できる

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: ドキュメントを直前版へ戻す

## Handoff

- 次の task: SYS-LRD-P13

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
