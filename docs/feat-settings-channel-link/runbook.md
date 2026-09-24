# feat-settings-channel-link 運用手順（SYS-SCL-P12）

最終更新: 2026-09-24。基盤（Cloudflare の資源、Google OAuth クライアント、Secrets の登録）は `docs/feat-platform-tenant-auth/runbook.md` を先に済ませておく。本書は、設定画面とチャンネル連携で増えた作業だけを書く。

## 1. Google Cloud の追加設定（初回だけ）

1. 「API とサービス」→「ライブラリ」で **YouTube Data API v3** と **YouTube Analytics API** を有効にする。
2. 「OAuth 同意画面」→「データアクセス」に、次のスコープを足す。
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/yt-analytics.readonly`
   - `https://www.googleapis.com/auth/youtube.force-ssl`（字幕の自動取得用。4 節の検証が必要）
3. 「認証情報」→「OAuth クライアント ID」（種類: ウェブ アプリケーション）の「承認済みのリダイレクト URI」に、次を足す。
   - `https://youtube-analytics.daishimanju.workers.dev/api/oauth/callback`
   - `http://localhost:8792/api/oauth/callback`（ローカルで本物の Google を試すとき。起動したポートに合わせる）
4. 「OAuth 同意画面」の公開ステータスを「本番環境」にする。「テスト」のままだと許可が7日で切れて、毎週「要再連携」になる。
5. 表示されたクライアント ID とシークレットを、設定画面「YouTube連携」→「Google Cloud の接続情報」に登録する（オーナーのみ）。

**qa-087 以降、1〜5 はテナントごとの作業**になった。各テナントのオーナーが自分の Google Cloud プロジェクトで行う（API の利用枠もそのプロジェクトのものを使う）。画面の「Google Cloud Console での準備手順」に同じ内容がある。アプリ共通のクライアント（`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`）はログイン専用で、リダイレクト URI は `/api/auth/callback` のまま。

## 2. D1 のテーブルを増やす

初回は `scripts/setup-cloudflare.sh` で D1・R2 と `collect-queue`・`channel-cleanup-queue` を作る。Cloudflare Queue は Worker へのバインディングより先に実体が必要。既存環境に cleanup Queue だけ足す場合は `pnpm exec wrangler queues create channel-cleanup-queue` を実行する。資源の作成や本番 migration は公開作業時に行い、このローカル検証では実行していない。

```bash
pnpm db:migrate:local    # ローカル
pnpm db:migrate:remote   # 本番（通常は deploy.yml が自動で実行する）
```

`migrations/0004_settings_channel_link.sql` 以降の設定関連 migration は追加・保護用で、既存の行は消さない。チャンネル削除ジョブと取込中の競合を防ぐため、Queue consumer を有効にする前に最新 migration まで適用する。

`0007_channel_cleanup_write_gate.sql` は未完了の旧予約を世代0の削除対象にし、予約履歴があるテナントの新規取込を世代1へ移す。すでに完了した旧予約は当時の R2 キーに旧/新の印がないため、後続sweepから除外する。

## 3. 無料枠の表示（Cloudflare の値）

Cloudflare の3項目（D1 の容量、R2 の容量、Workers のリクエスト）を出すには、次の2つが要る。未設定なら、その3項目は「取得できません」と表示されるだけで、ほかは動く。

| 名前 | 種類 | 入れ方 |
|---|---|---|
| `CF_ACCOUNT_ID` | 非秘密 | `wrangler.toml` の `[vars]` のコメントを外して値を入れる（`pnpm wrangler whoami` で確認できる） |
| `CF_ANALYTICS_TOKEN` | 秘密 | Cloudflare の My Profile → API Tokens →「Create Custom Token」→ 権限は **Account / Account Analytics / Read** だけ、対象アカウントを限定して発行 → `pnpm wrangler secret put CF_ANALYTICS_TOKEN` |

値は1時間キャッシュする（`usage_snapshots`）。取得に失敗したときは、前回の値を出し続ける。

**トークンを入れ替える**: 新しいトークンを発行 → `secret put` で上書き → 画面の無料枠が1時間以内に更新されることを確かめる → 古いトークンを Cloudflare で削除する。

## 4. 字幕の自動取得（force-ssl）を公開する

`youtube.force-ssl` は Google の機密スコープなので、一般公開の前に OAuth の検証が要る。検証が通るまでの設定は次のとおり。

| 状態 | 設定 | 画面 |
|---|---|---|
| 検証前（既定） | `FORCE_SSL_VERIFIED = "0"` | 運営テナントのオーナーだけトグルを操作できる。ほかのテナントは「準備中」 |
| 運営テナントで試す | `[vars] OPERATOR_TENANT_ID = "<運営テナントの tenant_id>"` | 同上 |
| 検証後 | `FORCE_SSL_VERIFIED = "1"` | 全テナントのオーナーが操作できる |

手順:

1. Google Cloud コンソール →「OAuth 同意画面」→「検証センター」で、force-ssl を使う理由（「オーナーの動画の字幕を1日5本まで取得して分析する」）とデモ動画を提出する。
2. 通るまでは運営テナントだけで試す。tenant_id は `pnpm wrangler d1 execute youtube-analytics-db --remote --command "SELECT tenant_id, name FROM tenants"` で確認する。
3. 通ったら `wrangler.toml` を `FORCE_SSL_VERIFIED = "1"` にして PR → merge で公開する。
4. 戻すとき（検証が取り消されたとき）は `"0"` に戻す。すでに ON のテナントは、字幕の取得が止まるだけで、連携は切れない。

## 5. チャンネルを変更する（オーナーから依頼されたとき）

同じテナントで別のチャンネルに切り替える機能はない（データの混在を防ぐため）。次の順で行う。

1. オーナーが設定画面の「連携解除」を押し、テナント名を入れて確定する。Google の許可は revoke され、旧チャンネルのデータ削除予約が作られる。`due_at` は受付から7日以内の期限であり、削除完了日ではない。
2. 予約後、専用 Queue が旧チャンネルの D1 データ（CSV等の `imports` 履歴を含む）とテナント配下の R2 原本を削除する。`imports` に参照されない孤立 R2 原本も対象。全対象の消去を確認した後だけ `data_deletions.done_at` が入る。失敗時は Queue が再試行し、毎日の Cron も未完了予約を再通知する。未完了中は連携操作と新規取込が止まる。
3. 削除完了を確認してから新しいチャンネルで「YouTubeと連携」を押す。新しいチャンネルが別テナントに連携済みなら `CHANNEL_ALREADY_LINKED` で止まる。その場合は、当該テナントのオーナーに解除してもらう。
4. 監査ログに `youtube.disconnect` と `youtube.connect` が1件ずつ残る。

```bash
pnpm wrangler d1 execute youtube-analytics-db --remote \
  --command "SELECT action, detail, at FROM audit_log WHERE tenant_id = '<tenant_id>' ORDER BY at DESC LIMIT 10"
```

削除完了の確認では、監査ログだけでなく `data_deletions.done_at` と旧 `imports` 行、旧世代の R2 原本の消去を確認する。`done_at` は、その時点で旧世代の対象が空だった証跡である。HTTP の取込リクエストには時間上限がないため、極端に遅れた R2 書込が後から着地する可能性は残る。原本キーを世代で隔離し、毎日の Cron で完了済み旧世代も再走査して消す。新しいチャンネルの原本には触れない。

ジョブは `channel-cleanup-queue` の専用 consumer（1通ずつ・同時実行1）で、失敗時は60秒間隔で最大10回再試行する。毎日03:00 JST（前日18:00 UTC）の Cron は cleanup 通を送り直す。予約直後の Queue 送信に失敗しても予約と連携解除は成立し、Cron が回収する。ローカルでは `curl 'http://localhost:8793/cdn-cgi/local/scheduled?format=json'` でCronを手動起動できる。

期限監視では、`data_deletions` の `scope='channel' AND done_at IS NULL AND due_at <= 現在時刻` を確認する。期限が近い、または過ぎた予約は Workers Logs と Queue の失敗記録を確認し、再試行を妨げる R2/D1 障害を解消する。取込中の記録が残り続ける場合も調査する。テナント全削除と30日保持の自動化は別の縦切りで実装する。

## 6. ローカルで画面をテストする

### 6.1 起動

```bash
cp .dev.vars.example .dev.vars   # 初回だけ。TOKEN_ENC_KEY を入れ、DEV_LOGIN=1 と OPERATOR_TENANT_ID=seed-tenant-a のコメントを外す
pnpm db:migrate:local
pnpm db:seed:local               # 何度流しても同じ状態に戻る
pnpm dev                         # http://localhost:8791（8791 が使用中なら pnpm wrangler dev --port 8792）
```

### 6.2 テストアカウント（パスワードなし。ログイン画面の「開発用ログイン」にメールを入れるだけ）

| メール | テストチャンネルA | 別チャンネルB | 設定画面で見えるもの |
|---|---|---|---|
| owner@example.com | オーナー | 閲覧者 | 6区画すべてと全ボタン。字幕トグルも操作できる（運営テナント） |
| editor@example.com | 編集者 | — | 取込とトークンの発行はできる。YouTube連携と削除のボタンはない。メンバー区画は出ない |
| viewer@example.com | 閲覧者 | — | 表示だけ。メンバー区画と書込ボタンが出ない |
| other-owner@example.com | — | オーナー | 未連携のテナント。「YouTubeと連携」ボタンと「準備中」の字幕トグル（接続情報を登録するまでボタンは押せない） |
| invitee@example.com | （招待中: 編集者） | — | 招待リンク `/invite?token=local-invite-editor-0000000000000000000000000` で参加 |

seed が入れるデータ（テストチャンネルA）: 連携済みチャンネル（登録者 12,345 人、正常）、取込履歴4件（完了2、失敗1、処理待ち1）、owner のトークン2本（自宅のMac、会社のノートPC）、Cloudflare 容量・リクエストの使用量キャッシュ、監査ログ3件。YouTube API・D1書込・字幕取得は実測処理がないため「未取得」。

### 6.3 画面テストの流れ

1. **ログイン画面**: http://localhost:8792/login を開く。下にフッター（3つのバッジ、プライバシーポリシー、利用規約）がある。リンクから /privacy と /terms を開くと、同じフッターが出る。
2. **オーナーで入る**: 同意にチェック →「開発用ログイン」に `owner@example.com` → ダッシュボード。左のサイドバー（幅900px未満では下のタブ）に5項目、上のヘッダーに画面名とアカウントメニューがある。
3. **設定画面の並び**: 「設定」を開く。上から YouTube連携 → データ取込 → Claude Code連携トークン → メンバー → 無料枠の使用状況 → データを削除。
4. **YouTube連携**: 「テストチャンネルA」「正常」「登録者数 12,345」「次回収集 毎日 3:00 JST」が出る。先頭の「Google Cloud の接続情報」は「未登録」で、「再連携」と字幕トグルは押せず、注意文が出る（seed はクライアントを入れていない）。
   - **接続情報の登録**: クライアント ID に `123456789012-localtest.apps.googleusercontent.com`、シークレットに `GOCSPX-local-test-secret`（どちらも形式だけ正しいダミー）を入れて「登録」→「登録済み」になり、シークレットは「登録済み（表示しません）」と出る。「再連携」が押せるようになる。
   - 「再連携」を押すと Google の同意画面へ移る。ダミーのクライアントでは Google がエラーを出す（本物を試すときは、1 節で作ったクライアントを登録する）。戻るボタンで戻る。
   - 「変更」でクライアント ID を別の値にして保存すると、チャンネルが「要再連携」になる。「削除」でも同じ。確かめたあとは `pnpm db:seed:local` で戻す。
5. **字幕トグル**: ON にすると、Google の追加同意の画面へ移る（同上）。
6. **データ取込**: 種類を選び、ファイルをドロップするか選ぶ。拡張子の違うファイル（例: .txt を CSV で）は拒否される。履歴の `broken.csv` に失敗理由が出る。
7. **トークン**: 「新しいトークンを発行」→ 名前が空だと発行できない →「テスト」と入れて発行 → 平文が1回だけ出る →「コピー」で「トークンをコピーしました。」→ 閉じると二度と出ない。一覧は3本になる。あと2本発行して5本にし、6本目を発行すると「トークンは1人5本まで発行できます」。不要なものは「失効」で消す。
8. **無料枠**: 7項目を確認する。YouTube API・D1書込・字幕取得は「未取得」。seed の Cloudflare キャッシュでは R2 と Workers のリクエストが赤になり、テナント数は実数で表示される。
9. **データを削除**: 「データを削除」→ テナント名を間違えると確定ボタンが押せない。**確定すると削除予約が入る**ので、確かめたあとは `pnpm db:seed:local` で戻す。
10. **連携解除**: 同じく、テナント名の入力で確定する。解除後は「旧チャンネルのデータ削除を依頼済み」が表示され、新規連携ボタンは出ない。Queue が削除して `done_at` を記録した後に新規連携できる。seed で戻す。
11. **閲覧者**: アカウントメニューからログアウト → `viewer@example.com` で入る → 設定画面にメンバー区画と書込ボタンがない。
12. **未連携のテナント**: `other-owner@example.com` で入る → 「YouTubeと連携」ボタン。字幕トグルは「準備中」で押せない（運営テナントではないため）。
13. **3サイズ**: ブラウザの開発者ツールで幅を 390、820、1440 に変えて、2〜12 を見る。

画面のコードを変えたら `pnpm build:web` を流す（`pnpm dev` は起動時に1回だけビルドする）。自動の画面テストは `pnpm e2e`（8791 が別の作業で使われているなら `E2E_PORT=8792 pnpm e2e`）。E2E はローカル D1 を書き換えるので、あとで `pnpm db:seed:local` を流す。
