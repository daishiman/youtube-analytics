# 指定テナントの YouTube API 連携セットアップ

最終確認: 2026-09-25。対象は、作成者兼オーナーの確認済みメールが `manjumoto.daishi@senpai-lab.com` で、[wrangler.toml](../../wrangler.toml) の `MANAGED_YOUTUBE_TENANT_ID` と一致するテナントだけ。ほかのテナントは設定画面で各自の Google OAuth クライアントを登録する。

## 1. 現在の構成と残る設定

| 場所 | 項目 | 状態・作業 |
|---|---|---|
| GitHub repository Secrets | `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN` | デプロイ用に登録済み。**この構成では Google 系 Secret の追加は不要** |
| `wrangler.toml` の `[vars]` | `GOOGLE_CLIENT_ID`、`MANAGED_YOUTUBE_TENANT_ID` | コード側に設定済み。対象テナントIDは公開後の Worker に反映される |
| Cloudflare Worker Secrets | `GOOGLE_CLIENT_SECRET`、`TOKEN_ENC_KEY` | 名前の登録を確認済み。値は取得・表示しない。`GOOGLE_CLIENT_SECRET` はログインと、このテナントの YouTube 連携で共用する |
| Google Cloud | API の有効化、OAuth スコープ、承認済みリダイレクト URI、公開ステータス | **管理画面で確認が必要**。こちらから設定内容は確認できていない |
| アプリの設定画面 | チャンネルの Google 認可 | **公開後にオーナーが1回実施**。2026-09-25 時点の本番DBには、このテナントのチャンネルと更新トークンはない |

GitHub repository Secrets は GitHub Actions の実行時に参照されるもので、稼働中の Cloudflare Worker は直接読めない。現在のアプリは既存の Worker Secret を使うため、`MANAGED_YOUTUBE_CLIENT_ID` などの新しい名前を GitHub に作る必要はない。別の Google クライアントを使いたい場合は、Secret の追加だけでなく認証情報の選択方法とデプロイ経路を変更する。[GitHub の Secret の説明](https://docs.github.com/en/code-security/reference/secret-security/secret-types)、[Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

別リポジトリで確認できた `GOOGLE_SERVICE_ACCOUNT_JSON` はサービスアカウントの認証情報であり、通常の YouTube チャンネルを対象にした Data API の OAuth 認可には使えない。この連携には、対象チャンネルを管理する Google アカウントによる画面上の認可が必要。[YouTube Data API のサービスアカウントに関する説明](https://developers.google.com/youtube/v3/guides/moving_to_oauth)。

## 2. Google Cloud で確認する

1. [Google Cloud Console](https://console.cloud.google.com/) で、`wrangler.toml` の `GOOGLE_CLIENT_ID` と同じ OAuth クライアント ID を持つプロジェクトを開く。認証情報の種類は **ウェブ アプリケーション**。別のクライアントのシークレットに変更しない。
2. 「API とサービス」→「ライブラリ」で **YouTube Data API v3**、**YouTube Analytics API**、**YouTube Reporting API** が有効なことを確認する。[Google の API 有効化手順](https://developers.google.com/youtube/reporting/guides/authorization/installed-apps#prerequisites)。
3. Google Auth Platform の「データアクセス」で、`https://www.googleapis.com/auth/youtube.readonly` と `https://www.googleapis.com/auth/yt-analytics.readonly` を確認する。アプリの通常連携はこの2スコープを要求する。字幕の自動取得を使う場合だけ `youtube.force-ssl` の追加設定と検証が必要。[Analytics API のスコープ](https://developers.google.com/youtube/analytics/reference/reports/query)。
4. 同じ OAuth クライアントの「承認済みのリダイレクト URI」に、次の **2つの異なるパス**があることを確認する。ログイン用を消さない。[Google のリダイレクト URI 要件](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps#redirect-uri-validation-rules)。

   ```text
   https://youtube-analytics.daishimanju.workers.dev/api/auth/callback
   https://youtube-analytics.daishimanju.workers.dev/api/oauth/callback
   ```

5. OAuth 同意画面の対象ユーザーと公開ステータスを確認する。`Testing` のまま YouTube スコープでオフラインアクセスを許可すると、更新トークンも7日で期限切れになる。継続収集には公開ステータスと、必要な場合の Google 審査を整える。[Google の公開ステータスの説明](https://support.google.com/cloud/answer/15549945?hl=en)。

YouTube Analytics API と Reporting API は OAuth 2.0 を要する。API キーだけではこのアプリの非公開チャンネル分析を取得できない。[Google の認証情報の説明](https://developers.google.com/youtube/reporting/guides/registering_an_application)。

## 3. 公開後にチャンネルを認可する

1. 既存の [デプロイ手順](owner-manual-setup.mdx)に従い、main のデプロイを完了する。GitHub Actions の `deploy` が D1 マイグレーション後に Worker を公開する。Google 系 GitHub Secret は要求しない。
2. `https://youtube-analytics.daishimanju.workers.dev/settings` に `manjumoto.daishi@senpai-lab.com` でログインし、対象テナントを選ぶ。「Google Cloud の接続情報」が **事前設定済み** と表示されることを確認する。「設定確認が必要」なら、公開された Worker の `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` の設定を調べる。
3. テナントのオーナーが「YouTubeと連携」を押す。Google 画面で、分析対象チャンネルを管理するアカウントを選び、読み取り権限を許可する。候補が複数あれば対象チャンネルを1つ選ぶ。1テナントに連携できるチャンネルは1つ。
4. 設定画面でチャンネル状態が **正常**、付与スコープに `youtube.readonly` と `yt-analytics.readonly` が表示されることを確認する。更新トークンは D1 に暗号化して保存され、画面には表示されない。
5. 日次収集は [wrangler.toml](../../wrangler.toml) の Cron（毎日03:00 JST）で Queue に送られる。次の実行後に「最終収集」とダッシュボードの取得値を確認する。連携直後に収集済みと判断しない。

必要なら、**値を表示しない**次の読み取りコマンドで Worker Secret 名と保存状態を確認する。`<TENANT_ID>` には `MANAGED_YOUTUBE_TENANT_ID` の値を入れる。

```bash
pnpm wrangler secret list --format json
pnpm wrangler d1 execute youtube-analytics-db --remote --command \
  "SELECT c.channel_id, c.status, c.last_collected_at, CASE WHEN o.refresh_token_enc IS NULL THEN 'missing' ELSE 'present' END AS refresh_token, o.granted_scopes FROM channels c LEFT JOIN channel_oauth_tokens o ON o.tenant_id = c.tenant_id AND o.channel_id = c.channel_id WHERE c.tenant_id = '<TENANT_ID>'"
```

## 4. うまく進まない場合

| 表示・症状 | 確認先 |
|---|---|
| 「設定確認が必要」 | Worker の `GOOGLE_CLIENT_SECRET` の名前と `wrangler.toml` の `GOOGLE_CLIENT_ID`。Secret 値の再登録はログインにも影響するため、既存値を確認せずに上書きしない |
| Google の `redirect_uri_mismatch` | **同じ** OAuth クライアントに `/api/oauth/callback` が完全一致で登録されているか |
| 同意画面で拒否・アプリ未確認 | 対象ユーザー、要求した2スコープ、公開ステータス、Google の審査状態 |
| 候補チャンネルがない | 選んだ Google アカウントが対象 YouTube チャンネルを管理しているか |
| 「要再連携」または翌日の「最終収集」が更新されない | 設定画面の再連携、更新トークンの有無、3 API の有効化、Workers Logs と Queue のエラー。トークンやシークレットの値はログに出さない |

収益系の Analytics 指標には `yt-analytics-monetary.readonly` が別途必要で、現行の通常連携は要求していない。対応範囲は [データ取得範囲の監査](../analysis/youtube-official-data-scope.md)を参照する。
