# SYS-LRD-P10 最終レビュー

## Machine-readable registration fields

- task_id: SYS-LRD-P10
- phase_ref: P10
- feature_package_id: feature-package/feat-login-redesign
- parent_feature: feat-login-redesign
- workstream_kind: quality
- build_target_kind: application-code
- depends_on: SYS-LRD-P09

## 目的

差分全体を scope_in / scope_out と突合し、feat-platform-tenant-auth と feat-web-screens-actions の範囲へはみ出していないかを確認する。

## 背景

feat-login-redesign はログイン画面を docs/screens/01-login.png どおりに刷新し、表示する権限と要求スコープの一致・同意記録・部分許可時の継続・画面の防御を加える feature で、確定仕様 system-spec の auth/ui-ux/frontend/security/backend/database 章の qa-062〜qa-073 に根拠を持つ。土台は feat-platform-tenant-auth の実装(Google ログイン・テナント・招待・規約ページ)である。

## 前提条件

- 先行 task: SYS-LRD-P09
- implementation_readiness: complete(completeness evaluator r3 PASS)

## Workstream applicability

- 主: quality

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-login-redesign/final-review.md
- Write scope: docs/feat-login-redesign/final-review.md

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

- 検証: git diff の全ファイルを scope_in と対応付ける
- 受入: scope_out に当たる変更0件
- 受入: 未解決のレビュー指摘0件

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 指摘を該当 phase へ差し戻す

## Handoff

- 次の task: SYS-LRD-P11, SYS-LRD-P12

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
