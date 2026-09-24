# SYS-LRD-P05 ログイン画面・API・DB・ヘッダの実装

## Machine-readable registration fields

- task_id: SYS-LRD-P05
- phase_ref: P05
- feature_package_id: feature-package/feat-login-redesign
- parent_feature: feat-login-redesign
- workstream_kind: frontend
- build_target_kind: application-code
- depends_on: SYS-LRD-P04

## 目的

LoginPage を画像どおりに刷新し(ReadOnlyBadge・TrustFooter・YouTubeLinkBanner・公式 G ロゴ SVG)、GET /api/auth/config・GET /api/auth/youtube/connect・callback 順序変更・consent_records 追記・再同意判定を実装する。マイグレーションで consent_records と tenants.youtube_link_status を追加し、SPA 本体に CSP 等のヘッダを付ける。製品名を Channel Insight に統一し、プライバシーポリシーに信頼表示3点の根拠を書く。

## 背景

feat-login-redesign はログイン画面を docs/screens/01-login.png どおりに刷新し、表示する権限と要求スコープの一致・同意記録・部分許可時の継続・画面の防御を加える feature で、確定仕様 system-spec の auth/ui-ux/frontend/security/backend/database 章の qa-062〜qa-073 に根拠を持つ。土台は feat-platform-tenant-auth の実装(Google ログイン・テナント・招待・規約ページ)である。

## 前提条件

- 先行 task: SYS-LRD-P04
- implementation_readiness: complete(completeness evaluator r3 PASS)

## Workstream applicability

- 主: frontend。副: backend(auth-routes・config API)、data(マイグレーション)、security(ヘッダ)

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- web/ のログイン画面と共通コンポーネント
- src/http/ の auth ルートとヘッダ middleware
- migrations/0003_login_consent_youtube_link.sql
- public/_headers と規約2ページの更新
- Write scope: web/pages/LoginPage.tsx, web/components/, web/api.ts, web/pages/DashboardPage.tsx, web/pages/SettingsPage.tsx, web/pages/Shell.tsx, web/index.html, web/styles.css, src/http/, src/usecases/, src/repositories/, migrations/0003_login_consent_youtube_link.sql, public/

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

- 検証: pnpm test
- 検証: pnpm db:migrate:local
- 検証: pnpm typecheck
- 受入: P04 のテストがすべて通る
- 受入: 画面の権限一覧が /api/auth/config の応答だけから描かれている(直書き0件)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 機能ブランチの revert とローカル D1 の再作成

## Handoff

- 次の task: SYS-LRD-P06

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
