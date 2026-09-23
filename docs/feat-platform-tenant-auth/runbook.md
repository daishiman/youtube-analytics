# feat-platform-tenant-auth 運用手順（SYS-PTA-P12）

最終更新: 2026-09-22。対象は、ログイン、テナント、招待の基盤を、新しい環境に作る人と日々運用する人。構成の詳細は architecture.md を参照。

## 0. 前提

- Node 22（`.node-version`）、pnpm 10、`gh`（GitHub CLI）。
- Cloudflare アカウント（Workers Free で動く）と Google Cloud プロジェクト。
- このリポジトリを clone し、`pnpm install` を済ませておく。

## 1. Cloudflare の資源を作る（初回だけ）

```bash
pnpm wrangler login                 # ブラウザで Cloudflare にログイン
bash scripts/setup-cloudflare.sh    # D1・R2・Queue を冪等に作成し、database_id を表示する
```

表示された `database_id` を `wrangler.toml` の `[[d1_databases]]` に書く（すでに同じ値なら変更不要）。

## 2. Google OAuth クライアントを作る

1. Google Cloud コンソール → 「API とサービス」→「OAuth 同意画面」。
   - ユーザーの種類は **外部**、公開ステータスは **本番環境**。
   - スコープは `openid` と `.../auth/userinfo.email` だけ（YouTube のスコープは feat-youtube-daily-collection で追加する）。
   - アプリのホームページ、プライバシーポリシー、利用規約の URL に、`https://<Worker の URL>/`、`/privacy`、`/terms` を入れる。
2. 「認証情報」→「OAuth クライアント ID を作成」→ 種類は **ウェブ アプリケーション**。
   - 承認済みのリダイレクト URI:
     - `https://youtube-analytics.daishimanju.workers.dev/api/auth/callback`（サブドメイン `daishimanju` は 2026-09-23 に確認済み）
     - `http://localhost:8791/api/auth/callback`（ローカルで本物の Google を試すとき）
3. 発行されたクライアント ID を `wrangler.toml` の `[vars] GOOGLE_CLIENT_ID` に書く（非秘密）。
4. クライアントシークレットは**ファイルに書かず**、次の 3 節で Workers Secret に入れる。

## 3. Secrets を登録する

| 名前 | 登録先 | コマンド |
|---|---|---|
| `GOOGLE_CLIENT_SECRET` | Workers Secret | `pnpm wrangler secret put GOOGLE_CLIENT_SECRET`（プロンプトに貼り付ける） |
| `TOKEN_ENC_KEY` | Workers Secret | `openssl rand -base64 32 \| pnpm wrangler secret put TOKEN_ENC_KEY` |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Cloudflare の My Profile → API Tokens →「Edit Cloudflare Workers」テンプレートに D1 Edit と Queues Edit を足し、対象アカウントを限定して発行 → `gh secret set CLOUDFLARE_API_TOKEN` |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | `gh secret set CLOUDFLARE_ACCOUNT_ID`（`pnpm wrangler whoami` で確認） |

- Worker がまだ一度もデプロイされていない場合、`secret put` は Worker を作るかどうか確認してくる。そのまま作成してよい。
- `DEV_LOGIN` は**本番に登録しない**。登録しても localhost 以外では 404 になるが、混乱のもとになる。
- 登録済みの一覧は `pnpm wrangler secret list` で確認できる（値は表示されない）。

## 4. preview（本番）環境を作る

この feature では環境は production の 1 系統だけ（正本 infrastructure 章 qa-014）。「preview 環境」は `workers.dev` 上のこの 1 系統を指す。

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # 手元で全部通ることを先に確認
pnpm db:migrate:remote                                   # D1 にテーブルを作る
pnpm run deploy                                          # 画面をビルドして Worker をデプロイ
```

通常は GitHub Actions に任せる。PR を main へ merge すると、`deploy.yml` が `pnpm db:migrate:remote` → `pnpm run deploy` の順に実行する。

**確認**:

1. `https://<Worker の URL>/api/health` → `{"status":"ok","db":true}`
2. `https://<Worker の URL>/login` → 同意にチェック →「Google でログイン」→ 初回はテナントが作られ、「あなたの役割: オーナー」と表示される。
3. 開発用ログインの欄が**表示されない**こと（本番では `DEV_LOGIN` がないため）。
4. acceptance.md 3 節の A1〜A6 の手順を実施し、preview の列を埋める。

**ブランチ保護**（初回の CI 実行後に1回だけ）: GitHub → Settings → Branches → main に「PR を必須にする」「必須チェック `check` と `e2e`」を設定する。これで、PR での lint・test・dry-run が必須チェックになる。

## 5. ローカル開発と画面テスト

```bash
cp .dev.vars.example .dev.vars   # 初回だけ。TOKEN_ENC_KEY に openssl rand -base64 32 の値を入れる
pnpm db:migrate:local            # ローカル D1 にテーブルを作る
pnpm db:seed:local               # テストアカウントとテナントを入れる（何回流しても同じ状態になる）
pnpm dev                         # http://localhost:8791
```

`.dev.vars` に `DEV_LOGIN=1` があると、ログイン画面に「開発用ログイン」の欄が出る。Google を使わず、メールアドレスだけでログインできる（localhost のときだけ）。

### 5.1 テストアカウント（パスワードなし。開発用ログインの欄にメールを入れるだけ）

| メール | テストチャンネルA | 別チャンネルB | 使いどころ |
|---|---|---|---|
| owner@example.com | オーナー | 閲覧者 | 招待、役割変更、メンバー削除。テナント切替で役割の表示が変わる |
| editor@example.com | 編集者 | — | 設定画面は閲覧だけ（招待欄と「外す」は出ない） |
| viewer@example.com | 閲覧者 | — | 書込ボタンが出ないこと |
| other-owner@example.com | — | オーナー | 別テナントの持ち主（越境の確認用） |
| invitee@example.com | （招待中: 編集者） | — | 下の招待リンクで参加する |
| 未使用のメール（例: new1@example.com） | — | — | 初回ログインで自分のテナントが作られる |

招待リンク（seed 済み、7 日間有効、1 回限り）:

- 有効: `http://localhost:8791/invite?token=local-invite-editor-0000000000000000000000000`（invitee@example.com 宛て、編集者）
- 期限切れ: `http://localhost:8791/invite?token=local-invite-expired-000000000000000000000000`

一度使った招待を戻すときや、データを初期状態に戻すときは `pnpm db:seed:local` を流し直す。seed が戻すのはテストアカウントの行だけで、自分で作った利用者やテナントは残る。

### 5.2 画面テストの流れ

1. http://localhost:8791/login を開く。同意にチェックするまで「Google でログイン」と「開発用ログイン」は押せない。「利用規約」と「プライバシーポリシー」のリンクから規約ページが開く。
2. `owner@example.com` で開発用ログイン → ダッシュボードに「テストチャンネルA」「あなたの役割: オーナー」。
3. 左の「テナント」を「別チャンネルB（閲覧者）」に切り替える → 役割の表示が「閲覧者」になる。「テストチャンネルA」に戻す。
4. 「設定」→ メンバー表に 3 人が出る。editor@example.com の役割を変えたり「外す」を押したりできる（「外す」は確認ダイアログが出る）。自分（最後のオーナー）を降格しようとすると拒否される。
5. 「メンバーを招待」にメールを入れ、役割を選び「招待リンクを発行」→ リンクが表示される。「未使用の招待」に並び、「取り消す」で無効にできる。
6. ログアウト → 上の有効な招待リンクを開く →「『テストチャンネルA』に編集者として招待されています」→「ログインして参加する」→ **別のメール**（例: viewer@example.com）で開発用ログイン → 拒否の文言が出る →「別のアカウントでログインし直す」→ `invitee@example.com` でログイン → 参加できる。
7. `viewer@example.com` でログイン → 設定画面に「外す」と招待欄が出ない。「このテナントから脱退する」は押せる（押すと実際に抜けるので、戻すときは seed を流し直す）。
8. 未使用のメール（例: new1@example.com）でログイン → 自分のテナントが作られてオーナーになる。
9. 受付停止（A5）: `.dev.vars` に `MAX_TENANTS=2` を追記して `pnpm dev` を再起動 → 未使用のメールでログイン → 「現在新規の受付を停止しています」。確認後は行を消して再起動する。

画面を変更したら `pnpm build:web` が必要（`pnpm dev` は起動時に1回だけビルドする）。自動の画面テストは `pnpm e2e`。

## 6. 日常の運用

### 6.1 MAX_TENANTS を変える

1. `wrangler.toml` の `[vars] MAX_TENANTS` を変える（例: `"150"`）。
2. PR → main へ merge → 自動でデプロイされる。
3. 下げる場合、今あるテナントは消えない。新規の初回ログインとテナント追加だけが止まる（`SIGNUP_CLOSED`）。招待による参加は上限の対象外。

現在のテナント数:

```bash
pnpm wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS tenants FROM tenants WHERE deleted_at IS NULL"
```

### 6.2 招待を取り消す

- 通常は、オーナーが画面の「設定 → 未使用の招待 → 取り消す」で行う。取り消した招待リンクは「この招待リンクは使えません」になる。
- 画面が使えないときは、次のコマンドで取り消す（テナントとメールを確認してから実行する）。

```bash
pnpm wrangler d1 execute DB --remote --command \
  "UPDATE tenant_invites SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tenant_id = '<tenant_id>' AND email = '<email>' AND accepted_at IS NULL AND revoked_at IS NULL"
```

- 招待リンクを再表示する方法はない（平文は保存していない）。なくした場合は取り消して再発行する。

### 6.3 退会とメンバーの削除

- 本人の脱退は「設定 → このテナントから脱退する」で行う。
- オーナーによる削除は「設定 → メンバー表 →『外す』」で行う。削除された人は、次の要求からそのテナントに入れなくなる（役割は毎回 DB から読み直すため）。
- 最後のオーナーは降格、削除、脱退のどれもできない（409 `LAST_OWNER`）。先に別のメンバーをオーナーにする。
- 利用者のアカウント自体の削除とデータの消去（30 日保持、7 日以内の削除）は feat-retention-ops で扱う。依頼を受けたら、それまでは所属を外す対応をする。

### 6.4 障害時

| 症状 | 確認 | 対処 |
|---|---|---|
| ログインすると `/login?error=OAUTH_FAILED` に戻る | `wrangler tail` で詳細を見る。`GOOGLE_CLIENT_ID` と Secret、リダイレクト URI の一致を確認 | 値を直して再デプロイ、または `secret put` |
| `OAUTH_STATE_MISMATCH` | 10 分以上ログイン画面に放置した、または別のブラウザで続けた | もう一度ログインする |
| `/api/health` の `db` が false | D1 の binding と `database_id` を確認 | `wrangler.toml` を直して再デプロイ |
| デプロイが失敗する | Actions のログ。`CLOUDFLARE_API_TOKEN` の権限（Workers、D1、Queues の Edit） | トークンを再発行して `gh secret set` |

### 6.5 ロールバック

- コードは、直前の commit を revert する PR を main へ merge する。緊急時は `pnpm wrangler rollback` で直前のデプロイに戻す。
- D1 マイグレーションは前進のみで運用する。取り消すときは打ち消しのマイグレーションを追加する。
