# SYS-DBR-P04 受入テストとPlaywright E2Eの設計

## Machine-readable registration fields

- task_id: SYS-DBR-P04
- phase_ref: P04
- feature_package_id: feature-package/feat-dashboard-redesign
- parent_feature: feat-dashboard-redesign
- workstream_kind: quality
- build_target_kind: application-code
- depends_on: SYS-DBR-P03

## 目的

受入項目ごとの単体・API テスト(vitest)と、Playwright 3サイズ(390×844・820×1180・1440×900)の E2E を先に書く。期間タブ既定7日・28日・任意91日400、対象セレクタの合計と重ね線、動画別実績の構成比切替、video_ids 101本以上での200応答、テナント境界の黙示的除外、空状態5種、360px 横スクロールなしを含める。

## 背景

feat-dashboard-redesign はダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が『今週、何が効いたか』と次に打つ手をすぐ判断できるようにする feature で、確定仕様 system-spec の ui-ux/frontend/backend/security/database/infrastructure 章の qa-074〜qa-083 に根拠を持つ。現状の web/pages/DashboardPage.tsx は仮画面であり、集約API・ファネルAPI・サムネイル配信API・daily_metrics/video_metrics/reports/actions の読み取りはまだ実装されていない。

## 前提条件

- 先行 task: SYS-DBR-P03
- implementation_readiness: complete(completeness evaluator r8 PASS)

## Workstream applicability

- 主: quality

## Architecture and deploy unit

- Architecture: arch-youtube-analytics-system
- Deploy unit: application

## 成果物

- tests/dashboard/ の失敗するテスト
- e2e/dashboard.spec.ts
- docs/feat-dashboard-redesign/test-design.md
- Write scope: tests/dashboard/, e2e/dashboard.spec.ts, docs/feat-dashboard-redesign/test-design.md

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

- 検証: pnpm test と pnpm e2e でテストが列挙され、実装前は失敗することを確認
- 受入: 受入13項目それぞれに少なくとも1つのテストケースがある(acc-01〜acc-13)
- 受入: video_ids 101本以上を渡すテストと360px幅・Playwright 3サイズのE2Eが実装前に失敗するテストとして存在する(acc-10,acc-11)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: tests/dashboard/ と e2e/dashboard.spec.ts の追加分を削除する

## Handoff

- 次の task: SYS-DBR-P05

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
