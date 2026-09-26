# feat-dashboard-redesign 要件（SYS-DBR-P01）

> 本書の feature 境界は初回実装時点のもの。後続で収集・CSV取込を同じワークツリーに追加した。最新の実装範囲と残課題は `data-coverage-audit.md` を参照。

最終更新: 2026-09-25。正本は `system-spec/`（qa-089〜qa-099）と `features/feat-dashboard-redesign.context.json`。本書はそれを実装単位（区画、API、テスト）へ対応付ける。

## 1. 目的

`docs/screens/02-dashboard.png` の構成どおりにダッシュボードを作り直す。チャンネル全体と選んだ動画（既定は直近公開10本）の推移・前期比を切り替え、選んだ動画の寄与を全動画の構成比と並べて判断できるようにする。初期画面の問いは選択期間に合わせる。レイアウトは画像に合わせるが、配色は画像のティールを使わず、既存のインディゴ/マゼンタ（`web/styles.css` の CSS 変数）のままにする（qa-091）。

### 集計対象の契約（2026-09-25 再検証）

| 区画 | チャンネル全体のとき | 動画を選んだとき | 出典・分母 |
|---|---|---|---|
| KPI・日次推移 | 公式チャンネル日次 | 選択動画の合計と個別線 | 視聴回数・再生時間は YouTube API。公式チャンネル値には現在の動画一覧にない動画の分も含み得る |
| 動画表 | 直近公開10本（既定） | 選択動画 | 視聴回数はYouTube API。CTRはReporting原値の最新日を表示し、未提供時のStudio値はCSV期間が確定して選択期間と一致する場合だけ使う。現行の表CSVは期間未確定なので保留する |
| 構成比・選択動画の寄与 | 全動画 | 全動画を比較基準に選択動画の寄与を表示 | 分母は現存動画の `video_metrics` の合計。公式チャンネル KPI の分母と混ぜない |
| 最新AI分析・改善アクション・週次ファネル | チャンネル全体 | チャンネル全体のまま | 表示期間・選択動画から独立した最新/週次情報として明示 |
| 視聴率 | 対象期間の長尺 | 選択した長尺 | 現行日次CSVの平均視聴率を視聴回数で加重した代理値。正式M1に必要な再生時間・動画長は取込 feature の依存 |

動画行からは期間を保ったまま対象をその1本へ絞る。専用の動画分析画面は別 feature。選択本数の上限は設けず、グラフ上の個別線だけを絞り、表には全件を残す。共通ヘッダーとサイドバーはページをスクロールしても表示する。

## 2. 利用者の決定（qa 番号対応表）

| qa | 論点 | 決定 | 実装での扱い |
|---|---|---|---|
| qa-089 | 既存の仕様・実装との差分 | 仮画面（テナント名と役割だけ）を置き換える | `web/pages/DashboardPage.tsx` を全面的に書き換える |
| qa-090 | 画像と週次売上ファネルの両立 | 初期表示は画像どおりにし、ファネル一式は「詳しく見る」へ移す（判定ロジックは残す） | `DetailsSection` のファネル区画、`GET /api/dashboard/funnel` |
| qa-091 | 配色 | 既存のインディゴ/マゼンタ | 新しい色トークンは足さない |
| qa-092 | 詳細仕様（ヘッダ、KPI、グラフ、表、空状態、API、セキュリティ） | プレビューどおりに承認 | 本書 3〜5 節 |
| qa-093 | 集計の単位 | 対象セレクタ「チャンネル全体（既定）/動画を選ぶ」。動画を選んだときは合計を出し、推移に動画ごとの線を重ねる | `scope=channel\|videos`、`ScopeSelector` |
| qa-094 | 動画の選び方 | 公開日の新しい順に直近10本を既定で選ぶ | `DEFAULT_SELECTION = 10` |
| qa-095 | サムネイルの配信元 | 自サイト経由で配る。CSP の `img-src 'self' data:` は変えない | `GET /api/media/thumbnails/:video_id`、R2 と `media_assets` |
| qa-096 | 本数の上限 | 上限なし（11本以上も選べる） | `video_ids` を json_each で1パラメータにバインドする |
| qa-097 | 他テナントの動画 ID | 黙って除外し、自テナント分だけで 200 を返す | `requestedIds.filter(known.has)` |
| qa-098 | サムネイルの取り直しと削除の予算 | 1通15件、1日3通まで。25日を超えたら取り直し、30日を超えたら削除。1,100本を超えるテナントは1,000本まで。削除は1実行12テナントまで | `src/usecases/thumbnails.ts` の定数 |
| qa-099 | 期間切替の置き場所 | 共通ヘッダーに統一し、7日を足す（7d/28d/90d/1y/custom、既定は 28d、任意は最大365日）。ページ内に期間タブは置かない | `AppShell` の `PERIODS`、`src/domain/dashboard-period.ts` |

## 3. 区画順の対応表（画像 → 実装）

| # | 画像の区画 | コンポーネント | 取得元 |
|---|---|---|---|
| 1 | ヘッダ（パンくず、見出し、役割、データ収集の時刻、CSV取込ボタン） | `DashboardPage` の `header.dashboard-header` | `/api/dashboard` の `collection.lastSucceededAt`、`canEdit` |
| 2 | 期間 | 共通 `AppShell` ヘッダー（`?period=`） | URL |
| 3 | 対象セレクタ | `ScopeSelector` | `videos`（候補一覧） |
| 4 | 選択期間に応じた問い | `.dashboard-question` | `period` |
| 5 | KPI 4枚 | `KpiCards` | `kpis` |
| 6 | この期間の判断 | `PeriodInsight` | `kpis`、`trend`、`videos` |
| 7 | 日次推移 | `TrendCard`（ECharts を遅延読込） | `trend` |
| 8 | 動画別の実績と構成比 | `VideoPerformance` | `videos`、`composition` |
| 9 | 最新AI分析、実施中の改善アクション | `SidePanels` | `latestReport`、`actions` |
| 10 | 詳しく見る（週次ファネル、データ品質、収集済み原値・レポート種別） | `DetailsSection` | 構成比の内訳は #8 に一本化。ファネルは区画を開いたときに `/api/dashboard/funnel` から取得する |

## 4. 期間を `?period=` に統一したことの対応

| 項目 | 内容 |
|---|---|
| 選択肢 | 7d / 28d / 90d / 1y / custom（custom は `from` と `to` が必須） |
| 既定 | `?period=` を省略したときは 28d |
| 範囲 | 固定期間は現行チャンネルの基本日次（all系列・視聴回数あり）の最新日までの N 日（上限はJSTの昨日、データなしならJSTの昨日）。任意期間は指定日を維持。前期は直前の同じ日数。Analytics日次の太平洋時間と事業CSVのJST週は混ぜない |
| 400 になる入力 | 許可外の period、custom の366日以上、`from > to`、日付の形式違反 |
| 対象の保持 | `scope` と `video_ids` はダッシュボード固有のクエリ。ヘッダーの期間リンクは既存のクエリを残して `period` だけを差し替える |

## 5. 受入13項目の対応表

| # | 受入項目（要約） | 根拠 | 区画 / API | 検証方法 |
|---|---|---|---|---|
| AC1 | 画像と同じ区画順、既存配色 | qa-089〜092 | `DashboardPage` | E2E E1、スクリーンショット |
| AC2 | 期間5種、既定 28d、400 の条件、対象を保つ | qa-099 | `resolvePeriod`、`AppShell` | 単体 domain、dashboard-api、E2E E2 |
| AC3 | 動画選択は直近10本が既定、上限なし、合計と動画ごとの線 | qa-093/094/096 | `ScopeSelector`、`TrendCard` | 単体 dashboard-api、E2E E3 |
| AC4 | 動画別の実績、並べ替え、構成比（上位+その他、切り口、形式、新旧、上位3本の占有率） | qa-092 | `VideoPerformance`、`buildComposition` | 単体 domain・dashboard-api、E2E E4 |
| AC5 | KPI の出典バッジと M1 開示文、前期比を記号と色で出す | qa-092 | `KpiCards` | E2E E1 |
| AC6 | ファネルは開いたときだけ取得し、従来の判定を出す | qa-090 | `DetailsSection`、`getFunnel` | 単体 funnel-api、E2E E5 |
| AC7 | 空状態5種 | qa-092 | 各区画の空表示 | 単体 dashboard-api（notLinked、noCsv ほか） |
| AC8 | 閲覧者には書込の操作を出さない。他テナントの ID は黙って除外する | qa-097 | `canEdit`、`requirePermission` | 単体 dashboard-api、E2E E6・E7 |
| AC9 | Cache-Control、CSP、サムネイルの自サイト配信 | qa-095 | `dashboard-routes.ts` | 単体 thumbnails、E2E E1 |
| AC10 | 360px で横スクロールなし、3サイズの E2E | frontend | `web/styles.css` | E2E E8、3プロジェクト |
| AC11 | `video_ids` が101本以上でも 200 | qa-098 | `DashboardRepository`（json_each） | 単体 dashboard-api |
| AC12 | thumbnail 通の subrequest が50件以内、取り直しの順序、30日で削除 | qa-098 | `enqueueThumbnailPasses`、`processThumbnailMessage`、`purgeExpiredThumbnails` | 単体 thumbnails |
| AC13 | 1,100本を超えるテナントは1,000本まで | qa-098 | `enqueueThumbnailPasses` | 単体 thumbnails |

## 6. 対象外

- YouTube データの収集と収集時刻の変更（feat-youtube-daily-collection）。thumbnail 通を送る `enqueueThumbnailPasses` は本 feature で作成し、後続で収集ジョブに接続済み（`src/usecases/youtube-collector.ts`）
- Studio CSV と週次事業 CSV の取込処理（feat-csv-media-ingest）。ダッシュボードは設定画面の取込区画へ移動するだけ
- AI 分析レポートの生成（feat-skill-analysis-reports）
- 動画、AI分析、改善アクション、設定の各画面の本体と、actions の状態遷移 API（feat-web-screens-actions）
- 画像のティール配色、`i.ytimg.com` からの直接表示と CSP の拡張
