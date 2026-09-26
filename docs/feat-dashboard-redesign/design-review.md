# feat-dashboard-redesign 設計レビュー（SYS-DBR-P03）

> 本書は初回ダッシュボード設計時点の記録。後続で日次収集とサムネイル送信を追加した。現況は `data-coverage-audit.md` を参照。

最終更新: 2026-09-25。テナント境界、キャッシュ、CSP、Cron と Queue の予算について、観点ごとに対策と判定、是正先を記録する。根拠章は security、backend、infrastructure（qa-095、qa-097、qa-098、qa-099）。

## 観点 × 判定

| # | 観点 | 対策（実装箇所） | 判定 | 是正先 |
|---|---|---|---|---|
| R1 | 他テナントの数値を読む | すべての SQL を `tenant_id` とセッションのテナントで絞る（`DashboardRepository` のコンストラクタが `TenantContext` を受け取る）。`video_ids` は自テナントの動画の一覧と突き合わせ、無いものは黙って除外する（qa-097） | 対策済み（単体・E2E E7） | — |
| R2 | 動画 ID で他テナントの動画の有無を探る | 除外しても応答の形は変わらない。サムネイルは、他テナント、期限切れ、未保存、形式違反のどれでも同じ 404 | 対策済み（単体） | — |
| R3 | 閲覧者が書き込む | ダッシュボードの3つの API はすべて読み取り（`tenant.read`）。画面は `canEdit`（`content.write`）が false なら CSVアップロードボタンと「…」メニューを出さない。actions の書込 API は feat-web-screens-actions の担当で、サーバ側で編集者以上を強制する | 対策済み（単体・E2E E6） | 書込 API は feat-web-screens-actions |
| R4 | 利用者ごとの応答が共有キャッシュに残る | `/api/dashboard` と `/api/dashboard/funnel` は `private, no-store`、サムネイルは `private, max-age=3600`。`/api/*` の共通処理は `private` 以外を `no-store` で上書きする | 対策済み（単体） | — |
| R5 | サムネイルのために CSP を緩める | 自サイト経由（`/api/media/thumbnails/:id`）で配るので、`img-src` は既存のまま（`'self' data:` と、前の feature で入れたチャンネルアイコン用の `yt3` ホスト）。`i.ytimg.com` は足していない（qa-095） | 対策済み（`security-headers.ts` と `public/_headers` に差分なし） | — |
| R6 | サムネイルの取得を踏み台にした SSRF | 取得先は https の `i*.ytimg.com` と `yt*.ggpht.com` だけ。リダイレクトは追わず、画像以外の Content-Type と 2MB 超は保存しない | 対策済み（単体） | — |
| R7 | AI要約や動画タイトルによる XSS | React のテキスト描画だけを使い、`dangerouslySetInnerHTML` を使わない。ECharts のツールチップは既定の書式器（HTML を組み立てない） | 対策済み（コード確認） | — |
| R8 | Workers Free の subrequest（1実行50件）を超える | thumbnail 通は1通15件に固定し、consumer は `max_batch_size = 1`。取得の fetch と R2 の put、D1 を足しても50件に収まる | 対策済み（単体「1通の件数は上限までに切り詰める」） | — |
| R9 | Queue の日次操作の無料枠（1万）を超える | 送信は1日3通まで。既存の収集と削除の通に使う分を引いた `QUEUE_DAILY_OPS_BUDGET` を超える見込みなら翌日に回す | 対策済み（単体）（後に `QUEUE_DAILY_OPS_BUDGET` は廃止し、`src/usecases/queue-budget.ts` の全処理を含む見積もりへ置き換えた。R10 の「残りは翌日」も60秒後の再送に変わった） |
| R10 | Cron 1回の処理が長くなる | 30日超の削除は1実行12テナントまで、テナントごとに R2 の `delete()` を1回にまとめる。残りは翌日 | 対策済み（単体） | — |
| R11 | D1 の bound parameters の上限（100）で、101本以上の選択が失敗する | `video_ids` は JSON 配列1個を `json_each` で展開し、1パラメータでバインドする | 対策済み（単体: 105本で 200） | — |
| R12 | YouTube API 規約（III.E.4）の30日を超えて画像を保持する | 25日で取り直し、30日を超えたら表示せず（404 → 代替表示）、Cron 役割①で R2 と行を消す | 対策済み（単体） | — |
| R13 | 不正な期間で重い集計を走らせる | 期間は5種だけ。custom は最大365日。検証は D1 に触れる前に行い、違反は 400 | 対策済み（単体） | — |

R3 の「…」メニューは初回設計時点の記録。現在の `SidePanels` はどの役割にも編集メニューを出さず、詳細画面と編集・状態更新を「準備中」と表示する。公開環境の権限判定は引き続き未検証。

## 残るリスク

- 初回レビュー時点では thumbnail 通の送信元が未接続だった。後続で `src/usecases/youtube-collector.ts` に接続済み。seed は画像を入れていないためローカル画面は代替表示になり、公開環境での Queue・R2・配信経路の稼働は未検証。配信の経路（自テナント、30日、404、キャッシュ）は thumbnails の結合テストで確認した。
- 解除した旧チャンネルの行は `channel_id` が違うので表示されないが、`channel-cleanup` はまだ新しい表を消さない。保持期間の feature（feat-retention-ops）で消去の対象に加える。
