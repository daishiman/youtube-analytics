# feat-settings-channel-link 要件（SYS-SCL-P01）

最終更新: 2026-09-24。正本は `system-spec/`（qa-062〜qa-074）と `features/feat-settings-channel-link.context.json`。本書はそれを実装単位（区画・API・テスト）へ対応付ける。

## 1. 目的

オーナーが、分析対象の YouTube チャンネルを設定画面で確かめ、選び、切り替えられるようにする。あわせて、全画面が同じヘッダー、フッター、共通部品で一貫して見えるようにする。`docs/screens/05-settings.png` は5カードの視覚資料。後から確定したメンバー区画を加えた6区画の順序・操作は `system-spec/ui-ux.md` と本書が正。配色は画像を採用せず、`web/styles.css` の既存 CSS 変数だけを使う（qa-068）。

## 2. 利用者の決定（このタスクで確定）

| 論点 | 決定 |
|---|---|
| 別テナントが連携済みのチャンネル | 409 `CHANNEL_ALREADY_LINKED`（候補一覧にも「別のテナントで連携済み」と出す） |
| 字幕の自動取得の上限 | 1日5本（`CAPTION_DAILY_LIMIT = 5`） |
| 個人トークン | 1人5本まで。6本目は 409 `TOKEN_LIMIT` |
| 使用量バーの色 | 70% 以上で黄（`usage-warn`）、90% 以上で赤（`usage-danger`） |
| force-ssl（字幕）の公開範囲 | `OPERATOR_TENANT_ID` のオーナーだけが操作できる。`FORCE_SSL_VERIFIED=1` で全テナントのオーナーへ開放する。それ以外は「準備中」 |
| 配色 | 既存 CSS 変数のみ。例外は注意枠の `#e69500` と白 `#fff` だけ |
| YouTube連携の OAuth クライアント（qa-075） | ワークスペースごとに必須で持ち込む。未登録なら「YouTubeと連携」は押せない。ログインはアプリ共通のまま |
| 利用者に見せる語（qa-076） | 「テナント」ではなく「ワークスペース」。コード・DB・開発者向け文書は tenant のまま。設定画面に Google Cloud の準備手順（8手順）を出す |

## 3. 受入10項目の対応表

| # | 受入項目 | 根拠章 | 区画 / API | 検証方法 |
|---|---|---|---|---|
| AC1 | 画像の5カードにメンバー管理を4番目として加えた6区画を並べ、閲覧者にはメンバー区画と書込ボタンを出さない | ui-ux, frontend（qa-062, qa-067） | `SettingsPage` / `GET /api/settings`（5区画）とメンバー独立API | E2E「6区画が指定順に並ぶ」「閲覧者: メンバー区画と書込ボタンが出ない」、単体 `settings.test.ts` |
| AC2 | OAuth 後に `channels.list mine=true` の候補から選んで連携し、別テナントが連携済みなら 409 | backend, auth（qa-063, qa-069） | `POST /api/youtube/connect` → `GET /api/oauth/callback` → `GET /api/youtube/channel-candidates` → `POST /api/youtube/channel` | 単体 `youtube-link.test.ts`（16件）、E2E「チャンネル選択 409」 |
| AC3 | 再連携は同じチャンネルでだけ成功。変更は、解除 → 旧データ削除完了 → 新連携の順でだけできる | backend, maintenance-ops（qa-063, qa-070） | `POST /api/youtube/reconnect`、`DELETE /api/youtube/connection`、OAuth待機ガード、専用Queue/Cronの削除実行 | 結合「未完了予約中の連携・取込拒否」「旧履歴/孤立R2を消してから完了」「二重通知と遅延原本でも新世代を保護」 |
| AC4 | 字幕 ON で force-ssl を追加し、1日5本まで。OFF で revoke して読み取り専用へ戻る。検証前は運営者以外に「準備中」 | auth, security（qa-064, qa-073） | `PUT /api/youtube/captions-auto` | 単体 `captions.test.ts`（10件）、E2E「字幕: 準備中で押せない」 |
| AC5 | 名前なしでは発行できず、6本目は 409。平文は1回だけ表示する | security（qa-071） | `GET/POST/DELETE /api/skill-tokens` | 単体 `tokens.test.ts`（7件）、E2E「トークン: 6本目は 409、平文は1回だけ」 |
| AC6 | 実測できる共通無料枠は 70% で黄、90% で赤。Cloudflare 値は1時間キャッシュする。YouTube API・D1書込・字幕取得は計測が揃うまで「未取得」にする | infrastructure, maintenance-ops（qa-066, qa-072, qa-075） | `GET /api/usage`（`/api/settings` にも同梱） | 単体 `usage.test.ts`、E2E「実測枠の閾値と未取得3行」 |
| AC7 | 取込履歴に最新20件と失敗理由を出す | backend, database（qa-065） | `GET/POST /api/imports` | 単体 `imports.test.ts`（世代照合・削除待ちを含む）、E2E「取込履歴は失敗理由を表示」 |
| AC8 | 共通 Header/Footer をログイン画面と静的ページを含む全画面で共有する | ui-ux, frontend（qa-067, qa-068） | `AppShell`、`PublicLayout`、`SiteFooter`、`public/*.html` | E2E「/login・/privacy・/terms の共通フッター」「全画面に同じヘッダー・フッター」 |
| AC9 | 各操作を audit_log に1件ずつ残し、Origin が違う書込は拒否する | security（qa-074） | 全書込 API（`audit()`、CSRF ガード） | 単体「別 Origin から 403 CSRF_REJECTED」「拒否された書込は監査ログに残らない」 |
| AC10 | 390×844、820×1180、1440×900 の3サイズで主要操作の E2E が通る | frontend（qa-036） | `e2e/settings.spec.ts` | Playwright の3プロジェクト（mobile、tablet、desktop） |

## 4. 対象外

- 日次収集ジョブの本体（字幕の1日5本の消費は、カウンタ `usage_counters.caption_count` と上限定数だけを用意し、収集側 feat-youtube-daily-collection が使う）
- CSV、字幕、画像の解析と正規化（feat-csv-media-ingest）。本 feature は R2 への保存と履歴行の作成まで
- 個人トークンの検証とスキル連携 API（feat-skill-analysis-reports）
- テナント全削除と30日保持の実行（feat-retention-ops）。チャンネル解除に伴う旧データ削除は、専用 Queue と毎日の Cron による再通知まで本 feature の実装範囲
- 1テナントで複数チャンネルを持つこと、画像の配色の採用、新しい色トークンの追加
