# feat-platform-tenant-auth 最終レビュー（SYS-PTA-P10）

本 feature の実装境界を `features/feat-platform-tenant-auth.context.json` の purpose、goal、scope_in、scope_out に照らしてレビューした記録である。変化する作業ツリー、テストファイル一覧、実測件数はここへ複製せず、`git status`、`test-design.md`、CI run をそれぞれ正とする。

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
| `wrangler.toml` | S1、S8 | Workers 1 本、D1 `DB`、R2 1 バケット、`MAX_TENANTS = "100"`。Queue producer binding だけを先行配置し、Cron と consumer は実処理が揃う後続 feature で追加する |
| `src/index.ts` | S1 | `fetch` は Hono。`scheduled` と Queue consumer は処理と終端失敗契約を実装する feat-youtube-daily-collection で構成と同時に追加する |
| `src/env.ts` | S1、S8 | binding と Secret の型 |
| `src/http/app.ts` | S1、S6 | ルーティングと共通ミドルウェア。セキュリティヘッダ（P03 の是正） |
| `src/http/middleware.ts` | S3、S6 | 認証ゲート、CSRF ガード、TenantContext の解決 |
| `src/http/auth-routes.ts`、`src/http/google-oauth.ts`、`src/http/cookies.ts` | S3、S4 | OAuth（PKCE、state、nonce）、セッション Cookie、開発用ログイン（localhost 限定） |
| `src/http/api-routes.ts` | S4、S5、S6 | `/api/me`、テナント、メンバー、招待の API |
| `src/domain/tenant-context.ts` | S6 | 役割 × 権限の表と `requirePermission` |
| `src/usecases/*.ts`（common、session、tenants、members、invites） | S3〜S6 | usecase の入口で権限を検査する |
| `src/repositories/*.ts`（db、platform-repository、tenant-scoped-repository） | S2 | `TenantScopedRepository` は tenant_id を固定する |
| `src/lib/crypto.ts`、`src/lib/errors.ts` | S3、S5、S6 | 乱数、SHA-256、HMAC 署名と、エラー形式 |
| `migrations/0001_platform.sql`、`migrations/0002_user_preferences_and_session_cleanup.sql`、`migrations/.gitkeep` | S2 | 基本schemaに加え、sessionと独立したlast-tenant選好・期限cleanup indexを前進migrationで追加。`skill_tokens`はテーブルだけ |
| `public/privacy.html`、`public/terms.html` | S7 | 静的ページ |
| `public/_headers` | S7、S6 | 画面のセキュリティヘッダ（P03 の是正） |
| `web/index.html`、`web/main.tsx`、`web/api.ts`、`web/styles.css` | S3〜S7 | SPA entry、API client、共通style（qa-061 で React と Vite に確定） |
| `web/pages/LoginPage.tsx` | S3、S7 | 同意チェック、Google ログイン、開発用ログイン |
| `web/pages/InvitePage.tsx` | S5 | 招待の受理とメール不一致の案内 |
| `web/pages/Shell.tsx`、`web/components/ShellFrame.tsx` | S4〜S6 | セッション読込・tenant切替・logoutの境界と共通レイアウト |
| `web/pages/SettingsPage.tsx`、`web/components/CreateTenantForm.tsx` | S4〜S6 | tenant単位のmember/invite状態、権限操作、tenant作成。遅延応答をtenant generationで隔離する |
| `web/pages/DashboardPage.tsx`、`web/pages/shell-context.ts` | S4〜S6 | ログイン後の仮置き着地点とShell配下の共有context |

### 2.2 テスト、証跡、開発ツール

| ファイル | 対応 |
|---|---|
| `tests/`、`e2e/`、`playwright.config.ts` | T（P04、P06、P07）。受入条件と補助検査の唯一の対応表は `test-design.md`、実測結果は `pnpm test` / `pnpm e2e` と CI run を正とする |
| `vitest.config.ts`、`vite.config.ts`、`tsconfig.json`、`biome.json`、`package.json`、`pnpm-lock.yaml`、`.node-version` | S1、S8（ビルド、lint、test の土台） |
| `scripts/setup-cloudflare.sh` | S1（D1、R2、Queue を冪等に作る） |
| `scripts/seed-local.sql` | T（ローカル画面テスト用のアカウント。ローカル D1 専用で、remote には流さない） |
| `.dev.vars.example` | S8（ローカルの Secret の雛形。値は入っていない） |
| `.github/workflows/ci.yml`、`.github/workflows/deploy.yml` | S8（P13） |
| `evidence/*.txt` | T（P06〜P09 の実行ログ） |
| `docs/feat-platform-tenant-auth/*.md` | T（P01〜P12 の成果物） |

### 2.3 feature の外にある関連変更（環境構築と、利用者が決めた仕様変更）

| ファイル | 由来 | 扱い |
|---|---|---|
| `.gitignore`（変更） | 環境構築（`.dev.vars`、`test-results/`、`playwright-report/` を ignore） | S8 の秘密分離に必要。保持する |
| `README.md`（変更） | 環境構築の「現況」更新と、P12 のセットアップ節 | P12 の成果物（Write scope に README.md を含む） |
| `docs/setup/environment.md` | 環境構築の手順書 | 保持する。qa-061 と実装の現状に合わせて更新した |
| `system-spec/spec-state.json`、`system-spec/frontend.md`（変更） | 利用者が決めた qa-061（React + Vite + React Router、ECharts、Next.js 不採用）を単一 writer で反映 | 確定章の現行規範へ対象を限定して投影済み。qa-024/qa-031の質疑録とcompiler外の追補節は保持した |
| `eval-log/spec-change-qa-061-20260922.json`、`eval-log/review-queue.jsonl` | 上の仕様変更の記録 | 対象章への投影完了を記録。全章compileとdev-graph再同期は既存gateまで保留 |

## 3. scope_out との照合

| scope_out | 該当する変更 | 判定 |
|---|---|---|
| YouTube API の読取連携と収集 | なし。Cron・`scheduled`・Queue consumer は未構成で、Queue は producer binding の予約だけ。YouTube のスコープは要求しない（`openid email` だけ） | 0 件 |
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
| R5 | React 化前の未使用 entry が残っていた | 是正済み。現行 entry は `web/main.tsx` に一本化 |
| R6 | 監査ログ、レート制限、古いセッション（P03 #33〜35、low） | 受容（理由は design-review.md） |

**未解決のレビュー指摘: 0 件**（R5 はコードの欠陥ではなく、不要ファイルの片付け）。

## 5. 限界

- preview 環境（本物の Google OAuth と workers.dev）と GitHub Actions はローカルレビューの対象外。acceptance.md と runbook.md 4 節の手順で公開時に確認する。
- 本 feature の 13 task は 1 つの作業ツリーで続けて実施した。task 仕様の「1 task 1 branch」とは異なる。
