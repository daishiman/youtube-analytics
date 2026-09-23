# 開発環境とデプロイ基盤のセットアップ

最終更新: 2026-09-22。正本は要件正本の infrastructure / maintenance-ops 章。ここは実行手順と現況だけを持つ。

## 1. 構成

| 層 | 採用 | 場所 |
|---|---|---|
| 実行基盤 | Cloudflare Workers（1本, Free） | `wrangler.toml` |
| API | Hono v4 | `src/` |
| 画面 | Vite + React（React Router）の SPA（qa-061。Next.js は不採用。Workers 静的アセット配信） | `web/` → `dist/web/` |
| DB | D1 `youtube-analytics-db`（binding `DB`） | `migrations/` |
| 画像 | R2 `youtube-analytics-media`（binding `MEDIA`, `tenants/<tenant_id>/`） | — |
| 収集 | Cron `0 18 * * *`（JST 3:00）→ Queue `collect-queue`（max_batch_size=1, max_retries=3, retry_delay=600） | `wrangler.toml` |
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

## 3. 完了済み（2026-09-22）

| 項目 | 状態 |
|---|---|
| Cloudflare ログイン | 個人アカウント `Daishimanju@gmail.com's Account`（`b3dde7be1cd856788fc47595ac455475`） |
| D1 作成 | `youtube-analytics-db` = `91996166-d308-4e8e-9ca1-b1e21595e816`（APAC） |
| R2 作成 | `youtube-analytics-media`（Standard） |
| Queue 作成 | `collect-queue` |
| GitHub Secret | `CLOUDFLARE_ACCOUNT_ID` 登録済み |
| Cloudflare agent 設定 | `cloudflare@cloudflare` プラグイン導入（Claude で `/reload-plugins` が必要） |
| ローカル検証 | lint / typecheck / test（76件） / `wrangler deploy --dry-run` / E2E 3サイズ（13件成功、2件は意図的なスキップ） / audit 0件 すべて成功 |

再作成は `scripts/setup-cloudflare.sh`（冪等）。

## 4. 利用者の手作業が必要な残り

外部アカウントの画面操作・秘密値の発行が必要なため、エージェントでは実行していない。**画面の場所、URL、入力する値まで含めた詳しい手順は `docs/setup/owner-manual-setup.md` にある。**

1. **Cloudflare API トークン**: ダッシュボード → My Profile → API Tokens → 「Edit Cloudflare Workers」テンプレートに D1 Edit・Queues Edit を追加し、対象アカウントを上記個人アカウントに限定して発行。`gh secret set CLOUDFLARE_API_TOKEN -R daishiman/youtube-analytics`
2. **Google Cloud**（SYS-PTA-P05 の受入前まで）:
   1. プロジェクト作成、YouTube Data API v3 / YouTube Analytics API / YouTube Reporting API を有効化
   2. OAuth 同意画面を External・本番公開（未検証）で作成、スコープ `openid email`（YouTube 連携スコープは feat-youtube-daily-collection で追加）
   3. OAuth クライアント（Web）を作成し、承認済みリダイレクト URI に `https://youtube-analytics.<subdomain>.workers.dev/api/auth/callback` と `http://localhost:8791/api/auth/callback` を登録
   4. `wrangler.toml` の `GOOGLE_CLIENT_ID` を置換、`pnpm wrangler secret put GOOGLE_CLIENT_SECRET`
3. **規約ページの確定**: `public/privacy.html` と `public/terms.html` の「草案」表示を消し、運営者名、連絡先、施行日を記入する（owner-manual-setup.md 6.5 節）
4. **Workers Secret**: `openssl rand -base64 32 | pnpm wrangler secret put TOKEN_ENC_KEY`（初回 deploy 後）
5. **ブランチ保護**: 初回 CI 実行後、main に「PR 必須・`check` と `e2e` を必須チェック」を設定
6. **Claude Code**: `/reload-plugins` で Cloudflare Skills / MCP を有効化

## 5. 関係する全タスク

### 5.1 feat-platform-tenant-auth（公開済み exact-13, Beads `yta-c8g`）

| task | Beads | 内容 | 状態 |
|---|---|---|---|
| SYS-PTA-P01 | yta-c8g.1 | 要件の実装単位への確定 | 実施済み（`docs/feat-platform-tenant-auth/requirements.md`） |
| SYS-PTA-P02 | yta-c8g.2 | Workers/D1/R2 構成とテナント分離の設計 | 実施済み（`architecture.md`、`wrangler.toml`） |
| SYS-PTA-P03 | yta-c8g.3 | 認証・越境防止の設計レビュー | 実施済み（`design-review.md`。未解決 high 0 件） |
| SYS-PTA-P04 | yta-c8g.4 | 受入テストと越境テストの設計 | 実施済み（`test-design.md`） |
| SYS-PTA-P05 | yta-c8g.5 | 基盤・ログイン・テナント・招待の実装 | 実施済み（`src/`、`web/`、`migrations/`） |
| SYS-PTA-P06 | yta-c8g.6 | テスト実行と不具合修正 | 実施済み（76 件成功、`evidence/P06-test-run.txt`） |
| SYS-PTA-P07 | yta-c8g.7 | 受入確認 | ローカルで実施済み（`acceptance.md`。preview は初回 deploy 後） |
| SYS-PTA-P08 | yta-c8g.8 | リファクタリングとマイグレーション整理 | 実施済み（`evidence/P08-migration-empty-db.txt`） |
| SYS-PTA-P09 | yta-c8g.9 | セキュリティと品質の保証 | 実施済み（`qa-report.md`） |
| SYS-PTA-P10 | yta-c8g.10 | 最終レビュー | 実施済み（`final-review.md`。scope_out 0 件） |
| SYS-PTA-P11 | yta-c8g.11 | 証跡の集約 | 実施済み（`evidence/feat-platform-tenant-auth/index.json`） |
| SYS-PTA-P12 | yta-c8g.12 | 運用手順とドキュメント | 実施済み（`runbook.md`、README のセットアップ節） |
| SYS-PTA-P13 | yta-c8g.13 | CI/CD とリリース | ワークフローは静的検査済み（a6 テスト）。Actions の実行は push 後に確認 |

文書はすべて `docs/feat-platform-tenant-auth/` にある。未コミットのため、Beads はまだ open のまま。PR が main へ merge された時点で close する。

### 5.2 未計画の feature（Beads epic のみ。exact-13 task 計画は未生成）

| feature | Beads | 依存 | 計画前ゲート |
|---|---|---|---|
| feat-youtube-daily-collection | yta-04l | platform-tenant-auth | なし |
| feat-csv-media-ingest | yta-9tm | platform-tenant-auth | dev-graph 再同期（`eval-log/dev-graph-resync-required-20260922.json`） |
| feat-skill-analysis-reports | yta-ufd | daily-collection, csv-media-ingest | 同上 |
| feat-web-screens-actions | yta-7o5 | daily-collection, csv-media-ingest, skill-analysis-reports | 同上 |
| feat-retention-ops | yta-sjb | daily-collection | なし |

各 feature は `/dev-graph plan` で P01〜P13（要件確定・設計・設計レビュー・テスト設計・実装・テスト実行・受入・リファクタ・セキュリティ・最終レビュー・証跡・運用手順・CI/CD）の13 task に分解する。計 65 task が未生成。

### 5.3 横断の残課題

- 影響3 feature の dev-graph compile / decompose による再同期（digest を手で置換しない）
- `docs/screens/02-dashboard.png` を週次売上ファネル追補後の prompt から再生成
- 上記 4. の手作業（API トークン・Google Cloud・Secrets・ブランチ保護）
