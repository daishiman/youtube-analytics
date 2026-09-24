# feat-login-redesign 品質・セキュリティ報告（SYS-LRD-P08・P09）

最終更新: 2026-09-24。ローカル（`pnpm dev`、http://localhost:8791）で確認した。

## 1. 静的検査と依存関係

| 検査 | 結果 | 記録 |
|---|---|---|
| `pnpm lint`（Biome） | 71 files、指摘 0 | 今回の再検証。旧記録は `evidence/feat-login-redesign/P09-lint.txt` |
| `pnpm typecheck` | エラー 0 | `P09-typecheck.txt` |
| `pnpm audit --audit-level high` | No known vulnerabilities found | `P09-audit.txt` |
| `pnpm test` | 124/124 | 今回の再検証。旧記録は `P06-test-run.txt` |
| `pnpm e2e` | 69/69、skip 0（3 サイズ） | 今回の再検証。旧記録は `P06-e2e-run.txt` |

## 2. 応答ヘッダ（`curl -I`）

`/login`（SPA 本体）、`/privacy`、`/terms`、`/legal.css`、`/api/auth/config` のすべてに次が付いていた（`P09-headers.txt`）。

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- 静的ファイルは `public/_headers`、API は `src/http/app.ts` の middleware が付ける。値の定義は `src/http/security-headers.ts` の1か所で、`_headers` との完全一致をテストで検査している。
- API の応答には `Cache-Control: no-store` も付く。
- `script-src 'self'` と `style-src 'self'` で inline を許していない。規約ページの inline style は `public/legal.css` に移した。

## 3. 情報を漏らさないこと

| 確認 | 結果 |
|---|---|
| Google が `error` と `error_description` を返したとき | callback は `/login?error=OAUTH_FAILED` だけにし、説明文は URL にも画面にも出さない（`callback-scopes.test.ts` A8） |
| 未知のエラーコード（`/login?error=<script>…`） | 画面は「ログインできませんでした。もう一度お試しください」だけ。コードを URL からも除去する（`web/api.ts` の `loginErrorMessage`、E2E A6） |
| refresh token | AES-GCM（`TOKEN_ENC_KEY`）で暗号化して保存。平文は DB に残らない（`storage.test.ts`） |
| 再連携の本人確認 | 戻ってきた Google アカウントの `sub` がログイン中の本人と違えば保存しない（`YOUTUBE_LINK_MISMATCH`） |

## 4. 同意記録の削除

- `PlatformRepository.deleteConsentRecords(userId)` はその利用者の行だけを消す（`storage.test.ts`）。
- **未接続**: このリポジトリにはまだ「アカウント削除」の機能がないため、呼び出し元はない。アカウント削除を作る feature で、利用者行の削除と同じ処理の中でこの関数を呼ぶこと（runbook §6 に記載）。

## 5. アクセシビリティ

コントラスト比（WCAG 2.2 の式で計算。AA は本文 4.5:1、UI 部品 3:1）:

| 組み合わせ | ライト |
|---|---|
| 本文 / カード | 15.62 |
| 補足文 / カード | 5.91 |
| インディゴ（見出し・リンク）/ カード | 8.82 |
| マゼンタ（主操作・フォーカス）/ カード | 6.59 |
| Google ボタンの文字 #1f1f1f / 白 | 16.48 |
| Google ボタンの枠 #747775 / 白 | 4.53 |

- フォーカス: すべての操作要素に 3px のマゼンタの輪（`:focus-visible`）。
- タップ領域: Google ボタン 48px、同意チェックの行とバナーの「再連携」ボタン 44px 以上（開発用ログインはローカル専用なので対象外）。
- 押せない理由: Google ボタンは `disabled` ではなく `aria-disabled="true"` にし、`aria-describedby` で理由文「同意にチェックすると押せます」を読み上げる。Tab で止まるので、押せない理由に気づける。
- Tab 順: 同意チェック → Google ボタンの順（E2E A9 で 3 サイズとも確認）。
- 360px 幅で横スクロールなし（E2E A8）。400px 以下では余白を詰める。

## 6. リファクタリング（P08）

| 重複しやすいもの | 定義の場所 |
|---|---|
| 権限一覧の行と Google へ要求する scope | `src/usecases/login-consent.ts` の `SCOPE_SETS` と `SCOPE_ROWS`（画面は `/api/auth/config` から描くだけ） |
| 規約の版 | `LEGAL_VERSIONS`（同上）。規約 HTML の `data-version` との一致はテストで検査 |
| リダイレクトで戻るエラー文言 | `web/api.ts` の `REDIRECT_MESSAGES`（ログイン画面と Shell が共用） |
| セキュリティヘッダ | `src/http/security-headers.ts` |

振る舞いは変えていない（P06 のテストがそのまま通る）。

## 7. マイグレーション

`migrations/0003_login_consent_youtube_link.sql`（`evidence/feat-login-redesign/P08-migration.txt`）:

- **空の D1**: 0001 → 0002 → 0003 が適用され、seed も成功。もう一度流すと「No migrations to apply」。
- **既存データのある D1**（変更前の seed を入れた状態から 0003 だけを適用）: 成功。既存の 2 テナントは `youtube_link_status=none` になり、consent_records と oauth_tokens は 0 行。既存の利用者は次回ログインで同意を記録する。
- **ローカル seed**: 暗号鍵に依存する偽の refresh token を置かない。YouTube の権限が揃っていても token がないテナント A は `partial` とし、再連携の案内を検証する。

## 8. 残っている事項

| 事項 | 対応先 |
|---|---|
| アカウント削除から `deleteConsentRecords` を呼ぶ | アカウント削除を作る feature |
| preview での実 Google 確認 | P07（acceptance.md §3） |
| main への push で migration とデプロイが通ること | P13 |
