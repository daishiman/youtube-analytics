# セットアップ文書の入口

最終更新: 2026-09-23。**まずこのページを見て、自分がどこから始めればよいかを決める。**

## 1. どの文書を読むか

| 目的 | 文書 |
|---|---|
| 公開までに自分で行う設定を、1 手順ずつ実行する | **[owner-manual-setup.md](owner-manual-setup.md)**（本編。画面の場所、URL、入力値まで） |
| 構成と現況、残課題の全体像を知る | [environment.md](environment.md) |
| 公開後の日々の運用（上限変更、招待の取消、障害時、ロールバック） | [../feat-platform-tenant-auth/runbook.md](../feat-platform-tenant-auth/runbook.md) |
| ローカルで画面を触る（テストアカウント、画面テストの流れ） | [runbook.md の 5 節](../feat-platform-tenant-auth/runbook.md) |

## 2. 今の状態（2026-09-23）

実装とローカルの検証は完了し、ローカル commit まで済んでいる。**残りは外部サービスの設定と、push 以降。**

| 区分 | 状態 |
|---|---|
| 実装（`feat-platform-tenant-auth`、13 task） | 完了 |
| lint / typecheck | 指摘 0 / エラー 0 |
| test | 76 件すべて成功 |
| E2E（3 サイズ） | 13 件成功、2 件スキップ |
| build（deploy の dry-run） | 成功 |
| audit | 脆弱性 0 |
| commit | 済み（ブランチ `feat/platform-tenant-auth`、`1b72db3`、84 ファイル） |
| push / PR / deploy / 本番確認 | **未実施** |

## 3. あなたが行う作業（この順に）

所要時間は合計で約 60〜90 分。各行の「詳細」は owner-manual-setup.md の節番号。

| # | 作業 | 入口の URL / コマンド | 詳細 | 目安 |
|---|---|---|---|---|
| 1 | workers.dev のサブドメインを確認し、本番 URL を決める | https://dash.cloudflare.com/b3dde7be1cd856788fc47595ac455475/workers-and-pages | 1 | 5 分 |
| 2 | Cloudflare API トークンを発行する | https://dash.cloudflare.com/profile/api-tokens | 2.1 | 5 分 |
| 3 | トークンを GitHub に登録する | `gh secret set CLOUDFLARE_API_TOKEN -R daishiman/youtube-analytics` | 2.2 | 3 分 |
| 4 | Google Cloud のプロジェクトを作り、YouTube の API を 3 つ有効にする | https://console.cloud.google.com/ | 3 | 10 分 |
| 5 | OAuth 同意画面（ブランディング、スコープ、対象）を設定する | https://console.cloud.google.com/auth/overview | 4 | 15 分 |
| 6 | OAuth クライアントを作り、リダイレクト URI を 2 つ登録する | https://console.cloud.google.com/auth/clients | 5 | 5 分 |
| 7 | クライアント ID を `wrangler.toml` に書く | `wrangler.toml` の `GOOGLE_CLIENT_ID` | 6 | 2 分 |
| 8 | 規約ページに運営者名、連絡先、施行日を入れる | `public/privacy.html`、`public/terms.html` | 6.5 | 15 分 |
| 9 | Workers Secret を 2 つ登録する | `pnpm wrangler secret put GOOGLE_CLIENT_SECRET` ほか | 7 | 5 分 |
| 10 | push して PR を作る | `git push -u origin feat/platform-tenant-auth` | 9.3、9.4 | 5 分 |
| 11 | CI を確認し、ブランチ保護を設定する | https://github.com/daishiman/youtube-analytics/actions | 10 | 10 分 |
| 12 | merge して deploy を確認する | 同上 | 11 | 5 分 |
| 13 | 本番でログインを確認する | `<本番URL>/api/health`、`/login` | 12 | 10 分 |

エージェントに任せられるのは 7 と 8（値さえ決まれば書き換えられる）。9 は秘密の値なので、**あなたのターミナルから直接**入れる。

## 4. 間違えやすいところ

| よくある間違い | 正しくは |
|---|---|
| Cloudflare の画面で「Create an app」→「Import a repository」を使って GitHub とつなぐ | **使わない。** deploy は GitHub Actions が `wrangler deploy` で行う（owner-manual-setup.md 1.5.1） |
| Cloudflare のダッシュボードで binding や変数を直接いじる | `wrangler.toml` を直して PR を出す。ダッシュボードの変更は次の deploy で消える（1.5.3） |
| 秘密の値をファイルやチャットに書く | **このリポジトリは公開。** 入力欄かターミナルのプロンプトにだけ貼る |
| 順番を飛ばして Google の設定から始める | 1 で決まる本番 URL を 5、6 で使うため、1 から行う |
| `.dev.vars` を commit する | `.gitignore` 済み。`git status` に出たら止まって確認する |

## 5. 作業前の確認コマンド

```bash
git status -sb                  # ブランチが feat/platform-tenant-auth であること
gh secret list -R daishiman/youtube-analytics   # CLOUDFLARE_ACCOUNT_ID だけなら、まだ 3 が未了
pnpm wrangler whoami            # Daishimanju@gmail.com's Account であること
curl -s localhost:8791/api/health   # ローカルを触るときだけ（pnpm dev の起動中）
```
