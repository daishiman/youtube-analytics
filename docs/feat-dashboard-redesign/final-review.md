# feat-dashboard-redesign 最終レビュー（SYS-DBR-P10）

> 本書の scope_in / scope_out と残事項は初回ダッシュボード実装時点の記録。2026-09-25 に日次収集、Reporting、Analytics 多次元、CSV取込、サムネイル送信と解除時の削除を追加したため、2・3節を現在の未実装一覧として使わない。当時の合否は書き換えず、現行の画面契約は `system-spec/ui-ux.md`、データの範囲と未完了項目は `data-coverage-audit.md` を参照。集約APIの失敗は画面全体のデータ表示に影響し、独立APIは該当区画でエラーを表示する。

最終更新: 2026-09-25。`features/feat-dashboard-redesign.context.json` の scope_in を、変更したファイルに対応付ける。

## 1. scope_in とファイルの対応

| # | scope_in | 主なファイル |
|---|---|---|
| S1 | ヘッダー（パンくず、収集状況、編集者以上だけの CSVアップロードボタン）と既存の配色 | `web/pages/DashboardPage.tsx`、`web/styles.css` |
| S2 | 期間は共通ヘッダーに統一（7d を追加、既定 28d、custom は最大365日）。期間リンクは既存のクエリを残す（qa-099） | `web/components/AppShell.tsx`、`src/domain/dashboard-period.ts`、`e2e/shell-state.spec.ts` |
| S3 | 対象セレクタ（直近10本が既定、上限なし）と、選んだ動画の合計・動画ごとの線 | `DashboardPage.tsx` の `ScopeSelector`、`web/pages/dashboard/TrendCard.tsx` |
| S4 | 問い「今週、何が効きましたか？」と KPI 4枚 | `web/pages/dashboard/KpiCards.tsx`、`web/pages/dashboard/format.ts` |
| S5 | 日次推移（ECharts の遅延読込、前期の点線、公開日マーカー、文字要約と表） | `TrendCard.tsx`、`web/components/EChart.tsx`、`web/components/echarts-setup.ts`、`package.json`、`pnpm-lock.yaml` |
| S6 | 動画別の実績と構成比 | `web/pages/dashboard/VideoPerformance.tsx` |
| S7 | 最新AI分析と改善アクション | `web/pages/dashboard/SidePanels.tsx` |
| S8 | 詳しく見る（ファネルを移設し、判定は維持） | `web/pages/dashboard/DetailsSection.tsx`、`src/domain/funnel.ts`、`src/usecases/funnel.ts` |
| S9 | 空状態5種と区画ごとの読込中・エラー | `DashboardPage.tsx`、`SidePanels.tsx` |
| S10 | `GET /api/dashboard`（json_each で上限なし） | `src/http/dashboard-routes.ts`、`src/usecases/dashboard.ts`、`src/repositories/dashboard-repository.ts`、`web/api.ts` |
| S11 | `GET /api/dashboard/funnel` | `dashboard-routes.ts`、`src/usecases/funnel.ts` |
| S12 | サムネイルの配信、thumbnail 通、Cron 役割①の削除、1,000本の上限（qa-098） | `src/usecases/thumbnails.ts`、`migrations/0008_dashboard_media_assets.sql`、`src/index.ts`、`src/env.ts`、`wrangler.toml`、`scripts/setup-cloudflare.sh` |
| S13 | セキュリティ（テナント境界、閲覧者、テキスト描画、CSP を変えない、`private, no-store`） | `dashboard-repository.ts`、`src/http/app.ts`（`private` の Cache-Control を残す） |
| S14 | アクセシビリティ、レスポンシブ、3サイズの E2E | `web/styles.css`、`e2e/dashboard.spec.ts` |
| S15 | テスト、seed、文書、証跡 | `tests/dashboard/*`、`tests/platform/routes.ts`、`scripts/seed-local.sql`、`docs/feat-dashboard-redesign/*`、`evidence/feat-dashboard-redesign/*`、`README.md` |

## 2. scope_out を守ったこと

- 収集処理と収集時刻、CSV の取込処理、AI 分析の生成、ほかの画面の本体、actions の状態遷移 API には手を入れていない。ダッシュボードは表を読み、取込画面（`/settings#imports`）へ移るだけ。
- ティール配色は使わず、新しい色トークンも足していない。
- CSP に `i.ytimg.com` を足していない（`security-headers.ts` と `public/_headers` は差分なし）。
- commit、push、PR、deploy、remote D1 migration はしていない。

## 3. 残した事項

| 事項 | 扱い |
|---|---|
| thumbnail 通の送信元がない（当時） | 後続で `src/usecases/youtube-collector.ts` に接続済み。公開環境での Queue・R2・表示は未検証。現況は `data-coverage-audit.md` を参照 |
| 旧チャンネルの行の消去 | `channel-cleanup` は新しい表を消さない。表示は `channel_id` で絞るので出ないが、消去は保持期間の feature（feat-retention-ops）で足す |
| seed にサムネイル画像がない | R2 の原本が要るので入れていない。ローカルの画面は代替表示 |
| login A5 の flaky | 修正済み。qa-report.md 2 節。smoke.spec.ts の同じ形のログイン処理は未変更 |
| P13（本番反映） | 実行していない。runbook.md 3 節の手順を、利用者の明示の指示を受けてから行う |
| preview での確認 | deploy 後に acceptance.md の公開環境の列を埋める |
| TODO(human) | 利用者から「全部完了させる」と指示があったため、作っていない |
