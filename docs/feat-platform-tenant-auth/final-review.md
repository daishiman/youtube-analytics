# feat-platform-tenant-auth 最終レビュー（SYS-PTA-P10）

最終更新: 2026-09-22。対象は作業ツリーの差分全体（`git status --porcelain` で、変更 3 件と未追跡 80 件。`node_modules` や `.wrangler` などの ignore 対象は除く）。判断の基準は、`features/feat-platform-tenant-auth.context.json` の purpose、goal、scope_in（8 項目）、scope_out（5 項目）。

## 1. scope_in の番号

| # | scope_in |
|---|---|
| S1 | Workers 1 本（Hono v4）+ D1（binding DB）+ R2 1 バケットの wrangler 構成と MAX_TENANTS=100 |
| S2 | D1 マイグレーション（users、tenants、tenant_members、tenant_invites、skill_tokens の土台）と TenantScopedRepository |
| S3 | Google OAuth 2.0 Authorization Code + PKCE によるログイン（openid email）とセッション Cookie（256bit、30 日） |
| S4 | 初回ログイン時のテナント自動作成と、上限到達時の受付停止 |
| S5 | 招待リンク（ハッシュ保存、7 日、1 回限り、メール一致、取消）と、メンバーの役割変更、削除、脱退 |
| S6 | TenantContext による usecase 入口での役割検査と、エラー形式 `{error:{code,message,hint}}` |
| S7 | プライバシーポリシーと利用規約の静的ページ、ログイン前の同意 |
| S8 | GitHub Actions（PR で lint、test、dry-run。main で migrations → deploy）と Workers Secrets |
| T | 13 task の成果物そのもの（要件、設計、レビュー、テスト設計、受入、QA、証跡、運用の文書） |

## 2. 全ファイルの対応表

### 2.1 実装（src/、migrations/、public/、web/）

| ファイル | 対応 | 補足 |
|---|---|---|
| `wrangler.toml` | S1、S8 | Workers 1 本、D1 `DB`、R2 1 バケット、`MAX_TENANTS = "100"`。Queue と Cron の宣言は正本 infrastructure 章の構成を先に置いたもので、処理はない（下の `src/index.ts` を参照） |
| `src/index.ts` | S1 | `fetch` は Hono。`scheduled` と `queue` は**空の stub**（ack するだけ）で、収集処理は feat-youtube-daily-collection の範囲。Queue の consumer 宣言に handler が必須なため置いた |
| `src/env.ts` | S1、S8 | binding と Secret の型 |
| `src/http/app.ts` | S1、S6 | ルーティングと共通ミドルウェア。セキュリティヘッダ（P03 の是正） |
| `src/http/middleware.ts` | S3、S6 | 認証ゲート、CSRF ガード、TenantContext の解決 |
| `src/http/auth-routes.ts`、`src/http/google-oauth.ts`、`src/http/cookies.ts` | S3、S4 | OAuth（PKCE、state、nonce）、セッション Cookie、開発用ログイン（localhost 限定） |
| `src/http/api-routes.ts` | S4、S5、S6 | `/api/me`、テナント、メンバー、招待の API |
| `src/domain/tenant-context.ts` | S6 | 役割 × 権限の表と `requirePermission` |
| `src/usecases/*.ts`（common、session、tenants、members、invites） | S3〜S6 | usecase の入口で権限を検査する |
| `src/repositories/*.ts`（db、platform-repository、tenant-scoped-repository） | S2 | `TenantScopedRepository` は tenant_id を固定する |
| `src/lib/crypto.ts`、`src/lib/errors.ts` | S3、S5、S6 | 乱数、SHA-256、HMAC 署名と、エラー形式 |
| `migrations/0001_platform.sql`、`migrations/.gitkeep` | S2 | 5 テーブルに加えて `sessions`（S3 のサーバ側失効に必要。architecture.md 4 節）。`skill_tokens` は**テーブルだけ**で、API はない（feat-skill-analysis-reports の範囲） |
| `public/privacy.html`、`public/terms.html` | S7 | 静的ページ |
| `public/_headers` | S7、S6 | 画面のセキュリティヘッダ（P03 の是正） |
| `web/index.html`、`web/main.tsx`、`web/api.ts`、`web/styles.css` | S3〜S7 | ログイン、招待、設定の最小限の SPA（qa-061 で React と Vite に確定） |
| `web/pages/LoginPage.tsx` | S3、S7 | 同意チェック、Google ログイン、開発用ログイン |
| `web/pages/InvitePage.tsx` | S5 | 招待の受理とメール不一致の案内 |
| `web/pages/Shell.tsx` | S4〜S6 | テナント切替、メンバー管理、招待発行、脱退。ダッシュボードの欄は「ログイン後の着地点」の仮置きで、業務データを持たない |
| `web/main.ts` | —（削除済み） | React 化の前の素の TypeScript 版。どこからも参照されていなかったため 2026-09-23 に削除した（`index.html` は `main.tsx` を読む） |

### 2.2 テスト、証跡、開発ツール

| ファイル | 対応 |
|---|---|
| `tests/platform/*.test.ts`（a1〜a6、auth-flow、health、routes-coverage、seed）、`helpers.ts`、`routes.ts`、`tests/setup.ts`、`tests/env.d.ts`、`tests/raw.d.ts` | T（P04、P06）。受入 A1〜A6 の自動テスト |
| `e2e/smoke.spec.ts`、`playwright.config.ts` | T（P07）。画面の受入 |
| `vitest.config.ts`、`vite.config.ts`、`tsconfig.json`、`biome.json`、`package.json`、`pnpm-lock.yaml`、`.node-version` | S1、S8（ビルド、lint、test の土台） |
| `scripts/setup-cloudflare.sh` | S1（D1、R2、Queue を冪等に作る） |
| `scripts/seed-local.sql` | T（ローカル画面テスト用のアカウント。ローカル D1 専用で、remote には流さない） |
| `.dev.vars.example` | S8（ローカルの Secret の雛形。値は入っていない） |
| `.github/workflows/ci.yml`、`.github/workflows/deploy.yml` | S8（P13） |
| `evidence/*.txt` | T（P06〜P09 の実行ログ） |
| `docs/feat-platform-tenant-auth/*.md` | T（P01〜P12 の成果物） |

### 2.3 feature の外にある差分（既存の未コミット変更と、利用者が決めた仕様変更）

| ファイル | 由来 | 扱い |
|---|---|---|
| `.gitignore`（変更） | 環境構築（`.dev.vars`、`test-results/`、`playwright-report/` を ignore） | S8 の秘密分離に必要。保持する |
| `README.md`（変更） | 環境構築の「現況」更新と、P12 のセットアップ節 | P12 の成果物（Write scope に README.md を含む） |
| `docs/setup/environment.md` | 環境構築の手順書 | 保持する。qa-061 と実装の現状に合わせて更新した |
| `system-spec/spec-state.json`（変更） | 利用者が決めた qa-061（React と Vite の SPA、ECharts、Next.js 不採用）を単一 writer で反映 | feature の外の仕様変更。章の再生成は保留中（`eval-log/spec-change-qa-061-20260922.json` の status は `spec_state_applied_chapter_regeneration_deferred`） |
| `eval-log/spec-change-qa-061-20260922.json`、`eval-log/review-queue.jsonl` | 上の仕様変更の記録 | 同上 |

## 3. scope_out との照合

| scope_out | 該当する変更 | 判定 |
|---|---|---|
| YouTube API の読取連携と収集 | なし。`scheduled` と `queue` は空の stub、YouTube のスコープは要求しない（`openid email` だけ） | 0 件 |
| CSV、字幕、画像の取込 | なし。R2 は binding の宣言だけで、読み書きするコードはない | 0 件 |
| Claude Code 連携 API とレポート | なし。`skill_tokens` はテーブルだけ（scope_in S2 の「土台」） | 0 件 |
| ダッシュボード等の業務画面 | なし。画面はログイン、招待、メンバー設定、テナント切替だけ（S3〜S7 の操作に必要な最小範囲）。ダッシュボードは指標もグラフも持たない仮置き | 0 件 |
| 保持期間の掃除と無料枠メーター | なし | 0 件 |

**scope_out に当たる変更: 0 件。**

## 4. レビュー指摘

| # | 指摘 | 状態 |
|---|---|---|
| R1 | セキュリティヘッダと `no-store` がなかった（P03 #5、#30） | 是正済み |
| R2 | sharp の high 脆弱性（P03 #28、開発依存） | 是正済み（`pnpm.overrides`） |
| R3 | lint の対象パスとルールが実質無効だった | 是正済み（P09） |
| R4 | `.dev.vars` の `DEV_LOGIN=1` がテストへ漏れた | 是正済み（`vitest.config.ts` で固定） |
| R5 | `web/main.ts` が未使用のまま残っている | 是正済み（2026-09-23 に削除。削除後に lint / typecheck / test 76 件 / build が成功） |
| R6 | 監査ログ、レート制限、古いセッション（P03 #33〜35、low） | 受容（理由は design-review.md） |

**未解決のレビュー指摘: 0 件**（R5 はコードの欠陥ではなく、不要ファイルの片付け）。

## 5. 限界

- preview 環境（本物の Google OAuth と workers.dev）と GitHub Actions の実行は、commit、push、deploy をしていないため未確認。acceptance.md と runbook.md 4 節の手順で、初回 deploy 後に確認する。
- 本 feature の 13 task は 1 つの作業ツリーで続けて実施した。task 仕様の「1 task 1 branch」とは異なる。
