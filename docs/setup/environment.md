# 開発環境とデプロイ基盤のセットアップ

正本は要件正本の infrastructure / maintenance-ops 章。この文書は再現可能な実行手順と構成の参照先だけを持ち、変化する作業ツリー、テスト件数、外部サービスの状態は複製しない。

## 1. 構成

| 層 | 採用 | 場所 |
|---|---|---|
| 実行基盤 | Cloudflare Workers（1本, Free） | `wrangler.toml` |
| API | Hono v4 | `src/` |
| 画面 | Vite + React（React Router）の SPA（qa-061。Next.js は不採用。Workers 静的アセット配信） | `web/` → `dist/web/` |
| DB | D1 `youtube-analytics-db`（binding `DB`） | `migrations/` |
| 画像 | R2 `youtube-analytics-media`（binding `MEDIA`, `tenants/<tenant_id>/`） | — |
| 収集 | 現在は Queue producer binding のみ。日次収集 feature で Cron・scheduled handler・consumer・終端失敗契約を同時に追加 | `src/index.ts`、`wrangler.toml` |
| テスト | Vitest 4 + `@cloudflare/vitest-pool-workers`（Workers ランタイム上） / Playwright 3サイズ | `tests/` `e2e/` |
| lint/format | Biome 2 | `biome.json` |
| CI/CD | GitHub Actions（PR: `ci.yml`、main: `deploy.yml`） | `.github/workflows/` |

## 2. ローカル開発

前提: Node 22（`.node-version`）、pnpm 10。

```bash
pnpm install
cp .dev.vars.example .dev.vars      # 秘密値を記入（コミットしない）
pnpm db:migrate:local
pnpm db:seed:local                  # テストアカウント（runbook.md 5 節）
pnpm dev                            # http://localhost:8791
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

- ポートは他プロジェクトとの衝突を避けて `8791` 固定。
- `compatibility_date` は同梱 workerd の対応上限（2026-08-22）に合わせている。wrangler 更新時に引き上げる。

## 3. 構成値の参照先

| 項目 | 正本・確認方法 |
|---|---|
| D1 | `wrangler.toml` の binding、database_name、database_id |
| R2 | `wrangler.toml` の binding と bucket_name |
| Queue | `wrangler.toml` の producer binding。consumer はまだ構成しない |
| GitHub Secrets | `.github/workflows/deploy.yml` が要求する名前。値の有無は GitHub 側で確認 |
| 指定テナントの YouTube OAuth | [youtube-managed-oauth.md](youtube-managed-oauth.md)。既存の Worker Secret と Google Cloud の追加設定、画面での認可を確認 |
| ローカル検証 | `package.json` の `lint`、`typecheck`、`test`、`build`、`e2e`、`check:repo` |

再作成は `scripts/setup-cloudflare.sh`（冪等）。

## 4. 利用者の手作業が必要な残り

外部アカウントの画面操作・秘密値の発行が必要なため、エージェントでは実行していない。**画面の場所、URL、入力する値まで含めた詳しい手順は `docs/setup/owner-manual-setup.mdx` にある。**

1. **Cloudflare API トークン**: ダッシュボード → My Profile → API Tokens → 「Edit Cloudflare Workers」テンプレートに D1 Edit・Queues Edit を追加し、対象アカウントを上記個人アカウントに限定して発行。`gh secret set CLOUDFLARE_API_TOKEN -R daishiman/youtube-analytics`
2. **Google Cloud**（SYS-PTA-P05 の受入前まで）:
   1. プロジェクト作成、YouTube Data API v3 / YouTube Analytics API / YouTube Reporting API を有効化
   2. OAuth 同意画面を External・本番公開（未検証）で作成、アプリ名 `Channel Insight`、スコープ `openid email` と `youtube.readonly`・`yt-analytics.readonly`（新規ログインで要求。feat-login-redesign）
   3. OAuth クライアント（Web）を作成し、承認済みリダイレクト URI に `https://youtube-analytics.<subdomain>.workers.dev/api/auth/callback` と `http://localhost:8791/api/auth/callback` を登録
   4. `wrangler.toml` の `GOOGLE_CLIENT_ID` を置換、`pnpm wrangler secret put GOOGLE_CLIENT_SECRET`
3. **規約ページの確定**: `public/privacy.html` と `public/terms.html` の「草案」表示を消し、運営者名、連絡先、施行日を記入する（owner-manual-setup.mdx 6.5 節）
4. **Workers Secret**: `openssl rand -base64 32 | pnpm wrangler secret put TOKEN_ENC_KEY`（初回 deploy 後）
5. **ブランチ保護**: 初回 CI 実行後、main に「PR 必須・`check` と `e2e` を必須チェック」を設定
6. **Claude Code**: `/reload-plugins` で Cloudflare Skills / MCP を有効化

## 5. 計画と進捗の正本

`feat-platform-tenant-auth` の task graph は `.dev-graph/published/feature-package-feat-platform-tenant-auth/task-graph.json`、成果物は `docs/feat-platform-tenant-auth/`、テストの対応表は `docs/feat-platform-tenant-auth/test-design.md` を正とする。ブランチや tracker の現在状態は `git status` と tracker で確認する。

### 5.1 後続 feature

| feature | Beads | 依存 | 計画前ゲート |
|---|---|---|---|
| feat-youtube-daily-collection | yta-04l | platform-tenant-auth | なし |
| feat-csv-media-ingest | yta-9tm | platform-tenant-auth | dev-graph 再同期（`eval-log/dev-graph-resync-required-20260922.json`） |
| feat-skill-analysis-reports | yta-ufd | daily-collection, csv-media-ingest | 同上 |
| feat-web-screens-actions | yta-7o5 | daily-collection, csv-media-ingest, skill-analysis-reports | 同上 |
| feat-retention-ops | yta-sjb | daily-collection | なし |

各 feature の task は `/dev-graph plan` で生成する。生成済みかどうかは tracker と `.dev-graph/` を正とする。

### 5.2 横断の残課題

- 影響3 feature の dev-graph compile / decompose による再同期（digest を手で置換しない）
- `docs/screens/02-dashboard.png` を週次売上ファネル追補後の prompt から再生成
- 上記 4. の手作業（API トークン・Google Cloud・Secrets・ブランチ保護）
