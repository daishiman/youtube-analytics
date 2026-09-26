# SYS-DBR-P05 ダッシュボードUI・集約API・ファネルAPI・サムネイル配信・Cronの実装

## Machine-readable registration fields

- task_id: SYS-DBR-P05
- phase_ref: P05
- feature_package_id: feature-package/feat-dashboard-redesign
- parent_feature: feat-dashboard-redesign
- workstream_kind: frontend
- build_target_kind: application-code
- depends_on: SYS-DBR-P04

## 目的

DashboardPage を画像どおりに刷新し(期間タブ・対象セレクタ・KPI 4枚・日次推移・動画別の実績と構成比・最新AI分析・改善アクション・詳しく見る)、GET /api/dashboard・GET /api/dashboard/funnel・GET /api/media/thumbnails/:video_id を実装する。migrations/0004_dashboard_media_assets.sql で media_assets に fetched_at・source_url を追加し、thumbnail 通と Cron 役割①(30日超削除)を src/index.ts の scheduled ハンドラへ追加し、wrangler.toml に thumbnail 通用の Cron トリガーを登録する。

## 背景

feat-dashboard-redesign はダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が『今週、何が効いたか』と次に打つ手をすぐ判断できるようにする feature で、確定仕様 system-spec の ui-ux/frontend/backend/security/database/infrastructure 章の qa-074〜qa-083 に根拠を持つ。現状の web/pages/DashboardPage.tsx は仮画面であり、集約API・ファネルAPI・サムネイル配信API・daily_metrics/video_metrics/reports/actions の読み取りはまだ実装されていない。

## 前提条件

- 先行 task: SYS-DBR-P04
- implementation_readiness: complete(completeness evaluator r8 PASS)

## Workstream applicability

- 主: frontend。副: backend(API 実装)、data(マイグレーション・クエリ)、security(ヘッダ・テナント境界)、infrastructure(Cron)

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- web/ のダッシュボード画面と共通コンポーネント
- src/http/ の集約API・ファネルAPI・サムネイルAPI ルートとミドルウェア
- src/usecases/・src/repositories/ の読み取りユースケースとリポジトリ
- migrations/0004_dashboard_media_assets.sql
- src/index.ts の scheduled ハンドラ追加分と wrangler.toml の Cron トリガー
- Write scope: web/pages/DashboardPage.tsx, web/components/, web/api.ts, web/pages/Shell.tsx, web/styles.css, src/http/api-routes.ts, src/http/app.ts, src/http/middleware.ts, src/usecases/, src/repositories/, migrations/0004_dashboard_media_assets.sql, src/index.ts, wrangler.toml

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- GitHub publication: local_only
- 完了: linked PR が default branch へ merge されたとき

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- YouTube データの収集処理と収集時刻の変更(feat-youtube-daily-collection。確定済みの毎日 JST 3:00 のまま)
- Studio CSV・週次事業 CSV の取込処理(feat-csv-media-ingest。ダッシュボードは取込ボタンから既存の取込画面へ遷移するだけ)
- AI 分析レポートの生成とアップロード(feat-skill-analysis-reports)
- 動画画面・AI分析画面・改善アクション画面・設定画面の本体と actions の状態遷移 API(feat-web-screens-actions)
- 画像のティール配色(qa-076 で既存インディゴ/マゼンタを維持と確定)
- YouTube の画像ホスト(i.ytimg.com)からの直接表示と CSP の拡張(qa-080 で自サイト経由と確定)

## Verification and evidence

- 検証: pnpm test
- 検証: pnpm db:migrate:local
- 検証: pnpm typecheck
- 受入: 画面がdocs/screens/02-dashboard.pngどおりの区画順・既存インディゴ/マゼンタ配色で表示される(acc-01)
- 受入: 期間タブ・対象セレクタ・KPI・日次推移・動画別実績・AI分析・改善アクション・詳しく見るがGET /api/dashboardの1回取得で描かれる(acc-02〜acc-07)
- 受入: P04のテストが実装により通過する(acc-01〜acc-13)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 機能ブランチのrevertとローカルD1の再作成

## Handoff

- 次の task: SYS-DBR-P06

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/ui-ux.md
- system-spec/frontend.md
- system-spec/backend.md
- system-spec/security.md
- system-spec/database.md
- system-spec/infrastructure.md
- architecture/youtube-analytics-system.md
- specs/youtube-analytics-system.md
- docs/screens/02-dashboard.png
- features/feat-dashboard-redesign.context.json
