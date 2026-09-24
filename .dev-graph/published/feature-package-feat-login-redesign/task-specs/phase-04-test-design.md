# SYS-LRD-P04 受入テストと E2E の設計

## Machine-readable registration fields

- task_id: SYS-LRD-P04
- phase_ref: P04
- feature_package_id: feature-package/feat-login-redesign
- parent_feature: feat-login-redesign
- workstream_kind: quality
- build_target_kind: application-code
- depends_on: SYS-LRD-P03

## 目的

受入項目ごとの単体・API テスト(vitest)と、Playwright 3サイズ(390×844・820×1180・1440×900)の E2E を先に書く。新規/招待モード、同意前の非活性、CONSENT_OUTDATED と未知コード、部分許可後の再連携バナー、オーナー以外の connect 403、CSP ヘッダ、360px 横スクロールなし、キーボード操作を含める。

## 背景

feat-login-redesign はログイン画面を docs/screens/01-login.png どおりに刷新し、表示する権限と要求スコープの一致・同意記録・部分許可時の継続・画面の防御を加える feature で、確定仕様 system-spec の auth/ui-ux/frontend/security/backend/database 章の qa-062〜qa-073 に根拠を持つ。土台は feat-platform-tenant-auth の実装(Google ログイン・テナント・招待・規約ページ)である。

## 前提条件

- 先行 task: SYS-LRD-P03
- implementation_readiness: complete(completeness evaluator r3 PASS)

## Workstream applicability

- 主: quality

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- tests/login/ の失敗するテスト
- e2e/login.spec.ts
- docs/feat-login-redesign/test-design.md
- Write scope: tests/login/, e2e/login.spec.ts, docs/feat-login-redesign/test-design.md

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

- 検証: pnpm test と pnpm e2e でテストが列挙され、実装前は失敗することを確認
- 受入: 受入10項目それぞれに少なくとも1つのテストケースがある
- 受入: 実装前は新規テストが失敗する

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: tests/login/ と e2e/login.spec.ts の追加分を削除する

## Handoff

- 次の task: SYS-LRD-P05

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
