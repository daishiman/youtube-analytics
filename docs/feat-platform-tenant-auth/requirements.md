# feat-platform-tenant-auth 要件表（SYS-PTA-P01）

最終更新: 2026-09-22。正本は `system-spec/`（auth / security / database / backend / infrastructure / maintenance-ops / frontend 章）。本書は正本を実装単位（API・状態遷移・エラーコード）へ落とした写像であり、正本と食い違う場合は正本を優先する。

## 1. 受入6項目 × 根拠章 × 検証方法（1対1）

| # | 受入項目（features/feat-platform-tenant-auth.md） | 根拠章（確定質疑） | 検証方法 | 自動テスト |
|---|---|---|---|---|
| A1 | 未ログインで `/api/*` を呼ぶと 401 になる | security（qa-041〜045 認可）/ auth（qa-014/021 セッション） | Vitest: 公開経路以外の全 `/api/*` を Cookie なしで呼び 401 と `error.code=UNAUTHENTICATED` | `tests/platform/a1-unauthenticated.test.ts` |
| A2 | 初回ログインで tenants と owner の tenant_members が1組だけ作られる | auth（qa-041〜045）/ database（tenants・tenant_members） | Vitest: 同一 Google sub で2回ログイン（並行含む）し tenants=1, owner=1 | `tests/platform/a2-first-login.test.ts` |
| A3 | 閲覧者の書込APIは 403、他テナントの資源IDは 404（越境成功0件） | security（権限表）/ backend（TenantContext・TenantScopedRepository） | Vitest: 全 tenant スコープ API × 役割（owner/editor/viewer/非所属）の行列 | `tests/platform/a3-authorization.test.ts` |
| A4 | 招待リンクを別の Google アカウントで開くと参加できない | auth（招待受理条件）/ security（招待リンク流出の脅威） | Vitest: メール不一致・期限切れ・使用済み・取消済みで拒否、一致時のみ参加 | `tests/platform/a4-invite.test.ts` |
| A5 | テナント数が MAX_TENANTS に達すると新規テナントを作らず受付停止メッセージを返す | backend（毎日収集節: テナント作成API）/ infrastructure（MAX_TENANTS=100） | Vitest: MAX_TENANTS=2 相当で3人目の初回ログインが `SIGNUP_CLOSED`、招待参加は上限対象外 | `tests/platform/a5-tenant-limit.test.ts` |
| A6 | main への push で D1 マイグレーションと deploy が完了する | maintenance-ops（qa-015/028 GitHub Actions） | ワークフロー静的検査（migrations apply → deploy の順序・トリガー）＋ Actions 実行ログ | `tests/platform/a6-workflows.test.ts` |

行数 = 6 = 受入項目数（`scripts` 検査: `grep -c '^| A[0-9] |' docs/feat-platform-tenant-auth/requirements.md` が 6）。

## 2. API 一覧

公開経路（未ログイン可）は `GET /api/health` と `/api/auth/*` のみ。それ以外の `/api/*` はセッション必須（A1）。状態変更メソッド（POST/PATCH/PUT/DELETE）は CSRF 対策として `X-Requested-With: yta` ヘッダと同一 Origin を要求する。

| メソッド・パス | 認証 | 必要な役割 | 概要 | 主なエラー |
|---|---|---|---|---|
| GET /api/health | 不要 | — | 死活確認（D1 疎通） | — |
| GET /api/auth/login?consent=1&invite= | 不要 | — | PKCE の verifier・state を生成し Google 認可画面へ 302。同意（consent=1）必須 | CONSENT_REQUIRED |
| GET /api/auth/callback?code&state | 不要 | — | state 照合 → code 交換 → 利用者作成/更新 → 招待受理または初回テナント作成 → セッション発行 → `/` へ 302 | OAUTH_STATE_MISMATCH, OAUTH_FAILED, EMAIL_NOT_VERIFIED |
| GET /api/auth/invite?token= | 不要 | — | ログイン画面の「○○のテナントに招待されています」表示用（テナント名と役割のみ） | INVITE_NOT_USABLE |
| POST /api/auth/logout | 不要（Cookie があれば破棄） | — | セッション削除と Cookie 失効 | — |
| POST /api/auth/dev-login | 不要 | — | **開発専用**。`DEV_LOGIN=1` かつ localhost のときだけ有効。本番は 404 | NOT_FOUND |
| GET /api/me | 必須 | 所属なしでも可 | 利用者・所属テナント一覧・選択中テナントと役割・受付停止フラグ | — |
| GET /api/tenants | 必須 | 所属なしでも可 | 所属テナント一覧 | — |
| POST /api/tenants | 必須 | — | テナント追加作成（作成者が owner）。MAX_TENANTS 判定 | SIGNUP_CLOSED, VALIDATION_FAILED |
| POST /api/session/tenant | 必須 | 所属 | 選択テナント切替 | NOT_FOUND |
| GET /api/tenants/:id/members | 必須 | viewer 以上 | メンバー一覧 | NOT_FOUND |
| PATCH /api/tenants/:id/members/:userId | 必須 | owner | 役割変更（owner/editor/viewer） | FORBIDDEN, NOT_FOUND, LAST_OWNER, VALIDATION_FAILED |
| DELETE /api/tenants/:id/members/:userId | 必須 | owner | メンバー削除 | FORBIDDEN, NOT_FOUND, LAST_OWNER |
| POST /api/tenants/:id/leave | 必須 | viewer 以上 | 自分が抜ける | NOT_FOUND, LAST_OWNER |
| GET /api/tenants/:id/invites | 必須 | owner | 未使用・未取消の招待一覧（トークンは返さない） | FORBIDDEN, NOT_FOUND |
| POST /api/tenants/:id/invites | 必須 | owner | 招待発行（email, role=editor/viewer）。平文トークン入り URL を1回だけ返す | FORBIDDEN, NOT_FOUND, VALIDATION_FAILED |
| DELETE /api/tenants/:id/invites/:inviteId | 必須 | owner | 招待取消 | FORBIDDEN, NOT_FOUND |
| POST /api/invites/accept | 必須 | — | 招待受理（token） | INVITE_NOT_USABLE, INVITE_EMAIL_MISMATCH, ALREADY_MEMBER |

`:id` は選択中テナント（セッション）と一致しなければ 404（所属の有無を区別して漏らさない）。役割は要求ごとに tenant_members から読み直す（役割変更が即時に効く）。

### 一覧の規模に関する現行スライスの前提

この feature の受入は小規模な閉じたチームでのメンバー・有効招待の正しさを対象とし、件数上限、overflow UI、cursor pagination の性能契約はまだ確定していない。実装は任意の件数上限でデータを切り捨てず、安定順で全件を返す。大規模チームへ公開する前に、system-wide の cursor 方針をこの API/UI の単一契約として具体化し、API・画面・テストを同時に更新する。現時点では未決定の上限値を置かない。

## 3. 状態遷移

### 3.1 ログイン（初回テナント作成）

```
未ログイン ──login(consent)──▶ Google認可 ──callback(state一致)──▶ 利用者 upsert
  ├─ invite あり かつ 受理条件OK ──▶ 招待先テナントの member（上限対象外）
  ├─ 所属0件 かつ tenants(有効) < MAX_TENANTS ──▶ tenant + owner を1組作成（条件付き INSERT で二重作成なし）
  ├─ 所属0件 かつ 上限到達 ──▶ 所属なしのままログイン（画面に「現在新規の受付を停止しています」）
  └─ 所属あり ──▶ 最後に使ったテナント（無ければ最古の所属）を選択
```

### 3.2 招待

```
発行(pending: accepted_at=NULL, revoked_at=NULL, expires_at=発行+7日)
  ├─ 受理(ハッシュ一致・期限内・未使用・未取消・確認済みメール一致) ──▶ accepted（使い捨て。条件付き UPDATE で1回だけ）
  ├─ 取消(owner) ──▶ revoked
  └─ 期限切れ ──▶ expired（行は残し、受理不可）
```

### 3.3 メンバー

owner / editor / viewer 間の変更は owner だけ。最後の owner は降格・削除・脱退できない（LAST_OWNER）。

## 4. エラー形式とコード一覧（確定）

形式: `{"error":{"code":string,"message":string,"hint":string}}`（backend 章 API Design Patterns 適用）。

| code | HTTP | message（利用者向け） | hint |
|---|---|---|---|
| UNAUTHENTICATED | 401 | ログインが必要です | ログイン画面からGoogleでログインしてください |
| FORBIDDEN | 403 | この操作を行う権限がありません | テナントのオーナーに権限の変更を依頼してください |
| CSRF_REJECTED | 403 | 不正なリクエストです | 画面を再読み込みしてからやり直してください |
| NOT_FOUND | 404 | 対象が見つかりません | URLや選択中のテナントを確認してください |
| VALIDATION_FAILED | 400 | 入力内容に誤りがあります | （項目ごとの説明） |
| CONSENT_REQUIRED | 400 | 利用規約とプライバシーポリシーへの同意が必要です | ログイン画面で同意にチェックしてください |
| OAUTH_STATE_MISMATCH | 400 | ログインの確認に失敗しました | もう一度ログインしてください |
| OAUTH_FAILED | 502 | Googleとの通信に失敗しました | 時間をおいてもう一度ログインしてください |
| EMAIL_NOT_VERIFIED | 403 | Googleアカウントのメールアドレスが確認されていません | Googleでメール確認を済ませてからログインしてください |
| SIGNUP_CLOSED | 403 | 現在新規の受付を停止しています | 既存テナントのオーナーから招待を受けてください |
| NO_TENANT | 403 | 所属しているテナントがありません | 招待を受けるか、受付再開をお待ちください |
| INVITE_NOT_USABLE | 404 | この招待リンクは使えません | 期限切れ・使用済み・取消済みの可能性があります。オーナーに再発行を依頼してください |
| INVITE_EMAIL_MISMATCH | 403 | 招待されたメールアドレスと異なるアカウントです | 招待を受けたGoogleアカウントでログインし直してください |
| ALREADY_MEMBER | 409 | すでにこのテナントのメンバーです | テナント切替から選択してください |
| LAST_OWNER | 409 | 最後のオーナーは外せません | 先に別のメンバーをオーナーにしてください |
| INTERNAL | 500 | 内部エラーが発生しました | 時間をおいて再度お試しください |

## 5. 非機能・セキュリティ要件（正本からの写像）

- セッション: ランダム 256bit ID、Cookie は HttpOnly / Secure / SameSite=Lax / Path=/ / Max-Age 30日。D1 には ID の SHA-256 だけを保存。
- OAuth: Authorization Code + PKCE(S256)、state 検証、scope=`openid email`（YouTube スコープは feat-youtube-daily-collection で追加）。
- 招待トークン: 256bit、D1 には SHA-256 のみ、7日、1回限り、確認済みメール一致、取消可。
- user_id / tenant_id はセッションからのみ導出し、リクエストのパラメータを信用しない。
- 権限: owner=全操作+招待+役割変更 / editor=取込・分析依頼・結果取込・アクション更新 / viewer=閲覧のみ。本 feature の書込 API はメンバー管理系（owner のみ）と脱退（全役割）。
- 秘密値: GOOGLE_CLIENT_SECRET・TOKEN_ENC_KEY は Workers Secrets（ローカルは `.dev.vars`）。リポジトリとログに出さない。
- 同意: ログイン前にプライバシーポリシーと利用規約（`/privacy.html`・`/terms.html`）への同意を必須化（YouTube API Developer Policies III.A.2）。

## 6. スコープ外

YouTube 連携と収集、CSV・字幕・画像取込、Claude Code 連携 API（skill_tokens は表の土台のみ）、業務画面（ダッシュボード等）、保持期間の掃除と無料枠メーター。
