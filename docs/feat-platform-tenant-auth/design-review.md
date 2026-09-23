# feat-platform-tenant-auth 設計レビュー（SYS-PTA-P03）

最終更新: 2026-09-22。対象は OAuth（Authorization Code + PKCE）、state と nonce の検証、セッション Cookie、招待トークン、テナント越境の防止。観点は OWASP ASVS 5.0 の章立てを使う。本 feature に該当しない章は「対象外」とし、理由を書く。

判定の凡例: **適合** は設計と実装がともに満たし、テストか実物で確認済み。**是正済み** はレビューで不足を見つけ、本 feature 内で直した。**受容** はリスクを理解したうえで現状のままとする。**対象外** は本 feature に該当しない。

## 1. レビュー表

| # | ASVS 章 | 観点 | 判定 | 深刻度 | 根拠（実装・テスト） |
|---|---|---|---|---|---|
| 1 | V1 Encoding and Sanitization | SQL インジェクション | 適合 | — | すべての SQL は D1 の `prepare().bind()` によるプレースホルダ。文字列連結は固定句（`guard`）だけで、利用者の入力を含まない（`src/repositories/*.ts`） |
| 2 | V1 | 出力のエスケープ（XSS） | 適合 | — | 画面は React の JSX で描画し、`dangerouslySetInnerHTML` を使っていない。API は JSON だけを返す |
| 3 | V2 Validation and Business Logic | 入力検証 | 適合 | — | 役割は `isRole` / `isInvitableRole`、メールは `isEmail`、テナント名は 1〜60 文字（空は 400 `VALIDATION_FAILED`。a5 テスト） |
| 4 | V2 | 業務上の制約（最後の owner・上限・招待の1回限り） | 適合 | — | 条件付き UPDATE/DELETE と D1 batch で競合下でも守る。`LAST_OWNER` 409、MAX_TENANTS の並行5件テスト、使用済み招待の再利用拒否（a4/a5） |
| 5 | V3 Web Frontend Security | セキュリティヘッダ（CSP・nosniff・フレーム禁止） | **是正済み** | medium | レビュー時点では未設定だった。`public/_headers` で画面に CSP（`script-src 'self'`、`frame-ancestors 'none'`）・`X-Content-Type-Options`・`X-Frame-Options: DENY` を付けた。`/api/*` には `secureHeaders` と `Cache-Control: no-store` を付けた（health.test のヘッダ検査、`curl -I` で確認） |
| 6 | V3 | CSRF | 適合 | — | 状態を変える要求は `X-Requested-With: yta` を必須にし、`Origin` と `Sec-Fetch-Site` が別オリジンなら 403 `CSRF_REJECTED`。Cookie の `SameSite=Lax` と二重（a3 の CSRF テスト2件） |
| 7 | V3 | Cookie 属性 | 適合 | — | https では `__Host-yta_session`（`Secure`、`Path=/`、Domain なし）、`HttpOnly`、`SameSite=Lax`、`Max-Age=2592000`（auth-flow テスト）。http の localhost のときだけ `Secure` を外す |
| 8 | V4 API and Web Service | 認証の既定値 | 適合 | — | `/api/*` は既定でセッション必須。例外は `/api/health` と `/api/auth/*` だけ（`isPublicApi`）。未登録のパスも 401（a1 テスト）。全ルートが表に載っていることを routes-coverage テストで強制 |
| 9 | V4 | エラー形式 | 適合 | — | `{error:{code,message,hint}}` に統一し、内部例外は `INTERNAL` だけを返す（`app.onError`） |
| 10 | V5 File Handling | ファイルのアップロード | 対象外 | — | 本 feature はファイルを受け取らない（feat-csv-media-ingest で扱う） |
| 11 | V6 Authentication | パスワードや MFA | 対象外 | — | 認証は Google に委譲する。パスワードは保持しない |
| 12 | V6 | 開発用ログインの混入 | 適合 | — | `DEV_LOGIN=1` かつ localhost のときだけ有効で、本番は 404。`DEV_LOGIN` は `.dev.vars` だけに置き、`wrangler.toml` と Secrets には置かない（auth-flow テスト3件。テスト環境は `DEV_LOGIN=0` に固定） |
| 13 | V6 | メール確認済みの要求 | 適合 | — | `email_verified` が false ならログインも招待受理も拒否（`EMAIL_NOT_VERIFIED`、a2/auth-flow） |
| 14 | V7 Session Management | セッション ID の強度 | 適合 | — | `crypto.getRandomValues` による 32 バイト（256bit）で、base64url 化する（`randomToken`） |
| 15 | V7 | サーバ側での失効 | 適合 | — | `sessions` にハッシュだけを保存。ログアウトで削除、30 日で期限切れ（a1 の期限切れとログアウト後のテスト） |
| 16 | V7 | ログインごとの ID 再発行（固定化対策） | 適合 | — | ログインのたびに新しい ID を発行し、既存の Cookie を再利用しない（`loginWithIdentity`） |
| 17 | V7 | 権限変更の即時反映 | 適合 | — | 役割は要求ごとに `tenant_members` から読み直す。削除されたメンバーはそのテナントに入れない（a3/a4） |
| 18 | V8 Authorization | 機能レベルの認可 | 適合 | — | usecase の入口で `requirePermission` を1回だけ呼ぶ。viewer と editor の書込は 403（a3 の 10 件）。欠陥を注入して検知できることを確認済み（test-design.md 4 節） |
| 19 | V8 | オブジェクトレベルの認可（越境） | 適合 | — | `tenantContextFor` は URL の `:id` を信用せず、セッションと一致しなければ 404。`TenantScopedRepository` は全 SQL に `tenant_id` を入れる。全テナント API を越境テストで網羅（a3 と routes-coverage） |
| 20 | V9 Self-contained Tokens | JWT の扱い | 適合 | — | 自前で JWT を発行しない。Google の ID トークンはトークンエンドポイントから TLS で直接受け取り、`iss`・`aud`・`exp`・`nonce`・`email_verified` を検証する（OIDC Core 3.1.3.7。auth-flow テスト） |
| 21 | V10 OAuth and OIDC | PKCE | 適合 | — | S256 と verifier 43 文字以上。verifier・state・nonce は HMAC 署名付きの短命 Cookie（`Path=/api/auth`、10 分）に入れる（auth-flow テスト） |
| 22 | V10 | state による CSRF 防止 | 適合 | — | Cookie の state と照合し、不一致または Cookie なしは `OAUTH_STATE_MISMATCH`（auth-flow テスト2件） |
| 23 | V10 | スコープ最小化 | 適合 | — | `openid email` だけ。YouTube のスコープは feat-youtube-daily-collection で追加する |
| 24 | V10 | リダイレクト URI | 適合 | — | リクエストのオリジンから `/api/auth/callback` を組み立てる。Google 側では登録済み URI だけを受け付ける。ログイン後の遷移先は固定パス（`/` または `/invite`）で、任意の URL にはしない（オープンリダイレクトなし） |
| 25 | V11 Cryptography | ハッシュと乱数 | 適合 | — | 招待トークンとセッション ID は SHA-256 の値だけを保存（a4 の「平文を保存しない」テスト）。乱数は WebCrypto |
| 26 | V12 Secure Communication | TLS | 適合 | — | workers.dev は https 固定。http は localhost の開発時だけ |
| 27 | V13 Configuration | 秘密の分離 | 適合 | — | Workers Secrets（`GOOGLE_CLIENT_SECRET`、`TOKEN_ENC_KEY`）と Actions secrets（`CLOUDFLARE_*`）に分離。`.dev.vars` は gitignore 済み。ワークフローは `secrets.*` 参照だけ（a6 テスト） |
| 28 | V13 | 依存の脆弱性 | **是正済み** | high（開発依存） | `pnpm audit` で sharp < 0.35.4 の high を検出（miniflare 経由の開発依存で、本番の Worker には含まれない）。`pnpm.overrides` で 0.35.4 以上に固定し、0 件にした（qa-report.md） |
| 29 | V14 Data Protection | 個人情報の最小化 | 適合 | — | 保存するのは Google の sub・メール・確認状態だけ。招待プレビューはメールを伏せ字にし（`ab***@example.com`）、テナント名と役割だけを返す（a4） |
| 30 | V14 | 応答のキャッシュ | **是正済み** | medium | #5 と同じ変更で、`/api/*` に `Cache-Control: no-store` を付けた |
| 31 | V15 Secure Coding and Architecture | 依存の向きと単一責任 | 適合 | — | HTTP → Usecase → Repository の一方向。参照先 D1 の解決は `db.ts` の1か所（architecture.md） |
| 32 | V16 Security Logging and Error Handling | 秘密をログに出さない | 適合 | — | ログは `app.onError` の未処理例外 1 か所だけ。Cookie・トークン・Secret は出力しない（qa-report.md の grep） |
| 33 | V16 | 認証イベントの記録 | 受容 | low | ログイン成功と失敗の監査ログはまだない。Workers Observability（`[observability] enabled`）で要求ログは残る。監査ログは feat-retention-ops の運用メーターと合わせて検討する |
| 34 | V2 | 総当たりとレート制限 | 受容 | low | パスワードがなく、招待トークンは 256bit でハッシュ照合のため、推測は現実的でない。Workers の無料枠では Rate Limiting binding を使わない方針（正本 infrastructure 章） |
| 35 | V7 | 同一利用者の古いセッション | 受容 | low | ログインし直しても、古いセッションは期限（30 日）まで残る。ログアウトしたセッションは即時に無効。「全端末からログアウト」は後続の画面 feature で検討する |
| 36 | V17 WebRTC | — | 対象外 | — | 使わない |

## 2. 是正事項のまとめ

| # | 深刻度 | 内容 | 状態 |
|---|---|---|---|
| 5, 30 | medium | セキュリティヘッダと no-store の欠如 | 是正済み（`public/_headers`、`src/http/app.ts`、テストを追加） |
| 28 | high（開発依存） | sharp の既知脆弱性 | 是正済み（`package.json` の `pnpm.overrides`） |
| 33〜35 | low | 監査ログ、レート制限、古いセッション | 受容（理由は表のとおり。後続 feature で再評価） |

**未解決の high は 0 件**（受入条件を満たす）。

## 3. 前提と限界

- レビューは実装後に行った（本来の順序は P03 → P05）。そのため、是正は設計の変更ではなく実装への追加として入れた。
- preview 環境（本物の Google OAuth と workers.dev）での確認は、push と deploy をしていないため未実施。Google の同意画面、実ドメインの Cookie、Actions のログは、初回 deploy 後に acceptance.md の手順で確認する。
