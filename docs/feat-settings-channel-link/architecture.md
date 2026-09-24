# feat-settings-channel-link 設計（SYS-SCL-P02）

全体構成は `architecture/youtube-analytics-system.md` が正。本書は、この feature が追加する部品の境界、API の契約、テーブル、状態遷移だけを書く。

## 1. 画面の部品境界

```
main.tsx（react-router）
├─ PublicLayout ……… /login, /invite/:token（SiteHeader + SiteFooter）
├─ Shell → AppShell … ログイン後の全画面
│   ├─ Sidebar（ロゴ・テナント切替・ナビ5項目。幅900px未満は下部タブ）
│   ├─ Header（画面名・最終更新・アカウントメニュー）
│   ├─ <Outlet>（Dashboard/Videos/Analysis/Actions は PlaceholderPage、Settings は SettingsPage）
│   └─ SiteFooter（3バッジ + プライバシーポリシー | 利用規約）
└─ public/privacy.html, terms.html … 同じフッターを静的 HTML で持ち、文言は E2E で FOOTER_BADGES と一致を検査
```

静的ポリシーページはログインや SPA の起動に依存せず読める必要があるため、フッターの HTML は意図的に重複する。文言の同期は `SiteFooter` との E2E 照合で守る。

共通部品（`web/components/`）: `PageHeader`、`SectionCard`、`StatusBadge`、`DataTable`、`UsageBar`、`DropZone`、`ConfirmDialog`（`Modal` の上に作る）、`Toast`、`NavIcon`。色は CSS 変数だけを使う。

設定画面（`web/pages/SettingsPage.tsx`）は6区画。`GET /api/settings` はメンバー以外の5区画のデータを返す。メンバー区画は既存のテナント・メンバー API を独立して読み込むため、設定取得の失敗時も管理できる。参照画像 `docs/screens/05-settings.png` はメンバー管理追加前の5カードを示す視覚資料であり、6区画の順序と操作は下表と `system-spec/ui-ux.md` が正本。

| 順 | 区画 | 部品 | 書込の条件 |
|---|---|---|---|
| 1 | YouTube連携 | `settings/YouTubeSection` | オーナー |
| 2 | データ取込 | `settings/ImportSection` | オーナー、編集者 |
| 3 | Claude Code連携トークン | `settings/TokenSection` | オーナー、編集者（自分の分だけ） |
| 4 | メンバー（テナント名） | `settings/MemberSection`（別 API） | オーナーだけに表示 |
| 5 | 無料枠の使用状況 | `settings/UsageSection` | 表示のみ |
| 6 | データを削除 | `settings/DeleteSection` | オーナー |

メンバー区画は設定の取得に失敗しても管理できるように、独立して読み込み、常に4番目に置く。

## 2. サーバの層

`src/http/settings-routes.ts`（ルート）→ `src/usecases/{settings,youtube,imports,skill-tokens,usage}.ts`（入口で `requirePermission`）→ `src/repositories/settings-repository.ts`（tenant_id を固定）。外部との接続は `src/adapters/google-youtube.ts`（OAuth、channels.list、revoke）と `src/adapters/cf-analytics.ts`（GraphQL Analytics）に閉じ込め、テストでは差し替える。

## 3. API の契約

エラーは既存の `{error:{code,message,hint}}` 形式。書込はすべて CSRF ガード（Origin / Sec-Fetch-Site）を通す。

| メソッドとパス | 権限 | 成功 | 主なエラー |
|---|---|---|---|
| `GET /api/settings` | 所属者 | メンバー以外の5区画分の JSON（`permissions` 付き） | 403 NO_TENANT |
| `GET /api/usage` | 所属者 | `{usage: UsageItem[]}`。Cloudflareの共有上限は全体値、テナントごとのGoogle API上限は全体合計で推定しない | — |
| `POST /api/youtube/connect` | オーナー | `{url}`（Google 同意画面） | 409 CHANNEL_ALREADY_CONNECTED / CHANNEL_DELETION_PENDING、429 RATE_LIMITED |
| `POST /api/youtube/reconnect` | オーナー | `{url}` | 409 CHANNEL_NOT_CONNECTED |
| `GET /api/oauth/callback` | ログイン | 302 `/settings?select=channel` または `?done=` / `?error=` | 同意拒否 → `?error=SCOPE_NOT_GRANTED` |
| `GET /api/youtube/channel-candidates` | オーナー | `{candidates:[{channelId,title,subscriberCount,linkedElsewhere}]}` | 400 OAUTH_PENDING_EXPIRED |
| `POST /api/youtube/channel` | オーナー | 201 | 409 CHANNEL_ALREADY_LINKED / CHANNEL_MISMATCH / CHANNEL_DELETION_PENDING |
| `DELETE /api/youtube/connection` | オーナー | `{deletionDueAt}` | 400 CONFIRM_MISMATCH |
| `PUT /api/youtube/captions-auto` | オーナー | `{captionsAuto, url}`（ON は追加同意の URL、OFF は読み取り専用で再連携する URL。変化なしは `url: null`） | 403 FEATURE_NOT_READY |
| `GET/POST /api/imports` | 所属者 / 編集者以上 | 最新20件 / 201 `{importId,status,error}` | 400、409 IMPORT_DELETION_PENDING |
| `GET/POST /api/skill-tokens`、`DELETE /api/skill-tokens/:id` | 所属者 / 編集者以上 | POST は 201 で平文を1回だけ返す | 409 TOKEN_LIMIT、404 |
| `POST /api/tenant/delete` | オーナー | `{dueAt}`（削除予約。二重受付しない） | 400 CONFIRM_MISMATCH |

## 4. テーブル（`migrations/0004_settings_channel_link.sql`）

追加だけで、既存テーブルは列を足すだけにとどめる。

| テーブル / 列 | 要点 |
|---|---|
| `tenants.captions_auto` | 0/1。既定 0 |
| `skill_tokens.name` | 必須（既存行は空文字） |
| `channels` | PK `tenant_id`（1テナント1チャンネル）、`channel_id UNIQUE`（別テナントの連携を DB でも拒否）、`status IN ('正常','要再連携')` |
| `channel_oauth_tokens` | refresh token は AES-GCM で暗号化（`v1.<iv>.<ct>`）。`granted_scopes` は空白区切り |
| `oauth_pending` | state ごとの一時状態（10分）。verifier、候補、トークンは暗号化 |
| `imports` | csv / caption / image を1つにまとめた履歴。`(tenant_id, created_at)` の index |
| `usage_counters` / `usage_snapshots` | 前者は後続の日次収集で計測を実装するための準備済みテーブル（現時点で設定画面の使用率には使わない）。後者は Cloudflare 値の1時間キャッシュ |
| `audit_log` | 操作1件ごとに1行 |
| `data_deletions` | 解除とテナント削除の予約。`due_at` は受付から7日以内の期限、`done_at` は削除実行の完了証跡 |
| `rate_limits` | OAuth 開始（20回/時）、トークン発行（10回/時） |

`migrations/0006_channel_deletion_gate.sql` は削除待ち中の新チャンネル保存を拒否する。`0007_channel_cleanup_write_gate.sql` は削除予約の lease と対象世代、テナントの取込世代、R2.put 前の `import_uploads` 台帳、削除待ち中の取込拒否を加える。取込の D1 INSERT は開始時の世代と現在世代が一致するときだけ通す。移行前の未完了予約は旧世代0を対象にし、すでに完了した旧予約は原本の旧/新を識別できないため後続sweepから除外する。

## 5. 連携の状態遷移

```
未連携 ──connect→同意→候補選択──▶ 正常 ──(Google 側で失効 / 字幕 OFF)──▶ 要再連携
  ▲                                │  ▲                                  │
  │                                │  └──── reconnect（同じチャンネルだけ）──┘
  └──── 解除（テナント名で確認 → revoke → 旧データの削除予約 7日）◀──────────┘
```

チャンネルの変更は「解除 → 旧データの削除完了 → 別チャンネルで connect」の順でだけ行う。`scope='channel' AND done_at IS NULL` の予約がある間、OAuth の開始・戻り・確定をサーバで拒否する。`due_at` の到来だけでは解除しない（runbook の「チャンネルを変更する」）。

## 6. 他 feature との引渡し契約

- **CSV/字幕/画像**: 本 feature の `POST /api/imports` は形式・サイズを検査して R2 原本と `imports` の「処理待ち」履歴を作る。解析・行数・期間・失敗理由の確定は `feat-csv-media-ingest` が担う。`imports` はテナント単位なので、旧チャンネル由来の履歴と R2 原本を残したまま新チャンネルを接続してはならない。
- **取込ルール**: 拡張子・上限サイズと `ImportKind` は `src/domain/import-rules.ts` を画面とサーバで共有する。サーバで最終判定し、画面は同じ定義から選択可能形式と案内を描画する。
- **チャンネル削除**: `DELETE /api/youtube/connection` は Google 許可を revoke し、`data_deletions.scope='channel'` の予約を作って専用 Queue へ通知する。Queue consumer は対象テナントの旧チャンネル由来の D1 行（`imports` 履歴を含む）と `tenants/{tenantId}/` 配下の R2 原本を消す。R2 は `imports.r2_key` に載らない孤立オブジェクトも列挙する。各段階は再実行可能にし、完了時点で旧世代の対象が空なのを確認してから該当予約の `done_at` を埋める。失敗時は `done_at` を空に保ち Queue が再試行する。毎日の Cron は未完了予約を再通知し、完了済み旧世代に遅れて着地した原本も再走査する。予約中の `POST /api/imports` と新規連携はサーバと D1 の両方で拒否する。進行中の取込は D1 の intent と世代照合で守る。
- **後続の保持・削除**: `feat-retention-ops` はテナント全削除と30日保持、期限超過の監視を引き続き担う。この縦切りの consumer は `scope='channel'` だけを実行する。`scope='tenant'` をチャンネル削除として完了扱いにしない。

`system-spec/infrastructure.md` の到達形は、03:00 JST の単一 Cron から収集と削除を起動する。本スライスは削除のみ稼働するため、Cron は1本のまま `channel-cleanup-queue` に通知する。未実装の `collect` メッセージを削除 consumer が成功扱いにしないよう、`collect-queue` は別に保つ。日次収集の実装時に同じ Cron の `scheduled` ハンドラへ収集通知を加える。
