# feat-dashboard-redesign 設計（SYS-DBR-P02）

> 本書の上流 feature への引き継ぎは初回設計時点のもの。後続で収集・CSV取込を同じワークツリーに追加した。現況は `data-coverage-audit.md` を参照。

最終更新: 2026-09-25。根拠章は ui-ux、frontend、backend、database、security、infrastructure（qa-099〜qa-109）。

## 1. 画面の部品境界

| 部品 | ファイル | 役割 |
|---|---|---|
| ページ | `web/pages/DashboardPage.tsx` | `?period=`、`scope`、`video_ids` を URL から読み、`GET /api/dashboard` を1回呼んで各区画へ配る。集約APIの失敗は画面上部に表示し、集約データを使う区画は描画しない。ファネルなど独立APIの失敗は該当区画に表示する |
| 対象セレクタ | `DashboardPage.tsx` 内の `ScopeSelector` | チャンネル全体と動画選択を切り替える。選んだ内容は `selectedKey` で比べ、再取得しても選択を元に戻さない |
| KPI | `web/pages/dashboard/KpiCards.tsx` | 値、推移線、前期比（▲▼ の記号と色）、出典バッジ、M1 開示文 |
| 期間の判断 | `web/pages/dashboard/PeriodInsight.tsx` | 前期との変化と、次に日次推移を見る動画を表示する。前期が欠測なら変化率を保留し、動画候補は今期の値で判断する |
| 日次推移 | `web/pages/dashboard/TrendCard.tsx`、`web/components/EChart.tsx`、`web/components/echarts-setup.ts` | ECharts を `import()` で遅延読込する。今期は実線、前期は点線、公開日にマーカーを付ける。選択動画の線は最大5本に絞り、指定した1本へ焦点を移せる。表では全件を見られる |
| 動画別の実績 | `web/pages/dashboard/VideoPerformance.tsx` | 表（公開日順または視聴回数順）と構成比。CTRはReportingの最新日原値を表示し、期間未確定のStudio値へ推測で切り替えない。行を押すと、同じ期間を保ってダッシュボードの対象をその動画1本へ絞る。専用の動画画面は別 feature |
| 右列 | `web/pages/dashboard/SidePanels.tsx` | 最新AI分析と改善アクションの要約を出す。詳細画面へのリンクと編集・状態更新メニューは後続 feature 依存で、現在は「準備中」と表示する |
| 詳しく見る | `web/pages/dashboard/DetailsSection.tsx` | 週次ファネル、データ品質、収集済み原値・利用可能なレポート種別。構成比の再掲はしない。開いたときに初めてファネルを取得する |
| 共通の枠 | `web/components/AppShell.tsx`、`web/styles.css` | `PERIODS` に 7d を足し、期間切替では対象を保持する。ヘッダーとサイドバーをスクロール中も表示し、狭い画面では上下に重ならない高さを計測する |
| API 呼び出し | `web/api.ts` | 共通 `api` 関数から集約APIと独立APIを呼ぶ。サムネイルは自サイトの URL を使う |

## 2. サーバの層

`src/http/dashboard-routes.ts`（ルート）→ `src/usecases/dashboard.ts`・`funnel.ts`・`thumbnails.ts`（権限と組み立て）→ `src/repositories/dashboard-repository.ts`（SQL。すべて `tenant_id` で絞る）→ D1 と R2。期間の計算とファネルの判定は、副作用のない `src/domain/dashboard-period.ts` と `src/domain/funnel.ts` に置く。

## 3. API の契約

| API | 入力 | 応答 | ヘッダー |
|---|---|---|---|
| `GET /api/dashboard` | `period`（7d/28d/90d/1y/custom、省略時 28d）、`from`/`to`（custom のとき必須、最大365日）、`scope`（channel/videos）、`video_ids`（カンマ区切り、上限なし） | `period`、`scope`、`channel`、`collection`、`selection`、`kpis[4]`、`trend`（dates、current、previous、published、perVideo）、`videos`、`composition`（byVideo、byAngle、byFormat、byNewness、top3Share）、`latestReport`、`actions`、`empty` のフラグ、`canEdit` | `Cache-Control: private, no-store` |
| `GET /api/dashboard/funnel` | `week`（JST 月曜、完了した週だけ。省略時は直近の完了週） | 週の判定（actual/target/target_gap、または判定保留の理由）、12週の履歴、改善候補（非因果の注記つき） | `Cache-Control: private, no-store` |
| `GET /api/media/thumbnails/:video_id` | 動画 ID | 画像の本体（R2） | `Cache-Control: private, max-age=3600`、`X-Content-Type-Options: nosniff` |

- 入力検証は D1 に触れる前に行い、違反は 400 を返す。未ログインは 401。
- 他テナントの ID や存在しない `video_ids` は黙って除外する（qa-107）。サムネイルは、他テナント、30日超、未保存、不正な ID のどれでも同じ 404 を返し、存在の有無を区別させない。
- `app.ts` の `/api/*` 共通処理は既定で `no-store` を付ける。ルートが `private` で始まる Cache-Control を付けたときだけ、それを残す。
- 画面の「基本日次収集の最終成功」はチャンネルの基本日次系列だけの時刻。収集状態の失敗表示は基本日次・Reporting・属性のいずれかを含み、共通ヘッダーの「最終更新」とは別の値である。Analytics 日次の末日が未返却なら 0 として補わず、期間の判断欄の前期比較を保留する。
- 固定期間の末日は現行チャンネルの基本日次 all 系列で視聴回数がある最新日（JSTの昨日を上限）へ合わせる。日次データがなければJSTの昨日、任意期間なら指定日を使う。Analytics日次は太平洋時間の日付で、事業CSVのJST週へ変換して合算しない。
- 週次ファネルは、Studio合計の日次7日、M1に使う動画日次7日と各列の取込出典、週次事業CSVの鮮度を確認してから判定する。欠測や週末前の取込は保留する。判定条件の正本は [分析カタログ](../analysis/dashboard-analysis-catalog.md) の2.1節。

## 4. データモデル（`migrations/0016_dashboard_media_assets.sql`）

ダッシュボードが読む表を、database 章の列定義に沿って先に作る。書き込む処理は上流 feature が作り、列が足りなければ `ALTER TABLE ADD COLUMN` で引き継ぐ（migration の先頭に注記した）。

| 表 | 用途 |
|---|---|
| `videos`、`video_angles` | 動画の基本情報と切り口 |
| `daily_metrics`、`channel_daily_metrics` | チャンネルの日次の値（KPI、推移） |
| `video_metrics`、`video_daily_metrics`、`video_reach_daily` | 動画ごとの日次の値（選択時の合計、動画ごとの線、表、構成比） |
| `reports`、`findings` | 最新AI分析と発見3件 |
| `actions` | 実施中・効果測定中の改善アクション |
| `media_assets` | サムネイル（`asset_id = 'thumbnail:<video_id>'`）。thumbnail 行は `source_url` と `fetched_at` が必須（CHECK 制約） |
| `business_funnel_weekly`、`funnel_targets` | 週次の事業ファネルと目標 |

索引は主キーだけにした。D1 では索引の更新も書込行数に数えるため。例外は、取り直しと削除で使う `idx_media_assets_kind_fetched (tenant_id, kind, fetched_at)`。

`video_ids` は JSON 配列1個として `json_each(?4)` で展開し、1つのパラメータでバインドする。D1 の bound parameters の上限（100）に当たらない。

## 5. R2 と Queue と Cron

| 処理 | 実装 | 予算 |
|---|---|---|
| 取り直しの送信 | `enqueueThumbnailPasses`: 未保存 → URL が変わった動画 → `fetched_at` が25日を超えた動画の順に並べ、1通15件で送る | 1日3通まで。全テナント合計の送信回数は `src/usecases/queue-budget.ts` の `thumbnailSendsPerDay` が有効連携数から毎日決める（上限222回。固定分で予算を使い切る日は送らない）。1,100本を超えるテナントは公開日の新しい順に1,000本だけを対象にする |
| 取り直し（consumer） | `processThumbnailMessage`: 許可ホスト（`i*.ytimg.com`、`yt*.ggpht.com`、https）の画像だけを取得して R2 と `media_assets` に保存する。画像でない応答、エラー、リダイレクト、2MB 超は保存しない | 1通15件なので、1実行の subrequest（Workers Free で50件）に収まる。consumer は `max_batch_size = 1`、`max_retries = 2`、`retry_delay = 300` |
| 30日超の削除（Cron 役割①） | `purgeExpiredThumbnails`: `scheduled` の中で実行し、テナントごとに R2 の `delete()` を1回にまとめる | 1実行12テナントまで。残りは `thumbnail-retention` 通として60秒後に再送する（runbook 4.1） |

Cron は既存の `0 18 * * *`（UTC、JST 03:00）をそのまま使い、新しいトリガーは足していない。`wrangler.toml` には `THUMBNAIL_QUEUE`（producer）と `thumbnail-queue` の consumer を足し、`scripts/setup-cloudflare.sh` の Queue 作成にも `thumbnail-queue` を加えた。

## 6. 既存実装との境界と、上流 feature への引き継ぎ

| 相手 | 引き継ぐもの |
|---|---|
| feat-youtube-daily-collection | 収集完了後の `enqueueThumbnailPasses` 呼出しは `src/usecases/youtube-collector.ts` に接続済み。Queue/Cron の公開環境での稼働は未検証 |
| feat-csv-media-ingest | `video_metrics` などの CSV 由来の列と、`business_funnel_weekly` を書き込む。ダッシュボードは設定画面の取込区画（`/settings#imports`）へ移るだけ |
| feat-skill-analysis-reports | `reports` と `findings` を書き込む |
| feat-web-screens-actions | `actions` の状態遷移 API と操作画面は後続 feature の依存。現時点のダッシュボードは編集導線を準備中と示す |
| feat-settings-channel-link | チャンネルの解除時に動く `channel-cleanup` は、本 feature の新しい表を消さない。旧チャンネルの行は `channel_id` が違うので表示されないが、消す処理は上流の保持期間 feature で足す |
