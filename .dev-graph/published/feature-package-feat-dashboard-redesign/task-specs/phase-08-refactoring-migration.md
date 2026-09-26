# SYS-DBR-P08 重複ロジックの整理とマイグレーション健全性確認

## Machine-readable registration fields

- task_id: SYS-DBR-P08
- phase_ref: P08
- feature_package_id: feature-package/feat-dashboard-redesign
- parent_feature: feat-dashboard-redesign
- workstream_kind: data
- build_target_kind: application-code
- depends_on: SYS-DBR-P07

## 目的

重複した集計クエリ・空状態文言の定義を1か所へ寄せ、migrations/0004_dashboard_media_assets.sql が空の D1 と既存データのある D1 の両方で通ることを確認する。

## 背景

feat-dashboard-redesign はダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が『今週、何が効いたか』と次に打つ手をすぐ判断できるようにする feature で、確定仕様 system-spec の ui-ux/frontend/backend/security/database/infrastructure 章の qa-074〜qa-083 に根拠を持つ。現状の web/pages/DashboardPage.tsx は仮画面であり、集約API・ファネルAPI・サムネイル配信API・daily_metrics/video_metrics/reports/actions の読み取りはまだ実装されていない。

## 前提条件

- 先行 task: SYS-DBR-P07
- implementation_readiness: complete(completeness evaluator r8 PASS)

## Workstream applicability

- 主: data

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- 整理コミット
- Write scope: src/, web/, migrations/

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
- 検証: pnpm db:migrate:local を空DBと既存DBで実行
- 受入: 振る舞い変更0件(P06のテストが引き続きgreen)
- 受入: 空のD1と既存D1の両方へmigrations/0004_dashboard_media_assets.sqlが成功する(acc-12,acc-13)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 整理コミットをrevertする

## Handoff

- 次の task: SYS-DBR-P09

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
