# feat-login-redesign テスト設計（SYS-LRD-P04）

最終更新: 2026-09-24。受入 10 項目（`features/feat-login-redesign.context.json` の acceptance）ごとに、自動テストの置き場所と確かめる内容を対応付ける。

## 1. テストの層

| 層 | 実行 | 置き場所 | 対象 |
|---|---|---|---|
| API・DB（Workers ランタイム上） | `pnpm test` | `tests/login/*.test.ts`、`tests/platform/*.test.ts` | 設定 API、要求スコープ、同意記録、callback、再連携、ヘッダ、migration、暗号化 |
| 画面（Playwright 3 サイズ） | `pnpm e2e` | `e2e/login.spec.ts`、`e2e/smoke.spec.ts` | 並び順、Google ボタン、非活性の理由、エラー表示、再連携バナー、360px、キーボード |
| 静的検査 | `pnpm lint && pnpm typecheck` | — | 型と書式 |

E2E のサイズは mobile 390×844、tablet 820×1180、desktop 1440×900（`playwright.config.ts`）。A8 だけは 360×780 に切り替えて測る。

Google は呼ばない。API テストは `tests/login/oauth.ts` が Google のトークン応答を差し替え、E2E は開発用ログイン（`DEV_LOGIN=1`、localhost 限定）と `scripts/seed-local.sql` のアカウントを使う。

## 2. 受入項目とテストの対応

| # | 受入項目 | API テスト（vitest） | E2E（Playwright） |
|---|---|---|---|
| 1 | 画像の並び・文言と、確定仕様の Google Light ボタン | `security-headers.test.ts`「規約ページ」（製品名と版） | `login.spec.ts` A1（要素順とボタン）、`smoke.spec.ts` 見出し。視覚的な余白・寸法は同じ表示状態のスクリーンショットで別途比較する |
| 2 | 権限一覧は `/api/auth/config` からだけ描き、要求スコープと一致（新規3行・招待1行） | `config-and-scopes.test.ts` 全 5 件 | `login.spec.ts` A2 |
| 3 | 同意まで非活性で理由を示す。ログイン成功で現行版の consent_records を1行追記 | `consent.test.ts`「A3」3 件と「開発用ログインでの同意」 | `login.spec.ts` A3、`smoke.spec.ts` 1 件目 |
| 4 | 古い版は CONSENT_OUTDATED | `consent.test.ts`「A4」2 件と開発用ログインの古い版 | `login.spec.ts` A4 |
| 5 | 権限または refresh token が不足してもログインでき、未連携を回復できる（ボタンはオーナーだけ） | `callback-scopes.test.ts`「A5」、初回 token 不在・再連携・保存先の境界も確認 | `login.spec.ts`「A5」と未連携の表示 |
| 6 | オーナー以外の connect は 403 | `youtube-connect.test.ts`「A6 再連携」5 件 | — |
| 7 | CSP と frame-ancestors 'none' | `security-headers.test.ts`「A7」3 件、`tests/platform/health.test.ts` | `login.spec.ts` A7（信頼表示・規約リンク。ヘッダ自体は API テストと `curl -I`） |
| 8 | 未知コードと error_description を出さない | `callback-scopes.test.ts`「A8」 | `login.spec.ts` A6（未知コードは汎用文言、alert は1つ、URLからも除去） |
| 9 | 360px で横スクロールなし、3 サイズでキーボードだけで操作 | — | `login.spec.ts` A8・A9（3 プロジェクトで実行） |
| 10 | main への push で D1 migration とデプロイ | `storage.test.ts`「migration 0003」3 件（制約と既定値） | —（`.github/workflows/deploy.yml` の実行ログで確認。P13） |

E2E のテスト名の A 番号は画面側の観点番号で、受入番号とは次のように対応する: A1→1、A2→2、A3→3、A4→4、A5→5、A6→8、A7→7、A8・A9→9。

## 3. 境界と異常系

- 招待モードは YouTube のスコープを要求せず、`access_type=offline` も付けない（`config-and-scopes.test.ts`）。
- 使えない招待トークンでも招待の組で表示し、テナント名は出さない（同上）。
- scope が返らないときは partial（`callback-scopes.test.ts`）。
- 初回の全 scope に refresh token が伴わなければ partial とし、再連携で修復できる（同上）。
- 2 回目の同意で refresh token が返らないときは同じ利用者の保存済みの値だけを残す（同上）。
- 選択中が閲覧者テナントなら所有先が一意の場合だけ grant を保存する（同上）。
- 別の Google アカウントで再連携から戻ったら保存せず `YOUTUBE_LINK_MISMATCH`（`youtube-connect.test.ts`）。
- state 不一致の失敗ログインでは同意を記録しない（`consent.test.ts`）。
- `consent_records.source` と `youtube_link_status` の CHECK 制約（`storage.test.ts`）。
- refresh token の AES-GCM は毎回違う暗号文で、別の鍵では復号できない（`storage.test.ts`）。

## 4. テストデータ

`scripts/seed-local.sql` は何度流しても同じ状態に戻る。連携状態の組み合わせは次のとおり。

| テナント | オーナー | youtube_link_status | 使うテスト |
|---|---|---|---|
| テストチャンネルA | owner@example.com | partial（権限は揃うが token 無し） | A5（オーナーは再連携できる） |
| 別チャンネルB | other-owner@example.com（owner@ は閲覧者） | partial | A5（閲覧者は依頼文だけ） |
| 一部許可チャンネルP | partial@example.com | partial | A5（オーナーに再連携） |

`dev:e2e-%` の利用者は smoke の一意メールで作られ、seed を流すと同意記録・トークンごと消える。
