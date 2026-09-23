# feat-platform-tenant-auth 構成設計（SYS-PTA-P02）

最終更新: 2026-09-22。正本は `system-spec/`（infrastructure / backend / database / auth / security 章）。本書は正本をこの feature の実装単位へ落とした設計で、食い違う場合は正本を優先する。

## 1. デプロイ単位

| 項目 | 値 | 置き場所 |
|---|---|---|
| Worker | `youtube-analytics` 1本（Hono v4、`src/index.ts`） | `wrangler.toml` の `name` / `main` |
| 画面 | Vite + React（React Router）の SPA を `dist/web` にビルドし、Workers 静的アセットで配信 | `[assets]`（`run_worker_first = ["/api/*"]`、`not_found_handling = "single-page-application"`） |
| DB | D1 `youtube-analytics-db`、binding `DB` | `[[d1_databases]]`、`migrations/` |
| 画像 | R2 `youtube-analytics-media`、binding `MEDIA`（本 feature では未使用。キー接頭辞 `tenants/<tenant_id>/` を予約） | `[[r2_buckets]]` |
| 収集キュー | Queue `collect-queue` の producer binding `COLLECT_QUEUE` のみ。consumer は処理と終端失敗契約を実装する後続 feature で同時に追加する | `[[queues.producers]]` |
| Cron | 本 feature では未構成。`0 18 * * *`（JST 3:00）を実処理と consumer が揃う後続 feature で追加する | — |

`/api/*` だけを Worker が先に処理し、それ以外（`/`、`/login`、`/settings` など）は静的アセットの `index.html` が返る。`/privacy` と `/terms` は `public/` の静的 HTML。

## 2. 層構成

```
HTTP (src/http)          認証ゲート・CSRF・TenantContext 組立て・入出力の整形
  ├─ app.ts              /api/* に secureHeaders → deps → authGate → csrfGuard を順に適用
  ├─ auth-routes.ts      /api/auth/*（ログイン開始・コールバック・招待プレビュー・ログアウト・開発用ログイン）
  ├─ api-routes.ts       /api/me・/api/tenants・/api/tenants/:id/*・/api/invites/accept
  ├─ middleware.ts       authGate（401）・csrfGuard（403）・tenantContextFor（:id とセッションの一致を検査し不一致は 404）
  ├─ cookies.ts          セッション Cookie と OAuth 往復用の署名付き短命 Cookie
  └─ google-oauth.ts     認可 URL の組立て・code 交換・ID トークン claim 検証
Usecase (src/usecases)   入口で requirePermission(ctx, 権限) を1回だけ検査してから repository を呼ぶ
  ├─ session.ts          loginWithIdentity（初回テナント作成・招待受理）・resolveSession・logout
  ├─ tenants.ts          自分の所属一覧・テナント追加・切替・/api/me
  ├─ members.ts          一覧・役割変更・削除・脱退（最後の owner を守る）
  └─ invites.ts          発行・一覧・取消・プレビュー・受理
Domain (src/domain)      Role・Permission の表と TenantContext 型（副作用なし）
Repository (src/repositories)
  ├─ tenant-scoped-repository.ts  テナント内の読み書き。生成時に tenant_id を固定し、全 SQL の WHERE に入れる
  ├─ platform-repository.ts       テナントをまたぐ管理面（users・sessions・テナント作成・招待の検索/消費）
  └─ db.ts                        単一control D1 bindingを返す（将来分割の先取り抽象は置かない）
```

Frontendは`Shell`（session境界）→`ShellFrame`（共通外枠）→route pageの一方向とし、`SettingsPage`だけがtenant resource・member mutation・invite stateを所有する。tenant切替ではpage identity、request generation、AbortSignalを同時に更新する。

依存の向きは HTTP → Usecase → (Domain, Repository) の一方向。Usecase は `Deps = { env, now }` を受け取り、時刻を注入できるので期限切れのテストが書ける。

### 2.1 tenant_id を必須にする設計（受入: 全リポジトリ関数が tenant_id を取る）

- **テナント内のデータ**は `TenantScopedRepository` だけが触る。コンストラクタ引数 `ctx: Pick<TenantContext, "tenantId">` が必須で、全メソッドの SQL が `WHERE tenant_id = ?1` を持つ。呼び出し側が他テナントの `userId` や `inviteId` を渡しても、該当 0 件となり 404 になる。
- `TenantContext` は `tenantContextFor()` だけが作る。`tenantId` と `userId` はセッションから取り、URL の `:id` は「一致の検査」にしか使わない。`role` は要求ごとに `tenant_members` から読み直す。そのため、役割の変更は次の要求から効く。
- **テナントをまたぐ管理面**（利用者の upsert、セッション、テナント作成、トークンハッシュでの招待の検索）は `PlatformRepository` に分ける。ここでテナントに触る関数（`getRole`、`consumeInvite`、`setSessionTenant`、`createTenantWithOwner`）も、すべて `tenantId` を明示の引数に取る。
- 後続 feature の業務データ（動画・指標など）は `TenantScopedRepository` を拡張する形で追加し、`PlatformRepository` には置かない。

### 2.2 テーブル（`migrations/0001_platform.sql`）

| テーブル | 主キー | 用途 |
|---|---|---|
| users | user_id（google_sub は UNIQUE） | Google アカウントと1対1 |
| tenants | tenant_id | 名前・論理削除。既存`db_binding`列は現在未使用で、単一D1が正本 |
| tenant_members | (tenant_id, user_id) | 役割 owner / editor / viewer |
| tenant_invites | (tenant_id, invite_id)、token_hash は UNIQUE | 招待（SHA-256 のハッシュだけを保存、7日、1回限り、取消） |
| sessions | session_id_hash | **本 feature で追加**。下記 2.3 |
| skill_tokens | (tenant_id, token_id) | Claude Code 連携用トークンの土台（発行と利用は feat-skill-analysis-reports で実装） |

### 2.3 sessions テーブルを追加した理由

正本は「256bit のセッション ID を Cookie に入れ、30日で失効」を定める。署名だけのステートレス Cookie では、ログアウト・メンバー削除・役割変更をサーバ側ですぐに効かせることができない。そこで D1 に `sessions` を置く。

- Cookie の平文 ID は保存しない。SHA-256 の値だけを保存するので、D1 が漏れても Cookie は偽造できない。
- ログアウトしたら行を削除する。期限は `expires_at` で判定する。
- 選択中のテナントは `sessions.tenant_id`、logoutを越える最後の選好は`users.last_tenant_id`に分離する。役割は毎回`tenant_members`から読み、選好先から外れていればlogin時に所属先へfallbackする。
- 期限切れsessionはlogin時に最大100件ずつ削除し、通常要求の処理量をboundedにする。

### 2.4 MAX_TENANTS の置き場所

`wrangler.toml` の `[vars] MAX_TENANTS = "100"` に置く（非秘密。変更は `wrangler.toml` を直して deploy）。上限の判定は `createTenantWithOwner` の条件付き INSERT（`WHERE (SELECT COUNT(*) …) < ?max`）で行う。この INSERT は D1 batch の中で1文として実行されるので、同時に初回ログインが来ても上限を超えない（A5 の並行テストで検証）。招待による参加は上限の対象外。

## 3. 環境変数と Secrets

| 名前 | 種別 | 置き場所 | 用途 |
|---|---|---|---|
| `MAX_TENANTS` | var（非秘密） | `wrangler.toml [vars]` | 新規テナントの上限（既定 100） |
| `GOOGLE_CLIENT_ID` | var（非秘密） | `wrangler.toml [vars]` | OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | **Workers Secret** | `wrangler secret put`（ローカルは `.dev.vars`） | code 交換 |
| `TOKEN_ENC_KEY` | **Workers Secret** | `wrangler secret put`（ローカルは `.dev.vars`） | OAuth 往復用 Cookie の HMAC 署名鍵（後続 feature で YouTube トークンの暗号化にも使う） |
| `DEV_LOGIN` | ローカル専用 var | `.dev.vars` のみ（本番の vars と Secrets には置かない） | `"1"` かつ localhost のときだけ開発用ログインを有効にする |
| `CLOUDFLARE_API_TOKEN` | **GitHub Actions secret** | リポジトリの Secrets | `deploy.yml` の migrate と deploy |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | リポジトリの Secrets | 同上 |

- Secrets は Workers と GitHub Actions の2系統に分ける。Worker の実行時に必要なものは Workers Secrets に置き、Cloudflare を操作する権限は Actions secrets に置く。
- 型は `src/env.ts` の `Bindings` を正本とし、`wrangler.toml` と同時に更新する。
- `.dev.vars` は `.gitignore` 済み。雛形は `.dev.vars.example`（値は空）。

## 4. 検証

- `pnpm build`（= `vite build` と `wrangler deploy --dry-run`）が構成エラーなく通る。出力は `evidence/P02-build-dry-run.txt`。バインディング `DB`、`MEDIA`、`COLLECT_QUEUE`、`ASSETS`、`MAX_TENANTS`、`GOOGLE_CLIENT_ID` が解決されている。
- tenant_id の必須化は、越境テスト（`tests/platform/a3-authorization.test.ts`）とルート網羅テスト（`tests/platform/routes-coverage.test.ts`）で担保する。

## 5. Rollback

`wrangler.toml` と本書を直前版へ戻す。D1 マイグレーションは前進のみで運用する。取り消すときは打ち消しのマイグレーションを追加する。
