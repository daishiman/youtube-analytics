# 要件: feat-login-redesign（ログイン画面刷新・Channel Insight）

- 画面の正本: `docs/screens/01-login.png`（構成と文言）。画像にある棒グラフ型ロゴと薄いグラフ背景、および青緑のボタンは再現せず、色・ロゴ・背景は共通デザインの正本（qa-063）と Google ボタンの規定（qa-067）に従う。
- 仕様の根拠: `system-spec/` の auth / ui-ux / frontend / security / backend / database 各章の qa-062〜qa-073。
- 土台: feat-platform-tenant-auth（Google ログイン、テナント、招待、規約ページ）。
- task: SYS-LRD-P01〜P13（Beads yta-0sg.1〜.13）。

## 1. 受入対応表（feature acceptance → 根拠 → 検証方法）

| # | 受入要件 | 根拠 qa | 検証方法（自動） | 検証方法（手動・本番） |
|---|---|---|---|---|
| A1 | 画面が 01-login.png と同じ並びと文言である。「Googleでログイン」ボタンは Google ブランド規定の Light テーマ（白地・枠 #747775・文字 #1F1F1F・標準 G ロゴ）である | qa-062, qa-063, qa-067, qa-068 | `e2e/login.spec.ts`「A1」（上から順に要素が並ぶか、ボタンの computed style を確認） | 3 つの画面幅でスクリーンショットを目で確認 |
| A2 | 権限一覧は `/api/auth/config` の応答からだけ描画し、要求スコープと一致する（新規は 3 行、招待は 1 行） | qa-064, qa-065 | `tests/login/config-and-scopes.test.ts`（config の行と buildAuthUrl の scope が同じ SCOPE_SETS から出るか）、e2e「A2」 | 本番の Google 同意画面の権限と見比べる |
| A3 | 同意するまでボタンは押せず、理由を表示する。同意してログインすると、現行版の consent_records が 1 行追記される | qa-066, qa-073 | `tests/login/consent.test.ts`、e2e「A3」 | — |
| A4 | 規約の版が違う `/login` 要求は `CONSENT_OUTDATED` になり、再同意の案内が出る | qa-073 | `tests/login/consent.test.ts`「版不一致」、e2e「A4」 | — |
| A5 | 権限または継続利用用の token が不足してもログインとテナント作成は完了し、`youtube_link_status=partial` を保存する。既存テナントの `none` も含めて案内を出し、連携ボタンはオーナーにだけ出す | qa-065 | `tests/login/callback-scopes.test.ts`、e2e「A5」 | 本番で YouTube の権限を外して許可し、確認する |
| A6 | `/api/auth/youtube/connect` はオーナー以外に 403 を返す | qa-065 | `tests/login/youtube-connect.test.ts` | — |
| A7 | SPA と API が CSP（`frame-ancestors 'none'` を含む）を返す | qa-072 | `tests/login/security-headers.test.ts`（`public/_headers` と定数が一致するか、API 応答のヘッダ） | P09: `curl -I` で確認 |
| A8 | 未知のエラーコードや Google の `error_description` を画面にも URL にも出さない | qa-066 | `tests/login/callback-scopes.test.ts`「Google エラー」、e2e「A8」 | — |
| A9 | 360px 幅で横スクロールしない。3 つの画面幅でキーボードだけで操作できる | qa-062（アクセシビリティ） | e2e「A9」（mobile / tablet / desktop の 3 project） | — |
| A10 | main への push で migration 0003 が本番に適用される | qa-070 | `pnpm check:release:deploy`、`.github/workflows/deploy.yml` | P13: merge 後に deploy のログを確認 |

## 2. 文言表（画面正本）

| 場所 | 文言 |
|---|---|
| 製品名（テキスト） | Channel Insight（自作ロゴマークは置かない） |
| 見出し | YouTubeの実績から、次の一手を。 |
| 説明（新規） | Googleアカウントでログインすると、YouTube Analyticsの読み取り連携も同時に行います |
| 説明（招待） | 招待されたテナントに参加します。読み取るのはメールアドレスだけです |
| 招待の表示（見出しの上） | ○○のテナントに招待されています |
| 権限の行 | YouTubeチャンネル情報の閲覧 / YouTube Analyticsレポートの閲覧 / メールアドレス（各行に「読み取り専用」） |
| 同意チェック | プライバシーポリシーと利用規約に同意します（2 語はそれぞれ /privacy と /terms へのリンク） |
| ボタン | Googleでログイン |
| 同意前の理由 | 同意にチェックすると押せます |
| 未検証アプリの案内 | このアプリはGoogleの検証前です。確認画面で「詳細」→「移動」を選んでください |
| カード下のリンク | Googleのプライバシーポリシー（https://policies.google.com/privacy） |
| フッター | OAuthは読み取り専用 / データは利用者ごとに分離 / 無料枠で運用、「プライバシーポリシー \| 利用規約」 |
| 連携バナー | YouTube 連携が未完了です、「再連携」（オーナーのみ） |
| 設定を読めないとき | 設定を読み込めませんでした。ページを再読み込みしてください |
| 未知のエラー | ログインできませんでした。もう一度お試しください |

製品名「Channel Insight」は、サイドバーのテキスト、ブラウザタブのタイトル、規約 2 ページにも使う（qa-068）。Google ボタンの標準 G ロゴは `public/google-g.svg` から表示する。

## 3. エラーコード表（ログイン画面に出すもの）

| コード | 発生箇所 | 画面の文言 |
|---|---|---|
| CONSENT_REQUIRED | `/api/auth/login` に consent=1 がない | 利用規約とプライバシーポリシーへの同意が必要です。 |
| CONSENT_OUTDATED（新規） | `/api/auth/login` の規約の版が現行版と違う | 利用規約またはプライバシーポリシーが更新されました。内容を確認して、もう一度同意してください |
| OAUTH_STATE_MISMATCH | callback の state が合わない、または Cookie がない | ログインの確認に失敗しました。もう一度ログインしてください。 |
| OAUTH_FAILED | Google がエラーを返した、またはトークン交換に失敗した | Googleとの通信に失敗しました。時間をおいてもう一度ログインしてください。 |
| EMAIL_NOT_VERIFIED | Google のメールアドレスが未確認 | Googleアカウントのメールアドレスが確認されていません。 |
| INVITE_NOT_USABLE / INVITE_EMAIL_MISMATCH / ALREADY_MEMBER | 招待を受け付けられない | 既存の文言のまま |
| （その他・未知） | — | ログインできませんでした。もう一度お試しください |

- 試行回数の制限は持たない。`RATE_LIMITED` というコードと `login_rate_limits` テーブルは作らない（qa-071）。
- ダッシュボードの `?notice=` には `SIGNUP_CLOSED` と `YOUTUBE_LINK_MISMATCH`（新規。再連携を別アカウントで行ったとき）を出す。

## 4. データ

- `consent_records`: 追記だけのテーブル（user_id、terms_version、privacy_version、consented_at、source=login|reconsent）。アカウントを削除するときは一緒に消す。
- `tenants.youtube_link_status`: none（未連携）/ partial（権限または refresh token が不足）/ linked（読み取り2権限と保存済み refresh token が揃う）。
- `oauth_tokens`: テナントごとに 1 行。付与されたスコープと、暗号化した refresh token を持つ。招待でのログインでは作らない。
- 規約の現行版（LEGAL_VERSIONS）: 利用規約・プライバシーポリシーとも `2026-09-24`。

## 5. 範囲外

- 実際の YouTube データの取得（後続の feature で行う）。
- 退会・データ削除 API（まだ作らない。repository に `deleteConsentRecords` だけ用意する）。
- 試行回数の制限、背景の装飾、ロゴマーク。
