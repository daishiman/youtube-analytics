# feat-platform-tenant-auth テスト設計（SYS-PTA-P04）

最終更新: 2026-09-22。受入6項目（requirements.md 1 節）を自動テストへ写像する。

## 1. 実行環境

| 種類 | 道具 | 対象 | コマンド |
|---|---|---|---|
| API（結合） | Vitest 4.1 と `@cloudflare/vitest-pool-workers`（Miniflare 上の workerd と本物の D1） | `tests/**/*.test.ts` | `pnpm test` |
| 画面（E2E） | Playwright、3 サイズ（mobile 390、tablet 820、desktop 1440） | `e2e/*.spec.ts` | `pnpm e2e` |

- マイグレーションは `tests/setup.ts` が `TEST_MIGRATIONS` から毎回適用する。テストは `app.request()` に env を渡して Worker を直接呼ぶ。
- テスト用の Secrets と `DEV_LOGIN=0` は `vitest.config.ts` の miniflare bindings で固定する。開発者の `.dev.vars` がテストへ漏れても結果が変わらない。
- 外部の Google は `fetch` をモックし、PKCE の verifier と code の受け渡しを検査する（auth-flow）。
- ログイン済みの状態は `tests/platform/helpers.ts` の `login()` が作る。この関数は usecase の `loginWithIdentity` を直接呼んで Cookie を作る（Google の往復そのものは auth-flow で別に検査する）。

## 2. 受入6項目 × テスト

| # | 受入項目 | テストファイル | 件数 | 代表的な検査 |
|---|---|---|---|---|
| A1 | 未ログインで `/api/*` は 401 | `a1-unauthenticated.test.ts` | 18 | 保護ルート 12 本を Cookie なしで呼ぶと 401。加えて、でたらめな Cookie、期限切れ、ログアウト後、未登録パス、CSRF ヘッダより 401 が先であること、公開 API は 401 にならないこと |
| A2 | 初回ログインで tenants と owner が1組だけ | `a2-first-login.test.ts`、`auth-flow.test.ts` | 4 + 1 | 1組作成、2回目は増えない、同一利用者の並行ログインでも1組、メール未確認なら何も作らない。コールバック経由の作成も確認 |
| A3 | viewer の書込は 403、他テナントは 404 | `a3-authorization.test.ts` | 19 | viewer 5 本と editor 5 本の書込が 403、403 の後もデータが不変、viewer と editor もメンバー一覧は読める、役割変更は次の要求から効く。越境: t1 の owner が t2 の ID で全テナント API を呼ぶと 404、自テナントのパスに他テナントの資源 ID を混ぜても 404、非所属テナントへの切替は 404、試行後も t2 は不変。CSRF 2 件 |
| A4 | 招待を別アカウントで開くと参加できない | `a4-invite.test.ts` | 12 | メール不一致（ログイン時とログイン後の両方）、大文字小文字の同一視、1回限り、取消、7日の期限、ハッシュだけを保存、プレビューの最小情報、既メンバーは 409 で招待を消費しない、招待できる役割、最後の owner の保護、削除と脱退 |
| A5 | MAX_TENANTS で受付停止 | `a5-tenant-limit.test.ts` | 5 | 上限ちょうどまで作成、上限到達後の初回ログインは作らず `signupClosed`、テナント追加 API は 403 `SIGNUP_CLOSED`（「現在新規の受付を停止しています」）、招待参加は対象外、残り1枠に5人が同時にログインしても1件 |
| A6 | main への push で migrate と deploy | `a6-workflows.test.ts` | 4 | deploy は main への push で起動、`db:migrate:remote` が `deploy` より前、認証情報は `secrets.*` 参照だけ、PR で lint・typecheck・test・build。**実際の Actions 実行ログは push 後にしか取れない**（acceptance.md） |

補助: `health.test.ts`（D1 疎通と応答ヘッダ、2 件）、`routes-coverage.test.ts`（1 件）、`seed.test.ts`（ローカル seed の冪等性、1 件）、`auth-flow.test.ts`（OAuth と開発用ログイン、10 件）。合計 **76 件**（`evidence/P06-test-run.txt`）。

画面の E2E（`e2e/smoke.spec.ts`、5 シナリオを 3 サイズで実行。データを作るシナリオは desktop だけ）:

| シナリオ | 対応 |
|---|---|
| 同意するまで Google ログインは押せない、規約ページが表示される | 同意の要件 |
| 未ログインで `/settings` を開くと `/login` に戻る | A1 の画面側 |
| viewer には「外す」ボタンと招待欄が出ない | A3 の画面側（表示だけの工夫。正本は API の 403） |
| テナントを切り替えると役割の表示が変わる | TenantContext の切替 |
| 初回ログイン → 招待発行 → 別アカウントは拒否 → 本人は参加 | A2、A4 の通し |

## 3. 越境テストの網羅（受入: 全テナントスコープ API）

- `tests/platform/routes.ts` の `PROTECTED_ROUTES` を A1 と A3 の共通の表とする。
- `routes-coverage.test.ts` は `app.routes` から実際に登録された `/api/*` を取り出し、「保護ルート表 + 公開ルート表」と**過不足なく一致**することを検査する。ルートを追加して表への追加を忘れると、このテストが落ちる。したがって、越境テストが新しい API を見逃すことはない。
- A3 の越境テストは、`tenantScoped: true` の 7 本すべてを「他テナントの `:id`」と「自テナントの `:id` に他テナントの `:userId` と `:inviteId`」の 2 通りで呼び、すべて 404 であること、t2 のメンバーと招待が変わっていないことを確認する。

## 4. 「実装前は失敗する」の扱い（欠陥注入による検証）

タスク仕様は「実装前に失敗するテストを書く」ことを求めている。しかし本 feature は実装とテストを同じ作業で書いたため、実装前の状態を後から再現することはできない。代わりに、**実装へ欠陥を注入し、テストが落ちることを確認**した（検証後は元に戻し、`cmp` で一致を確認済み）。

| 注入した欠陥 | 落ちたテスト |
|---|---|
| `PERMISSIONS["members.manage"]` に viewer を追加 | A3「viewer は PATCH/DELETE …/members/:userId で 403」の 2 件 |
| `tenantContextFor` が URL の `:id` をそのまま信用する | A3「他テナントの資源は 404」の越境テスト |
| `vitest.config.ts` で `DEV_LOGIN` を固定しない（`.dev.vars` の `DEV_LOGIN=1` が漏れる） | auth-flow「DEV_LOGIN が無ければ 404」（実際に発生し、固定して解消） |

いずれの欠陥も、テストが検知できることを確認した。

## 5. 手動確認（ローカル）

画面の手順とテストアカウントは runbook.md の「ローカルでの画面テスト」を参照。
