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

DashboardPage を画像どおりに刷新し(対象セレクタ・KPI 4枚・日次推移・動画別の実績と構成比・最新AI分析・改善アクション・詳しく見る)、GET /api/dashboard・GET /api/dashboard/funnel・GET /api/media/thumbnails/:video_id を実装する。web/components/AppShell.tsx の PERIODS へ 7d を追加して 7d/28d/90d/1y/custom(省略時28d)にし、期間リンクは既存クエリ(scope/video_ids等)を保持して period だけ差し替えるよう修正する。ダッシュボードはページ内の期間タブを持たず ?period= を読むだけにする。migrations/0008_dashboard_media_assets.sql で videos/daily_metrics/video_metrics/video_reach_daily/video_daily_metrics/reports/findings/actions/media_assets/business_funnel_weekly/funnel_targets を system-spec database 章の列定義に沿って読み取りに必要な列だけ CREATE TABLE IF NOT EXISTS し、media_assets に fetched_at・source_url と (tenant_id, kind, fetched_at) 索引を追加する。thumbnail 通と Cron 役割①(30日超削除)を src/index.ts の scheduled ハンドラへ追加し、wrangler.toml に thumbnail 通用の Cron トリガーを登録する。scripts/seed-local.sql へダッシュボード用テストデータ(seed-tenant-a に動画12本・90日分の日次指標・レポート1版・アクション2件・週次ファネル)を追加し、ローカル画面確認を可能にする。

## 背景

feat-dashboard-redesign はダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が『今週、何が効いたか』と次に打つ手をすぐ判断できるようにする feature で、確定仕様 system-spec の ui-ux/frontend/backend/security/database/infrastructure 章の qa-089〜qa-099 に根拠を持つ(qa-089〜qa-098 は id-renumber-for-merge receipt(eval-log/renumber-receipt-feat-dashboard-redesign-20260924.json)により旧 qa-074〜qa-083 から繰り上げ、qa-099 は期間切替を全画面共通の AppShell ヘッダー `?period=` へ統一する新規決定、appr-013 は appr-015 へ繰り上げ)。feat-settings-channel-link(AppShell・共通ヘッダー・PageHeader/SectionCard/StatusBadge/DataTable の土台)に依存し、本 feature はヘッダーの PERIODS に 7d を足すだけで土台は作り直さない。現状の web/pages/DashboardPage.tsx は仮画面であり、集約API・ファネルAPI・サムネイル配信API・daily_metrics/video_metrics/reports/actions の読み取りはまだ実装されていない。ダッシュボードが読む videos/daily_metrics/video_metrics/video_reach_daily/video_daily_metrics/reports/findings/actions/media_assets/business_funnel_weekly/funnel_targets は上流feature(feat-youtube-daily-collection・feat-csv-media-ingest・feat-skill-analysis-reports・feat-web-screens-actions)が未実装のため現リポジトリに存在せず、本featureのmigrations/0008_dashboard_media_assets.sqlでsystem-spec database章の列定義に沿って読み取りに必要な列だけをCREATE TABLE IF NOT EXISTSし、media_assetsにはfetched_at・source_urlと(tenant_id, kind, fetched_at)索引を持たせる。上流featureは後でこの表を引き継ぎALTERで列を足す想定で、本featureは書込み(収集・CSV取込・レポート生成・アクション状態遷移)を作らない。

## 前提条件

- 先行 task: SYS-DBR-P04
- implementation_readiness: complete(completeness evaluator r8 PASS)

## Workstream applicability

- 主: frontend。副: backend(API 実装)、data(マイグレーション・クエリ)、security(ヘッダ・テナント境界)、infrastructure(Cron)

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- web/ のダッシュボード画面と共通コンポーネント(AppShell の PERIODS 拡張を含む)
- src/http/ の集約API・ファネルAPI・サムネイルAPI ルートとミドルウェア
- src/usecases/・src/repositories/ の読み取りユースケースとリポジトリ
- migrations/0008_dashboard_media_assets.sql
- scripts/seed-local.sql の追記(ローカル確認用テストデータ)
- src/index.ts の scheduled ハンドラ追加分と wrangler.toml の Cron トリガー
- Write scope: web/components/AppShell.tsx, web/pages/DashboardPage.tsx, web/pages/dashboard/, web/components/, web/api.ts, web/styles.css, src/http/dashboard-routes.ts, src/http/app.ts, src/usecases/dashboard*.ts, src/usecases/thumbnails.ts, src/repositories/dashboard-repository.ts, src/lib/errors.ts, src/index.ts, src/env.ts, migrations/0008_dashboard_media_assets.sql, scripts/seed-local.sql, wrangler.toml, package.json, pnpm-lock.yaml(echarts 追加)

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
- 画像のティール配色(qa-091 で既存インディゴ/マゼンタを維持と確定)
- YouTube の画像ホスト(i.ytimg.com)からの直接表示と CSP の拡張(qa-095 で自サイト経由と確定)
- AppShell・共通ヘッダーの土台と共通部品 PageHeader/SectionCard/StatusBadge/DataTable の新規実装(feat-settings-channel-link で確立済み。本 feature はヘッダーの PERIODS に 7d を足すだけ、qa-099)

## Verification and evidence

- 検証: pnpm test
- 検証: pnpm db:migrate:local
- 検証: pnpm typecheck
- 受入: 画面がdocs/screens/02-dashboard.pngどおりの区画順・既存インディゴ/マゼンタ配色で表示される(acc-01)
- 受入: 共通ヘッダーの期間が7日/28日/90日/1年/任意の5つになり、切り替えるとKPI・推移・前期比が同じ期間で再計算され、対象の選択と期間リンクの既存クエリが保たれる(acc-02)
- 受入: 対象セレクタ・KPI・日次推移・動画別実績・AI分析・改善アクション・詳しく見るがGET /api/dashboardの1回取得で描かれる(acc-03〜acc-07)
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
