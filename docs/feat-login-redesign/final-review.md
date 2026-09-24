# feat-login-redesign 最終レビュー（SYS-LRD-P10）

最終更新: 2026-09-24。差分は `git diff HEAD`（main 5f978da からの未コミット変更）と新規ファイル。dev-graph や仕様生成の成果物（`.dev-graph/`、`eval-log/`、`system-spec/`、`specs/`、`architecture/`、`features/`、`tasks/`、`issues/`）は計画工程の出力なので、ここでは実装差分だけを扱う。

## 1. 差分と scope_in の対応

scope_in の番号は `features/feat-login-redesign.context.json` の並び順（1〜13）。

| ファイル | 変更 | scope_in |
|---|---|---|
| `web/pages/LoginPage.tsx` | 中央カード、テキストの製品名、見出し、権限一覧、同意、Light テーマの Google ボタン、未検証アプリの案内、エラー表示、開発用ログイン | 1, 2, 3 |
| `web/components/LoginIcons.tsx`（新規） | 権限行・信頼表示・注意書きの線画アイコン。製品ロゴと Google の G は含まない | 1 |
| `web/components/TrustFooter.tsx`、`YouTubeLinkBanner.tsx`（新規） | React 画面で使う部品。権限行のバッジは1用途なので LoginPage 内で描画する。静的な規約ページは `public/legal.css` を共有する | 4 |
| `web/pages/DashboardPage.tsx`、`SettingsPage.tsx` | 再連携バナーの差し込みだけ | 4, 8 |
| `web/components/ShellFrame.tsx`、`web/index.html` | 製品名を Channel Insight に | 5 |
| `web/api.ts` | `AuthConfig` 型、連携状態の型、エラー文言（CONSENT_OUTDATED、YOUTUBE_LINK_MISMATCH、未知コードの汎用文言） | 3, 6 |
| `web/styles.css` | ログインカード、配色、フォーカス、タップ領域、360px 対応、バナー | 1, 13 |
| `src/usecases/login-consent.ts`（新規） | `SCOPE_SETS`、表示行、`LEGAL_VERSIONS`、連携状態の判定、同意の記録 | 6, 7, 9 |
| `src/usecases/token-crypto.ts`（新規） | refresh token の AES-GCM | 7 |
| `src/http/auth-routes.ts` | `/api/auth/config`、版の検査、callback の順序、`/api/auth/youtube/connect` | 6, 7, 8, 9 |
| `src/http/google-oauth.ts` | scope 組・`include_granted_scopes`・offline の指定、付与 scope の受け取り | 7, 8 |
| `src/http/cookies.ts` | OAuth 往復用の署名 cookie に、同意した規約の版と再連携（connect）の本人・テナントを追加 | 8, 9 |
| `src/usecases/session.ts`、`tenants.ts` | ログインに「付与 scope の保存 → 同意の追記 → セッション発行」の順を組み込み、`/api/me` の選択中テナントに連携状態を載せる | 7, 9 |
| `src/repositories/platform-repository.ts` | consent_records、oauth_tokens、youtube_link_status の読み書き、`deleteConsentRecords` | 7, 10 |
| `src/lib/errors.ts` | CONSENT_OUTDATED、YOUTUBE_LINK_MISMATCH | 3, 8 |
| `src/http/security-headers.ts`（新規）、`src/http/app.ts`、`public/_headers` | 共通ヘッダ | 11 |
| `migrations/0003_login_consent_youtube_link.sql`（新規） | consent_records、oauth_tokens、tenants.youtube_link_status | 10 |
| `public/privacy.html`、`terms.html`、`legal.css`（新規） | 製品名、版、信頼表示の根拠、inline style の外出し | 5, 12 |
| `public/google-g.svg`（新規） | Google ボタンに使う標準 G ロゴ | 1 |
| `scripts/seed-local.sql` | 連携状態 3 通りのテストデータ、partial@example.com | 13（E2E の前提） |
| `tests/login/*`（新規）、`e2e/login.spec.ts`（新規） | 受入テスト | 13 |

**scope_out に当たる変更: 0 件**。ログイン試行の回数制限、検証申請、テナント・招待・役割の仕組み、YouTube の収集、ダッシュボードと設定の本体機能、レポート用ヘッダには手を入れていない。

## 2. 既存テストの修正（このタスクの成果物ではないが、全体を green に保つために変更）

| ファイル | 理由 |
|---|---|
| `tests/platform/auth-flow.test.ts` | ログイン開始に規約の版が必須になり、新規ログインの scope に YouTube の2つが加わったため |
| `tests/platform/routes.ts` | 公開ルートに `/api/auth/youtube/connect` を追加（未ログインは 401 をハンドラ内で返す） |
| `tests/platform/health.test.ts` | X-Frame-Options を SAMEORIGIN から DENY にしたため |
| `tests/platform/seed.test.ts` | seed のメンバーが 5 → 6 人になり、連携状態とトークン行の検査を追加 |
| `e2e/smoke.spec.ts` | 見出し・同意文言の変更、Google ボタンを `aria-disabled` で判定、3 サイズで並列に動くよう desktop 限定を外した |

## 3. レビューで見た点

| 観点 | 結果 |
|---|---|
| 権限の表示と要求の一致 | 画面は `/api/auth/config` だけから描き、要求 scope と同じ `SCOPE_SETS` から作る。ずれる経路がない |
| 招待で YouTube を要求しない | 招待の組は `openid email` だけ。トークンも連携状態も触らない |
| 不足した連携 | 権限や token が不足してもログインは止めず partial を保存。none/partial に回復導線を出し、操作はオーナーだけ |
| トークン | 暗号化して保存。両スコープと同じ利用者の保存済み refresh token がある場合だけ linked。再同意で token が返らなければ同じ利用者の既存値を残す |
| 規約改定 | 既存セッションは切らない。次回ログインで版を検査し、違えば再同意（`source=reconsent`） |
| エラー | 既知コードだけ日本語で出す。Google の説明文は捨てる |
| ヘッダ | 定義は1か所。静的ファイルと API の両方に付く |

レビュー結果は実装と検査が完了した時点で確定する。画像と現行デザイン決定の差（製品ロゴ・背景・Google ボタンの色）も受入時に確認する。

## 4. 残っている事項（このリポジトリの外、または後続 phase）

| 事項 | 内容 | 対応 |
|---|---|---|
| リポジトリ整合性検査 | resync gate の `current_source_digest` / `current_architecture_digest` を、system-spec の正規フローで正本へ取り込んだ qa-062〜qa-073 の現在値に合わせた（`digest_refresh_log` に記録。PR #2 と同じ扱い）。`generated_from_digest` と gate の status は変えていない。`pnpm check:repo` は OK | 旧3 feature と本 feature の graph node の内容同期（C14 の正式な再分解）は未実施。`eval-log/feat-login-redesign-resync-preview-20260924.md` の対象4ノードを、正式経路が使えるようになった時点で再投影する |
| アカウント削除から同意記録を消す | `deleteConsentRecords` は用意済みだが呼び出し元がない | アカウント削除を作る feature |
| preview での実 Google 確認 | acceptance.md §3 | merge・デプロイ後 |
| main への push で migration とデプロイ | 受入 10 | P13 |
| Beads の依存 | yta-0sg は yta-c8g（feat-platform-tenant-auth）に blocked のまま。yta-c8g のコードは PR #2（merge commit 7b611bc）で main に入っており、Beads には根拠をコメントで残した。graph の status と Beads の status は一致させる決まり（active=open）なので、close は main の clean worktree で dev-graph sync を実行して行う。yta-0sg.1〜.13 も `linked_pr_merged_all` の方針どおり、本 PR の merge 後に同じ sync で done にする | merge 後に main で dev-graph sync |
| ローカルの Google ログイン | `.dev.vars` の `GOOGLE_CLIENT_SECRET` がダミーのため、ローカルで本物の Google ログインを通すと token 交換で失敗し `/login` に戻る。失敗理由はサーバログに `google token exchange failed: status=401 error=invalid_client` のように出る | 本物のシークレット（`GOCSPX-` で始まる値）を `.dev.vars` に入れて `pnpm dev` を再起動 |
