# feat-login-redesign 運用手順（SYS-LRD-P12）

最終更新: 2026-09-24。対象は、ログイン画面と同意記録、YouTube 連携状態を運用する人。環境の作り方の土台は `docs/feat-platform-tenant-auth/runbook.md`、画面の場所まで含む手順は `docs/setup/owner-manual-setup.mdx` にある。

## 1. この feature で増えたもの

| 種類 | 名前 | 用途 |
|---|---|---|
| D1 テーブル | `consent_records` | 規約とプライバシーポリシーへの同意の履歴。追記だけで、更新しない |
| D1 テーブル | `oauth_tokens` | テナントごとの付与スコープと、暗号化した refresh token |
| D1 列 | `tenants.youtube_link_status` | `none` / `partial` / `linked` |
| API | `GET /api/auth/config` | 権限一覧、規約の版、招待元のテナント名 |
| API | `GET /api/auth/youtube/connect` | オーナーだけが YouTube の 2 スコープを求め直す |
| 定数 | `LEGAL_VERSIONS`（`src/usecases/login-consent.ts`） | 現行の規約の版 |
| Secret | `TOKEN_ENC_KEY` | refresh token の暗号鍵（`docs/setup/owner-manual-setup.mdx` 7 節で登録済み） |

migration `0003` は main への push で `deploy.yml` が自動で当てる。手で当てる必要はない。

## 2. 規約を改定して再同意を求める

既存のセッションは切らない。次にログインしたとき、新しい版への同意を記録する。

1. `public/terms.html` と `public/privacy.html` の本文を直す。
2. 変えたページの `<body data-version="...">` を新しい版（改定日、例 `2026-11-01`）にする。
3. `src/usecases/login-consent.ts` の `LEGAL_VERSIONS` を同じ値にする（片方だけ変えることもできる）。
   ```ts
   export const LEGAL_VERSIONS = { terms: "2026-11-01", privacy: "2026-11-01" } as const;
   ```
4. `pnpm test` を流す。HTML の `data-version` と `LEGAL_VERSIONS` がずれていると `tests/login/security-headers.test.ts` が失敗する。
5. PR → main へ merge → 自動でデプロイされる。
6. デプロイ後の動き:
   - ログイン画面は `/api/auth/config` から新しい版を受け取り、同意すると新しい版で記録する。前回と違う版なら `source=reconsent`。
   - 古い画面を開いたまま（キャッシュ）でログインすると、サーバが版の違いを見つけて `/login?error=CONSENT_OUTDATED` に戻す。画面には「利用規約またはプライバシーポリシーが更新されました。内容を確認して、もう一度同意してください」と出る。
7. 何人が再同意したかを確かめる:
   ```bash
   pnpm wrangler d1 execute DB --remote --command \
     "SELECT terms_version, privacy_version, source, COUNT(*) AS n FROM consent_records GROUP BY 1,2,3 ORDER BY 1 DESC"
   ```

**やってはいけないこと**: consent_records の行を書き換える、消す（アカウント削除のときだけ消す。§6）。

## 3. OAuth 同意画面のアプリ名とスコープ

Google のログイン画面に出る名前を製品名に合わせる。`docs/setup/owner-manual-setup.mdx` の 4.2 と 4.3 のとおり。

1. https://console.cloud.google.com/auth/branding →「アプリ名」を `Channel Insight` →「保存」。
2. https://console.cloud.google.com/auth/scopes → `openid`、`.../auth/userinfo.email`、`https://www.googleapis.com/auth/youtube.readonly`、`https://www.googleapis.com/auth/yt-analytics.readonly` の 4 つにする →「保存」。
3. YouTube の 2 つは「機密性の高いスコープ」なので、検証前は「このアプリは Google で確認されていません」と出る。ログイン画面の「このアプリはGoogleの検証前です」の案内はこのため。

スコープを登録し忘れると、新規ログインで Google がエラー画面を出す。

## 4. preview（本番）で受入を確認する

デプロイ後に 1 回通し、結果を `docs/feat-login-redesign/acceptance.md` §3 に書く。Google アカウントは 2 つ要る（オーナーと招待される人）。

1. `curl -sI https://youtube-analytics.daishimanju.workers.dev/login` → `Content-Security-Policy` に `frame-ancestors 'none'`、`X-Frame-Options: DENY` がある。
2. `/login` →「開発用ログイン」の欄が **出ない**。
3. 1 つ目のアカウントで新規ログイン。Google の画面で YouTube の 2 項目の **片方のチェックを外して** 続ける → ダッシュボードに「YouTube 連携が未完了です」と「再連携」。
4. 「再連携」→ 2 項目とも許可 → バナーが消える。
5. 設定 → 2 つ目のアカウントのメールで招待 → ログアウト → 招待リンクを 2 つ目のアカウントで開く → Google の画面にはメールアドレスだけが出る。
6. 2 つ目のアカウントでダッシュボードを見る。1 つ目が §3 の片方を外したままなら、「オーナーに YouTube の再連携を依頼してください」だけが出て、ボタンはない。
7. 規約改定の確認は §2 を実際に行ったときに合わせて確認する。

連携状態の確認:

```bash
pnpm wrangler d1 execute DB --remote --command \
  "SELECT name, youtube_link_status FROM tenants WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 20"
```

## 5. YouTube 連携が一部だけの利用者への案内

Google の同意画面では、利用者が項目ごとにチェックを外せる。外してもログインとテナント作成は完了し、`youtube_link_status=partial` になる。

| 問い合わせ | 答え |
|---|---|
| 「YouTube 連携が未完了です」と出る（オーナー） | 未連携、権限の一部未許可、または継続利用用のトークンがない状態です。バナーの「再連携」を押し、Google の画面で YouTube の 2 項目の両方にチェックを入れて「続行」してください |
| 同じ表示で「再連携」ボタンがない（編集者・閲覧者） | 連携はオーナーだけができます。オーナーに再連携を依頼してください |
| 「ログイン中と別の Google アカウントで許可されたため、連携しませんでした」 | 再連携の Google 画面で、今ログインしているのと同じアカウントを選んでください |
| 再連携を押しても何も変わらない | Google アカウントの https://myaccount.google.com/connections で Channel Insight のアクセスを一度削除してから、もう一度「再連携」を押してください |

`none` または `partial` のテナントでも、ログイン、招待、メンバー管理はできる。`linked` は YouTube の 2 権限と保存済みの refresh token が両方ある場合だけにする。

この feature より前からあるテナントは `none` から始まり、バナーから再連携できる。オーナーが次に Google でログインしたときも YouTube の 2 スコープを求められ、権限と保存済み refresh token の結果で `linked` か `partial` になる。

## 6. 同意記録とトークンの扱い

- **同意記録**: 追記だけ。アカウント削除のときは `PlatformRepository.deleteConsentRecords(userId)` で、その人の行だけを消す。アカウント削除の機能はまだないので、作るときに利用者行の削除と同じ処理の中で呼ぶこと。
- **refresh token**: `TOKEN_ENC_KEY` で AES-GCM 暗号化して `oauth_tokens.refresh_token_enc` に入れる。同じ利用者が 2 回目以降に refresh token を返されないときだけ、保存済みの値を残す。初回に token が無ければ `partial` として再連携を案内する。
- **`TOKEN_ENC_KEY` を変えるとき**: 保存済みの refresh token は復号できなくなる。変えた後は、全オーナーに「再連携」を依頼する。
- 招待で参加した人のログインでは、トークンも連携状態も変えない。

## 7. ローカルでの画面テスト

```bash
pnpm db:migrate:local
pnpm db:seed:local     # 何回流しても同じ状態に戻る
pnpm dev               # http://localhost:8791
```

この作業環境ではシェル既定の Node が x64、インストール済みの Vite/Vitest binding が arm64 なので、コマンドが起動前に失敗したら `PATH=/opt/homebrew/bin:$PATH pnpm dev`（テストは同じ接頭辞で `pnpm test` / `pnpm e2e`）を使う。今回のローカル検証は arm64 Node で実行した。

`.dev.vars` に `DEV_LOGIN=1` があると、ログイン画面の下に「開発用ログイン」の欄が出る。**同意にチェックしてから** メールを入れて「開発用ログイン」を押す。

| メール | テナントと役割 | 連携状態 | 見えるもの |
|---|---|---|---|
| owner@example.com | テストチャンネルA: オーナー / 別チャンネルB: 閲覧者 | A: partial / B: partial | A では「再連携」、B に切り替えるとオーナーへの依頼文（ボタンなし） |
| editor@example.com | テストチャンネルA: 編集者 | partial | オーナーへの依頼文。書込ボタンなし |
| viewer@example.com | テストチャンネルA: 閲覧者 | partial | オーナーへの依頼文。書込ボタンなし |
| other-owner@example.com | 別チャンネルB: オーナー | partial | バナーと「再連携」 |
| partial@example.com | 一部許可チャンネルP: オーナー | partial | バナーと「再連携」 |
| invitee@example.com | （テストチャンネルA に編集者として招待中） | — | 招待リンクから参加 |
| 未使用のメール（例 new1@example.com） | 自分のテナントが作られる | none | 開発用ログインでは Google を通らないので連携状態は none のまま。「再連携」を案内する |

招待リンク:

- 有効: `http://localhost:8791/login?invite=local-invite-editor-0000000000000000000000000`（`/invite?token=` でも同じ）
- 期限切れ: `http://localhost:8791/invite?token=local-invite-expired-000000000000000000000000`

「再連携」はローカルでは本物の Google へ移動する。ダミーのクライアントシークレットでは戻ってこられないので、ボタンの行き先（`/api/auth/youtube/connect`）を確かめるところまでにする。

## 8. ロールバック

- コードは PR を revert して merge すれば戻る。
- migration 0003 で足したテーブルと列は残る。古いコードはそれらを読まないので動作に影響はない。消す必要があるときだけ、次を手で実行する（同意の履歴も消えるので、先に export する）。
  ```bash
  pnpm wrangler d1 export DB --remote --output backup-before-rollback.sql
  pnpm wrangler d1 execute DB --remote --command "DROP TABLE consent_records; DROP TABLE oauth_tokens; ALTER TABLE tenants DROP COLUMN youtube_link_status"
  ```

## 9. うまくいかないとき

| 症状 | 原因 | 対処 |
|---|---|---|
| 同意したのに毎回 CONSENT_OUTDATED | 古い画面がキャッシュされている、または `LEGAL_VERSIONS` と HTML の版の片方だけを変えた | 再読み込み。§2 の 4 のテストを流す |
| 新規ログインで Google がエラー画面 | 同意画面に YouTube の 2 スコープを登録していない | §3 |
| ブラウザのコンソールに CSP の違反 | inline の script や style、外部の画像を足した | `public/` に置いて自サイトから読む。CSP は `src/http/security-headers.ts` だけで定義し、`public/_headers` を同じ値にする |
| 他サイトに埋め込めない | `frame-ancestors 'none'` による。意図どおり | — |
