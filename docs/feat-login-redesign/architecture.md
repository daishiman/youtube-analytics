# 構成設計: feat-login-redesign

## 1. 変える部分と変えない部分

| モジュール | 変更 | 変えないもの |
|---|---|---|
| `src/http/google-oauth.ts` | `buildAuthUrl` がスコープの組（`SCOPE_SETS`）を受け取る。`exchangeCode` が付与されたスコープと refresh token も返す | ID トークンの claim の検証（iss / aud / exp / nonce / sub / email） |
| `src/http/auth-routes.ts` | `/config` を拡張、`/login` で規約の版を確認、`/callback` の処理順を変更、`/youtube/connect` を新設、dev-login で同意を記録 | PKCE、state、nonce、`/invite`、`/logout` |
| `src/http/cookies.ts` | `OAuthFlow` に `mode`、規約の版、再連携の対象（userId / tenantId）を追加 | 署名付き Cookie（600 秒、path=/api/auth）、セッション Cookie |
| `src/http/security-headers.ts`（新規） | 画面と API で共通の CSP などのヘッダ値を持つ唯一の定義元 | — |
| `src/http/app.ts` | `/api/*` に上の共通ヘッダを付ける | Cache-Control: no-store、authGate、csrfGuard |
| `src/usecases/login-consent.ts`（新規） | `SCOPE_SETS`、`LEGAL_VERSIONS`、付与スコープの判定、同意の記録、トークンの保存 | — |
| `src/usecases/token-crypto.ts`（新規） | refresh token の AES-256-GCM 暗号化（鍵は SHA-256(TOKEN_ENC_KEY)） | — |
| `src/usecases/session.ts` | `loginWithIdentity` が `grant` と `consent` を受け取り、セッション作成より前に記録する | テナントを自動で作る条件、招待の受理、セッションの発行 |
| `src/usecases/tenants.ts` | `getMe` が `currentTenant.youtubeLinkStatus` を返す | — |
| `src/repositories/platform-repository.ts` | 同意、トークン、連携状態、`deleteConsentRecords` のメソッドを追加 | 既存メソッド |
| `migrations/0003_login_consent_youtube_link.sql`（新規） | consent_records、oauth_tokens、tenants.youtube_link_status | 0001 と 0002 |
| `public/_headers` | CSP から `'unsafe-inline'` を外し、`base-uri 'none'` と `form-action` に Google を追加 | — |
| `public/privacy.html`・`terms.html`・`legal.css`（新規） | スタイルを外部ファイルへ移す。製品名、信頼表示 3 つ、スコープ、版を記載 | 運営者の情報 |
| `web/` | LoginPage を作り直す。権限行のバッジは行内で描画し、TrustFooter と YouTubeLinkBanner を用途ごとに分ける。製品名を変更 | ルーティング、Shell の構造 |

## 2. API の形

```
GET /api/auth/config[?invite=TOKEN]
→ 200 {
    devLogin: boolean,
    mode: "signup" | "invite",
    scopes: [{ id: "https://www.googleapis.com/auth/youtube.readonly"|"https://www.googleapis.com/auth/yt-analytics.readonly"|"email", label: string, readOnly: true }],  // id は Google へ要求する scope 文字列そのもの
    termsVersion: "2026-09-24",
    privacyVersion: "2026-09-24",
    inviteTenantName?: string          // 招待トークンが使えるときだけ
  }

GET /api/auth/login?consent=1&terms_version=V&privacy_version=V[&invite=TOKEN]
  consent がない → 302 /login?error=CONSENT_REQUIRED
  版が違う     → 302 /login?error=CONSENT_OUTDATED
  それ以外     → 302 Google（新規は owner-signup スコープ、招待は openid email）

GET /api/auth/callback?code&state | ?error=...
  1. state を照合する → 2. トークンを交換する → 3. 付与されたスコープを判定する（linked / partial）
  → 4. トークンの scope と連携状態を保存する（オーナーで、招待ではない場合だけ）
  → 5. consent_records に追記する（login / reconsent） → 6. セッションを作る → 302

GET /api/auth/youtube/connect        （ログイン必須。オーナー以外は 403 FORBIDDEN）
  → 302 Google（owner-signup スコープ、include_granted_scopes=true）→ 同じ callback（mode=connect）
```

- Google の `error` と `error_description` は捨てて `OAUTH_FAILED` にする。画面にも URL にも出さない。
- 付与されたスコープの判定: トークン応答の `scope` を空白で区切り、`youtube.readonly` と `yt-analytics.readonly` の両方が含まれ、同じ利用者の保存済み refresh token がある場合だけ linked。それ以外は partial。`scope` がなければ partial とみなす。
- refresh token が返ってこなかったとき（2 回目以降の同意）は、保存済みの値を残す（COALESCE）。

## 3. DB の変更（0003）

```sql
ALTER TABLE tenants ADD COLUMN youtube_link_status TEXT NOT NULL DEFAULT 'none'
  CHECK (youtube_link_status IN ('none','partial','linked'));
CREATE TABLE consent_records (id PK, user_id → users, terms_version, privacy_version, consented_at,
  source CHECK IN ('login','reconsent'));        -- 追記のみ。INDEX (user_id, consented_at)
CREATE TABLE oauth_tokens (tenant_id PK → tenants, user_id → users, scope, refresh_token_enc, updated_at);
```

`source` の決め方: その利用者の直前の同意があり、その版が今回と違えば `reconsent`、そうでなければ `login`。

## 4. ヘッダをどこで付けるか

- 定義元: `src/http/security-headers.ts` の `SECURITY_HEADERS`。
- 画面と規約ページ: Workers の静的アセットが `public/_headers` を返す。テストで定数と `_headers` の行が一致することを確認する。
- API: `app.ts` のミドルウェアが同じ定数を付ける。

CSP の値:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'
```

## 5. 既存の実装との境界

- dev-login は Google を通らないので、oauth_tokens と連携状態には触れない。連携状態は seed データで用意する。同意は、画面から版が送られてきたときだけ記録する。
- 再連携（connect）の callback は、ログインしている本人と、Google で認証したアカウントが同じで、しかもまだオーナーであるときだけトークンを保存する。違えば `/?notice=YOUTUBE_LINK_MISMATCH` に戻す。
- `src/lib/errors.ts` には `CONSENT_OUTDATED` を追加する（HTTP 400）。
