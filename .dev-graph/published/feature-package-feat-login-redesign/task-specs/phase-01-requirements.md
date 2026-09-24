# SYS-LRD-P01 ログイン刷新の要件を実装単位へ確定

## Machine-readable registration fields

- task_id: SYS-LRD-P01
- phase_ref: P01
- feature_package_id: feature-package/feat-login-redesign
- parent_feature: feat-login-redesign
- workstream_kind: documentation
- build_target_kind: application-code
- depends_on: なし

## 目的

feature の受入10項目を qa-062〜qa-073 の根拠章と検証方法へ1対1で対応付け、画面正本 docs/screens/01-login.png の文言・並び・権限表示・エラーコード一覧(CONSENT_OUTDATED 追加、RATE_LIMITED は持たない)を確定する。

## 背景

feat-login-redesign はログイン画面を docs/screens/01-login.png どおりに刷新し、表示する権限と要求スコープの一致・同意記録・部分許可時の継続・画面の防御を加える feature で、確定仕様 system-spec の auth/ui-ux/frontend/security/backend/database 章の qa-062〜qa-073 に根拠を持つ。土台は feat-platform-tenant-auth の実装(Google ログイン・テナント・招待・規約ページ)である。

## 前提条件

- 先行 task なし(feature 内の最初の task)
- 依存 feature feat-platform-tenant-auth が done であること(dev-graph の P01 ready gate)
- implementation_readiness: complete(completeness evaluator r3 PASS)

## Workstream applicability

- 主: documentation。実装コードは変更しない

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-login-redesign/requirements.md(受入対応表・文言表・エラーコード表)
- Write scope: docs/feat-login-redesign/requirements.md

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

- 検証: 対応表の行数が受入項目数10と一致することを確認
- 受入: 受入10項目すべてに根拠章(qa 番号)と検証方法が1対1で対応している
- 受入: 画面の全文言が画像と仕様どおりに列挙され、qa-071 で削除した試行回数制限が含まれていない

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: requirements.md を直前版へ戻す

## Handoff

- 次の task: SYS-LRD-P02

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
