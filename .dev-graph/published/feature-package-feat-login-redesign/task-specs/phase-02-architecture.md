# SYS-LRD-P02 スコープ定義・同意記録・連携状態の構成設計

## Machine-readable registration fields

- task_id: SYS-LRD-P02
- phase_ref: P02
- feature_package_id: feature-package/feat-login-redesign
- parent_feature: feat-login-redesign
- workstream_kind: backend
- build_target_kind: application-code
- depends_on: SYS-LRD-P01

## 目的

SCOPE_SETS(表示ラベル付き・唯一の正本)と LEGAL_VERSIONS、GET /api/auth/config の応答形、OAuth callback の新しい順序(付与スコープ検証→保存→youtube_link_status 更新→consent_records 追記→セッション確立)、consent_records と tenants.youtube_link_status のスキーマ、CSP 等ヘッダの付与位置(_headers と API middleware)を設計する。feat-platform-tenant-auth で実装済みの auth-routes / google-oauth / middleware のどこを変えるかの責務境界もここで確定する。

## 背景

feat-login-redesign はログイン画面を docs/screens/01-login.png どおりに刷新し、表示する権限と要求スコープの一致・同意記録・部分許可時の継続・画面の防御を加える feature で、確定仕様 system-spec の auth/ui-ux/frontend/security/backend/database 章の qa-062〜qa-073 に根拠を持つ。土台は feat-platform-tenant-auth の実装(Google ログイン・テナント・招待・規約ページ)である。

## 前提条件

- 先行 task: SYS-LRD-P01
- implementation_readiness: complete(completeness evaluator r3 PASS)

## Workstream applicability

- 主: backend。副: data・security・frontend の設計を含む

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-login-redesign/architecture.md(モジュール変更点・API 形・DB 変更・ヘッダ配置・既存実装との境界)
- Write scope: docs/feat-login-redesign/architecture.md

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

- 検証: 設計書の API 形と DB 変更が system-spec の backend/database 章と一致することを突合
- 受入: 表示用権限一覧と要求スコープが同じ定義から生成される設計になっている
- 受入: 既存の src/http/auth-routes.ts・google-oauth.ts・middleware.ts への変更点と、変えない範囲が列挙されている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: architecture.md を直前版へ戻す

## Handoff

- 次の task: SYS-LRD-P03

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
