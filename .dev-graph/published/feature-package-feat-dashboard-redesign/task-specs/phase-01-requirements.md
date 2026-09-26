# SYS-DBR-P01 ダッシュボード刷新の要件を実装単位へ確定

## Machine-readable registration fields

- task_id: SYS-DBR-P01
- phase_ref: P01
- feature_package_id: feature-package/feat-dashboard-redesign
- parent_feature: feat-dashboard-redesign
- workstream_kind: documentation
- build_target_kind: application-code
- depends_on: なし

## 目的

feature の受入13項目(acc-01〜acc-13)を qa-074〜qa-083 の根拠章と検証方法・担当 phase へ1対1で対応付け、画面正本 docs/screens/02-dashboard.png の区画順(ヘッダ・期間タブ・対象セレクタ・問い・KPI 4枚・日次推移・動画別の実績と構成比・最新AI分析・実施中の改善アクション・詳しく見る)と既存インディゴ/マゼンタ配色を確定する。

## 背景

feat-dashboard-redesign はダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が『今週、何が効いたか』と次に打つ手をすぐ判断できるようにする feature で、確定仕様 system-spec の ui-ux/frontend/backend/security/database/infrastructure 章の qa-074〜qa-083 に根拠を持つ。現状の web/pages/DashboardPage.tsx は仮画面であり、集約API・ファネルAPI・サムネイル配信API・daily_metrics/video_metrics/reports/actions の読み取りはまだ実装されていない。

## 前提条件

- 先行 task なし(feature 内の最初の task)
- implementation_readiness: complete(completeness evaluator r8 PASS)

## Workstream applicability

- 主: documentation。実装コードは変更しない

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: documentation

## 成果物

- docs/feat-dashboard-redesign/requirements.md(受入対応表・区画順対応表・qa 番号対応表)
- Write scope: docs/feat-dashboard-redesign/requirements.md

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

- 検証: 対応表の行数が受入項目数13と一致することを確認
- 受入: 受入13項目すべてに根拠章(qa番号)と検証方法・担当phaseが1対1で対応している(acc-01〜acc-13)
- 受入: 画面の区画順・文言・配色が docs/screens/02-dashboard.png と system-spec ui-ux 章の記述どおりに列挙されている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: requirements.md を直前版へ戻す

## Handoff

- 次の task: SYS-DBR-P02

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
