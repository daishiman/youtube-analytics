# feat-platform-tenant-auth 品質保証レポート（SYS-PTA-P09）

最終更新: 2026-09-22。npm の代わりに pnpm を使う（`packageManager: pnpm@10.19.0`）。タスク仕様の `npm run lint`、`npx tsc --noEmit`、`npm audit` は、それぞれ `pnpm lint`、`pnpm typecheck`（= `tsc --noEmit`）、`pnpm audit` に読み替えた。

## 1. 静的検査

| 検査 | コマンド | 結果 | 証跡 |
|---|---|---|---|
| lint と format（Biome 2、recommended ルール） | `pnpm lint` | エラー 0、警告 0 | `evidence/P09-lint.txt` |
| 型検査（src、web、tests、e2e、設定ファイル） | `pnpm typecheck` | エラー 0 | `evidence/P09-typecheck.txt` |
| 依存の脆弱性（high 以上） | `pnpm audit --audit-level=high` | **0 件**（No known vulnerabilities found） | `evidence/P09-audit.txt` |
| 構成の dry-run | `pnpm build` | 成功 | `evidence/P02-build-dry-run.txt` |

### 1.1 是正した事項

- **依存の脆弱性**: 初回の audit で `sharp < 0.35.4`（libheif、GHSA-g89c-p67h-r497 と GHSA-2jg2-4ch7-h545）の high を 1 件検出した。経路は `@cloudflare/vitest-pool-workers > miniflare > sharp` の開発依存で、本番の Worker バンドルには入らない。`package.json` の `pnpm.overrides` で `sharp >= 0.35.4` に固定し、0 件にした。テストとビルドが通ることは再確認済み。miniflare が修正版を取り込んだら overrides を外す。
- **lint が実質無効だった**: `biome.json` の対象が存在しない `test/**` で、ルールも `preset: none` だった。`tests/**` と `recommended` に直し、検出された 2 件（`noTemplateCurlyInString`）を修正した。

## 2. セキュリティ確認

| 観点 | 確認内容 | 結果 | 根拠 |
|---|---|---|---|
| Cookie 属性 | https で `__Host-yta_session; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`。OAuth の往復用 Cookie は署名付きで `Path=/api/auth`、10 分 | 合格 | auth-flow テスト（https と http の両方） |
| CSRF | `X-Requested-With: yta` なし、または別オリジンの書込は 403 `CSRF_REJECTED` | 合格 | a3 の CSRF テスト 2 件 |
| 招待トークンの使い捨て | 使用済み、取消済み、期限切れは拒否。条件付き UPDATE と追加を1つの batch で実行。平文は保存しない | 合格 | a4 テスト（1回限り、取消、期限、ハッシュ保存） |
| セキュリティヘッダ | 画面は CSP、`nosniff`、`X-Frame-Options: DENY`。API は `secureHeaders` と `Cache-Control: no-store` | 合格（本フェーズで追加） | health テスト、`curl -I` |
| 開発用ログイン | `DEV_LOGIN` がない、または localhost 以外なら 404 | 合格 | auth-flow テスト 3 件 |

## 3. Secrets の非露出

| 確認 | 方法 | 結果 |
|---|---|---|
| `.dev.vars` がコミット対象外 | `git check-ignore -v .dev.vars` → `.gitignore:32` | 対象外 |
| `.dev.vars` の実際の値がコミット対象のファイルに出ない | コミット対象の全ファイル（`git ls-files` と未追跡の非 ignore、1051 件）を、`TOKEN_ENC_KEY` の実値で `grep -F` | 0 件 |
| 既知の秘密の形式 | 同じ対象を `ghp_`、`github_pat_`、`AKIA…`、`PRIVATE KEY`、`GOCSPX-`（Google のクライアントシークレット）、`xox[bp]-`、`sk-ant-` で検索 | 0 件 |
| `GOOGLE_CLIENT_SECRET=値` の直書き | 同じ対象を検索 | 既存の Skill の雛形（`<…直接入力>` と変数展開）だけで、実値は 0 件 |
| ワークフロー | `secrets.CLOUDFLARE_API_TOKEN` と `secrets.CLOUDFLARE_ACCOUNT_ID` の参照だけ | a6 テストで直書きがないことを検査 |
| 実行ログ | `wrangler dev` のログを実値で検索 → 0 件。Secret は `("(hidden)")` と表示される | 出ない |
| アプリのログ | `console.error` は `app.onError` の未処理例外 1 か所だけ。Cookie、トークン、env は出力しない | 出ない |

`wrangler.toml` の `GOOGLE_CLIENT_ID` は非秘密（ブラウザの認可 URL にも出る値）。特定時点の設定値はこのレポートへ複製せず、公開前に `pnpm check:release` が形式を検査し、利用者が Google 側の登録値との一致を確認する。

## 4. 結論

- high 以上の脆弱性: **0 件**
- Secrets のリポジトリとログへの露出: **0 件**
- 差し戻す是正事項: **なし**（見つかった事項は本フェーズで是正済み）
