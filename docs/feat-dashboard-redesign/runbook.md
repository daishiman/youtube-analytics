# feat-dashboard-redesign 運用手順（SYS-DBR-P12）

最終更新: 2026-09-26。

## 1. サムネイルの取り直し（thumbnail 通）

- 送るのは `enqueueThumbnailPasses(deps, tenantId)`。未保存 → URL が変わった動画 → `fetched_at` が25日を超えた動画の順に並べ、1通15件、1日3通までを `thumbnail-queue` へ送る。全テナント合計の1日の送信回数は `thumbnailSendsPerDay`（`src/usecases/queue-budget.ts`）が有効連携数から毎日決め、上限は222回。固定分で予算を使い切る日は送らない。
- 受けるのは `processThumbnailMessage`。許可ホスト（https の `i*.ytimg.com`、`yt*.ggpht.com`）の画像だけを取得し、R2 と `media_assets` に保存する。リダイレクト、画像以外、2MB 超は保存しない。consumer は `max_batch_size = 1`、`max_retries = 2`、`retry_delay = 300`。
- 1,100本を超えるテナントは、公開日の新しい1,000本だけを対象にする。それより古い動画は代替表示のまま。
- **現状**: `src/usecases/youtube-collector.ts` が収集完了後に送信を呼ぶ。画像の取得・表示と Queue の再試行は公開環境で未検証。seed に画像はないため、ローカル画面は代替表示。

## 2. 30日を超えた画像の削除（Cron 役割①）

- 既存の Cron（`0 18 * * *`、JST 03:00）の `scheduled` の中で `purgeExpiredThumbnails` が動く。30日を超えた行と R2 の原本を、テナントごとに `delete()` 1回で消す。1回の実行は12テナントまでで、残りは `channel-cleanup-queue` へ `thumbnail-retention` 通として60秒後に送り直し、消し終わるまで続ける（`src/index.ts` の `CLEANUP_RUNS["thumbnail-retention"]` と `runCleanup`）。
- YouTube API の規約（III.E.4）で、取得した画像は30日を超えて持てない。30日を超えた画像は削除前でも配信しない（404 → 画面は代替表示）。
- ローカルで試すとき: `curl 'http://localhost:8791/cdn-cgi/local/scheduled?format=json'`。

## 3. 本番へ反映する（P13。利用者の明示の指示があるまで実行しない）

2026-09-25 時点で未実行。commit・push・PR の後、利用者の指示を受けてから次の順で行う。

1. Queue を作る: `bash scripts/setup-cloudflare.sh`（`thumbnail-queue` が無ければ作る。ほかの資源は作成済みなら飛ばす）。
2. D1 にテーブルを足す: `pnpm db:migrate:remote`（未適用の migration を番号順に適用する。本 feature の分は 0016〜0029。main の AI分析の 0008〜0015 が未適用なら先に入る。0016 は表を足し、`media_assets` に2列と trigger を足すだけで、既存の行は変えない）。
3. deploy: `pnpm deploy`。
4. 確認: 本番の URL でダッシュボードを開き、acceptance.md の手順 1〜10 を試して、公開環境の列を埋める。`/api/dashboard` の応答が `Cache-Control: private, no-store` で、CSP の `img-src` が変わっていないこと。

戻すとき: 画面とコードは前の版を deploy し直す。0016 以降は表と列の追加だけで既存の行を変えないので、残したままでよい。

## 4. 監視

### 4.1 定期処理の一覧

起点はすべて Cron（`0 18 * * *`、JST 03:00）の `scheduled`（`src/index.ts`）。Queue の消費は `collect-queue` と `channel-cleanup-queue` が同じ Worker。

| 処理 | いつ・どう動くか | 止まったら見るもの |
|---|---|---|
| 日次収集（`collect`） | Cron が有効な連携ごとに `collect-queue` へ送る。一時失敗は600秒後に再試行し、4回目以降の失敗か再試行しない失敗で記録して終える | `collection_series_status` の `failed`、ログの `collection failed` / `collection retry` |
| Reporting 同期・Analytics 多次元（`reporting`、`analytics-dimensions`） | 日次収集と同じ Cron で `collect-queue` へ送る。Reporting は続きがあれば次の通を自分で送る。許可の取り消しを検知したらチャンネル削除を予約する | 同上。許可不足は `permission_required` として `failed` になる |
| 字幕（`captions`） | 日次収集の中で対象動画ごとに `collect-queue` へ送る | ログの `collection failed`（字幕は `collection_series_status` に記録しない） |
| サムネイル（`thumbnail`） | 日次収集の完了後に `thumbnail-queue` へ送る（1節） | 1節と4.2 |
| チャンネル解除の削除（`cleanup`） | Cron が毎日送り直し、残りがあれば60秒後に再送 | ログの `channel cleanup overdue`。手順は `docs/feat-settings-channel-link/runbook.md` の5節 |
| API 由来データ・Reporting 原本・字幕の保持期限削除（`retention`） | Cron が毎日送り、残りがあれば60秒後に再送 | `channel-cleanup-queue` の失敗ログ |
| テナント削除（`tenant-cleanup`） | Cron が毎日送り、残りがあれば60秒後に再送 | ログの `tenant cleanup overdue` |
| 30日を超えた画像の削除（`thumbnail-retention`） | Cron の中で直接実行し、残りは60秒後に再送（2節） | `media_assets` に30日を超えた行が残っていないか |

Queue の再試行回数と間隔は `wrangler.toml` の consumer 設定が正本。

### 4.2 サムネイルと D1

- `thumbnail-queue` の失敗（`max_retries` を超えたもの）は Workers のログに出る。多いときは、許可ホストの外への変更や、2MB を超える画像がないかを見る。
- D1 の書込行数が増えたときは、`idx_media_assets_kind_fetched` 以外に索引を足していないかを確かめる（索引の更新も書込行数に数える）。

## 5. ローカルで画面をテストする

### 5.1 起動

```bash
pnpm install
pnpm db:migrate:local            # 0029 までを適用
pnpm db:seed:local               # 何度流しても同じ状態に戻る
pnpm dev --var DEV_LOGIN:1 --var TOKEN_ENC_KEY:local-only-not-secret
# http://localhost:8791 。.dev.vars に DEV_LOGIN=1 と TOKEN_ENC_KEY を書いておけば `pnpm dev` だけでよい
```

### 5.2 テストアカウント（パスワードなし。ログイン画面で同意にチェックし、「開発用ログイン」にメールを入れるだけ）

| メール | テストチャンネルA | 別チャンネルB | ダッシュボードで見えるもの |
|---|---|---|---|
| owner@example.com | オーナー | 閲覧者 | 全区画と「CSVをアップロード」。レポート詳細は AI分析画面へ移る。アクション編集は準備中 |
| editor@example.com | 編集者 | — | オーナーと同じ（書込ボタンあり） |
| viewer@example.com | 閲覧者 | — | 数値は同じ。「CSVをアップロード」は出ない。レポート詳細は AI分析画面へ移る。アクション編集は準備中 |
| other-owner@example.com | — | オーナー | 未連携の空状態（「設定を開く」） |
| partial@example.com | — | — | 自分がオーナーのチャンネルP（YouTube の許可が一部だけ）。ログイン画面の機能の確認用で、ダッシュボードは空状態 |

seed が入れるデータ（テストチャンネルA）: 動画12本（長尺9、Shorts 3。公開は2〜110日前）、直近90日の日次指標、CSV 由来の視聴率、AI 分析レポート2版（ダッシュボードはアーカイブされていない最大の版＝第2版「8月の振り返り」と発見3つを出す）、効果測定中の改善アクション1件、週次ファネルと目標。日付は `date('now', …)` の相対指定なので、いつ流しても直近のデータになる。サムネイル画像は入れていないので、画面は頭文字の代替表示になる。

### 5.3 画面テストの流れ

1. **ログイン**: http://localhost:8791/login → 同意にチェック →「開発用ログイン」に `owner@example.com` → ダッシュボード。
2. **区画の並び**: 上から、パンくずと選択期間に応じた問い、対象セレクタ → KPI 4枚 → この期間の判断 → 日次推移 → 動画別の実績と右列（最新AI分析、改善アクション）→ 詳しく見る。見本は `docs/screens/02-dashboard.png`。現在の区画契約は `system-spec/ui-ux.md` の最新決定を参照。
3. **期間**: 共通ヘッダーで 7日 → 28日 → 90日 → 1年。固定期間の末日は基本日次の最新収集済み日（JSTの昨日を上限）で、画面の対象期間と推移の横軸が揃う。日次データがなければJSTの昨日を使う。「任意」で開始日と終了日を入れて「適用」すると指定日は動かない。366日以上にすると赤いエラーが出る。
4. **動画選択**: 「動画を選ぶ」→ 直近10本にチェックが入っている。外す、足す（12本すべて）を試す。KPI が選んだ動画の合計になり、推移に動画ごとの線が出る。期間を変えても選択が残る。URL をコピーして別タブで開くと同じ表示になる。
5. **KPI と期間の判断**: 出典バッジ（API、CSV）、M1 の開示文、前期比の記号（▲▼→）と色。末日などの日次値が欠ける期間では、欠測を0回とせず「この期間の判断」の前期比較を保留する。
6. **日次推移**: 今期は実線、前期は点線、公開日にマーカー。文字の要約と、表への切替。
7. **動画別の実績**: 並べ替え（公開日の新しい順、視聴回数の多い順）、「表」と「構成比」の切替。構成比の上位5本＋その他、切り口、Shorts と長尺、新旧、上位3本の占有率。行を押すと期間を保ってダッシュボードの対象がその動画1本になる。
8. **右列**: 最新AI分析の題名・版・結論・発見と、改善アクションの指標の基準値 → 結果値を確認する（期間は出さない）。「レポートの詳細を見る」を押すと AI分析画面でそのレポートが開く。AI分析画面でその版をアーカイブすると、ダッシュボードは1つ前の版を出す。アクションの編集・状態更新は「準備中」と表示され、操作リンクは出ない。
9. **詳しく見る**: 週次ファネル、データ品質、流入・端末・地域の原値、利用可能なレポート種別。構成比は動画別の実績だけに表示する。「詳しく見る」を開いたときに初めて `/api/dashboard/funnel` を要求する（開発者ツールのネットワークで確認）。
10. **閲覧者**: アカウントメニューからログアウト → `viewer@example.com` →「CSVをアップロード」が出ない。編集メニューは準備中のため、ほかの役割にも出ない。
11. **未連携**: `other-owner@example.com` →「YouTube チャンネルがまだ連携されていません」。
12. **テナント切替**: `owner@example.com` でアカウントメニューから別チャンネルB（閲覧者）に切り替える → B は未連携なので「YouTube チャンネルがまだ連携されていません」になり、閲覧者なので「設定を開く」以外の書込ボタンは出ない。A に戻すと元の表示に戻る。
13. **サイズ**: 開発者ツールで幅を 360、390、820、1440 に変え、横スクロールが出ないこと。

画面のコードを変えたら `pnpm build:web` を流す（`pnpm dev` は起動時に1回だけビルドする）。自動の画面テストは `pnpm e2e`（8791 を使う。別の作業で使っているなら `E2E_PORT=8792 pnpm e2e`）。E2E はローカル D1 を書き換えるので、あとで `pnpm db:seed:local` を流す。
