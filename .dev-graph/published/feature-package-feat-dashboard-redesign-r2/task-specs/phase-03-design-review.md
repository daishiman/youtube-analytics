# SYS-DBR-P03 テナント境界・キャッシュ・CSP・Cron予算の設計レビュー

## Machine-readable registration fields

- task_id: SYS-DBR-P03
- phase_ref: P03
- feature_package_id: feature-package/feat-dashboard-redesign
- parent_feature: feat-dashboard-redesign
- workstream_kind: security
- build_target_kind: application-code
- depends_on: SYS-DBR-P02

## 目的

P02 の設計を、テナント境界(qa-097)・閲覧者の読み取り専用・CSP不変・Cache-Control: private, no-store・Cloudflare Workers Free の subrequest 50・D1 bound parameters 100・period パラメータの400判定(qa-099)の観点でレビューし、他テナント/存在しない video_ids の黙示的除外、1,100本超テナントの1,000本上限、サムネイル未保存時の代替表示、migrations/0008 の CREATE TABLE IF NOT EXISTS が上流feature(feat-youtube-daily-collection等)の書込み経路を作っていないこと(読み取り専用境界の維持)の抜けを洗い出す。

## 背景

feat-dashboard-redesign はダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が『今週、何が効いたか』と次に打つ手をすぐ判断できるようにする feature で、確定仕様 system-spec の ui-ux/frontend/backend/security/database/infrastructure 章の qa-089〜qa-099 に根拠を持つ(qa-089〜qa-098 は id-renumber-for-merge receipt(eval-log/renumber-receipt-feat-dashboard-redesign-20260924.json)により旧 qa-074〜qa-083 から繰り上げ、qa-099 は期間切替を全画面共通の AppShell ヘッダー `?period=` へ統一する新規決定、appr-013 は appr-015 へ繰り上げ)。feat-settings-channel-link(AppShell・共通ヘッダー・PageHeader/SectionCard/StatusBadge/DataTable の土台)に依存し、本 feature はヘッダーの PERIODS に 7d を足すだけで土台は作り直さない。現状の web/pages/DashboardPage.tsx は仮画面であり、集約API・ファネルAPI・サムネイル配信API・daily_metrics/video_metrics/reports/actions の読み取りはまだ実装されていない。ダッシュボードが読む videos/daily_metrics/video_metrics/video_reach_daily/video_daily_metrics/reports/findings/actions/media_assets/business_funnel_weekly/funnel_targets は上流feature(feat-youtube-daily-collection・feat-csv-media-ingest・feat-skill-analysis-reports・feat-web-screens-actions)が未実装のため現リポジトリに存在せず、本featureのmigrations/0008_dashboard_media_assets.sqlでsystem-spec database章の列定義に沿って読み取りに必要な列だけをCREATE TABLE IF NOT EXISTSし、media_assetsにはfetched_at・source_urlと(tenant_id, kind, fetched_at)索引を持たせる。上流featureは後でこの表を引き継ぎALTERで列を足す想定で、本featureは書込み(収集・CSV取込・レポート生成・アクション状態遷移)を作らない。

## 前提条件

- 先行 task: SYS-DBR-P02
- implementation_readiness: complete(completeness evaluator r8 PASS)

## Workstream applicability

- 主: security

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-dashboard-redesign/design-review.md(観点・判定・根拠・是正先)
- Write scope: docs/feat-dashboard-redesign/design-review.md

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

- 検証: レビュー表の全行に判定と根拠がある
- 受入: 他テナント・存在しないvideo_idsを黙って除外し200を返す設計であることがレビューで確認されている(acc-08)
- 受入: Cache-Control: private, no-store とCSP不変(img-src 'self' data:)がレビューで確認されている(acc-09)
- 受入: Cloudflare Workers Free の subrequest 50 と D1 bound parameters 100 の制約に抵触しない設計であることがレビューで確認されている(acc-11,acc-12)
- 受入: 許可外のperiod・任意期間366日以上・from>toが400になる設計であることがレビューで確認されている(acc-02)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: design-review.md を直前版へ戻す

## Handoff

- 次の task: SYS-DBR-P04

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
