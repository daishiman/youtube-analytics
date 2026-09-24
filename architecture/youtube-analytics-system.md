---
graph_node_id: "arch-youtube-analytics-system"
artifact_kind: "architecture"
artifact_subtypes: ["frontend", "backend", "infrastructure", "data", "security"]
title: "YouTube分析システム アーキテクチャ"
project_id: "youtube-analytics"
domain: "youtube-analytics"
status: "active"
priority: null
start_date: null
target_date: null
iteration: null
owners: ["daishiman"]
tags: ["system-spec", "youtube", "cloudflare", "multi-tenant"]
file_path: "architecture/youtube-analytics-system.md"
template_id: "architecture"
template_version: "1.0.0"
confirmation_status: "confirmed"
evaluation_status: "pass"
confirmation_evidence: {"evaluator": "system-spec-harness:assign-system-spec-completeness-evaluator", "evidence_ref": "eval-log/completeness-findings-20260924-r4.json", "evaluated_digest": "67ad6caea0081a4c30c88d04f0e360b3107cb964cce5e1b73fadd784d3c7b100"}
source_lineage: {"origin_kind": "system-spec-harness", "source_plugin": "system-spec-harness", "source_path": "system-spec/index.md", "source_version": "0.1.14", "source_digest": "09d2b54c176a3694b50a722d975ac4097d544a319ba9dd21381d3f6aac4ec656", "imported_at": "2026-09-24T09:17:58Z"}
created_at: "2026-09-21T14:36:15Z"
updated_at: "2026-09-24T09:17:58Z"
depends_on: []
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
purpose: null
goal: null
scope_in: []
scope_out: []
acceptance: []
architecture_refs: []
parent_feature: null
feature_package_id: null
phase_ref: null
classification_confidence: 0.97
classification_reason: "system-spec の frontend/backend/infrastructure/database/security/auth 章が構成・境界・横断契約を定めるため architecture。5 subtype 全件が確定章に対応"
classification_candidates: [{"artifact_kind": "architecture", "confidence": 0.97, "candidate_path": "architecture/youtube-analytics-system.md"}, {"artifact_kind": "specification", "confidence": 0.45, "candidate_path": "specs/youtube-analytics-system-arch.md"}]
tracker_binding: "none"
beads_linkage: null
github_publication: {"mode": "local_only", "project_aliases": [], "labels": [], "milestone": null}
issue_linkage: null
github_project_linkages: []
pull_request_linkages: []
execution_contexts: []
completion_evidence: {"policy": "manual", "status": "not_applicable", "source": null, "completed_at": null, "reconciled_at": null, "evidence_refs": []}
implementation_readiness: {"status": "complete", "missing_sections": [], "checked_at": "2026-09-24T09:17:58Z"}
---

正本: system-spec/ (system-spec-harness 0.1.14・評価 eval-log/completeness-report-20260921-r6.json)。本ノードは要約と参照であり、詳細・根拠(qa_ref)は各章を正とする。qa-060の週次売上ファネルとpsc-001の分析履歴は手動追補済みで、生成lineageの正式再同期は`eval-log/dev-graph-resync-required-20260922.json`をgateとする。2026-09-24 の設定画面・チャンネル紐付け・共通レイアウト(qa-062〜qa-074)は正規フロー(evaluator r3 PASS)で取り込み、lineage を更新した。qa-075(テナントごとの Google Cloud OAuth クライアント)と qa-076(利用者向け表記『ワークスペース』・準備手順)も同じ経路で追補した。

# Architecture overview

Cloudflare Workers(Free)1本に Hono の REST API・React SPA の静的配信・Cron を同居させ、D1(構造化データ)と R2(画像)を持つ。日次収集の完成形では Queue consumer も同じ Worker に置くが、現在の `feat-platform-tenant-auth` は producer binding と空の scheduled 入口だけを先行配置し、consumer は未構成である。AI分析はシステム内で行わず、各利用者の PC の Claude Code が /api/skill/* 経由でデータを取り出し、report-design-system で作った HTML と結果JSONを反映する。

## Context and drivers

- 完全無料で運用する(Cloudflare Free / Google Cloud 無料 / GitHub 無料枠)。
- YouTube API Developer Policies(III.E.4 派生指標の禁止・30日保持・7日以内削除)と OAuth 機密スコープの制約。
- マルチテナント(owner/editor/viewer)で越境0件。
- 根拠: system-spec/infrastructure.md, security.md, auth.md。

## Goals and non-goals

- Goals: G1〜G5(要件定義書)。毎日1回の自動収集、週次5原因指標と下流結果、直近5回との差分をClaude Codeの1回実行で反映、費用0円、越境0、少数画面。
- Non-goals: アプリ内LLM呼出し、YouTube への書込、因果推論・予測、有料tier、専用デスクトップ/モバイルアプリ(PC・スマホ・タブレットは Web 版を使う)。

## System context and boundaries

外部: Google OAuth、YouTube Analytics API / Reporting API / Data API v3、YouTube Studio CSV、週次事業CSV、Cloudflare(Workers/D1/R2/Queues/Cron Triggers)、GitHub Actions、利用者 PC の Claude Code(launchd による運営者の週次実行を含む)。境界: システムは読取のみで YouTube へ書かない。Claude Code 側は DB も画面も持たない。

## Container and component view

- Worker(単一): Hono ルータ → usecase(TenantContext 必須)→ TenantScopedRepository → D1 / R2。
- scheduled ハンドラ（`feat-youtube-daily-collection` の目標）: Cron `0 18 * * *` で collect/cleanup の通を Queues へ投入。現在は空の入口のみ。
- queue consumer（同 feature の目標）: max_batch_size=1 で collectTenantDaily または cleanup を実行。現在の platform feature には consumer binding も handler も置かない。
- SPA: React + Vite + React Router、Workers の静的アセットとして配信。
- metrics/: M1〜M10、週次売上ファネル、判定保留規則の純関数モジュール。

## Cross-cutting contracts

- 認可: tenant_id はセッション/トークンからだけ導出し、全クエリの先頭条件にする。
- エラー: {error:{code,message,hint}}。
- 出典: 全ての値に `source=api|studio_csv|business_csv` を持たせる。M1〜M10と週次診断のYouTube側入力は`studio_csv`だけで計算し、`lead_route_rate`は分子`business_csv`・分母`studio_csv`の複合由来を保持する。
- 秘密: wrangler secret のみ(TOKEN_ENC_KEY, GOOGLE_CLIENT_SECRET, CF_ANALYTICS_TOKEN=Account Analytics Read のみ・qa-066)。GitHub Secrets は CLOUDFLARE_API_TOKEN(最小権限)と CLOUDFLARE_ACCOUNT_ID。
- 保持: 指標以外のAPIデータは fetched_at を持ち30日で削除。

## Subtype architecture

frontend / backend / infrastructure / data / security の5 subtype を下に記す。対応章: frontend.md + ui-ux.md / backend.md / infrastructure.md + maintenance-ops.md / database.md / security.md + auth.md。

## Architecture decisions

- D-cron: 毎日 JST 3:00 の Cron 1本 + Queues fan-out(qa-058/appr-010)を日次収集の目標構成とする。Cron 自体は投入だけに限り、1テナント=1 consumer 実行でサブリクエスト上限を守る。現在の platform feature は producer-only で、この処理を実装しない。
- 保存先: D1 + R2(qa-026)。1 D1 を tenant_id で行分離し、将来は tenants.db_binding で別DBへ移せる。
- AI実行: Claude Code 側(システムは LLM を呼ばない)。
- 集約: 「レポート版」(追記のみ)と「改善アクション」(一方向遷移)の2集約。
- 週次診断: 5原因指標と結果指標を分離し、負のtarget_gapが最小の1段だけを改善候補にする。全指標目標達成時は候補を作らず、因果を断定しない。
- 履歴: 同一tenant+channelの完了済み直近5版を既存レポートから射影し、HTML本体を重複保存しない。
- チャンネル紐付け: 1テナント1チャンネル(channels の UNIQUE tenant_id / UNIQUE channel_id)。OAuth後に channels.list mine=true から選び、別テナント連携済みは409、変更は解除→旧データ7日以内削除→再連携(qa-063/qa-069)。
- 段階的認可(D-auth): 既定は読み取り専用。字幕自動取得を ON にした人だけ force-ssl を追加同意し captions.download にだけ使う。sensitive scope の検証が通るまで運営者のみ操作可(qa-064/qa-073)。
- 共通レイアウト: 全画面を AppShell(Sidebar+Header+main+Footer)で包み、ログイン・静的ページも同じ Footer を使う。色は既存CSS変数のみ(qa-067/qa-068)。
- YouTube連携の OAuth クライアント(qa-075): テナントごとに必須で持ち込む(tenant_google_clients・シークレットは TOKEN_ENC_KEY で暗号化)。ログインはアプリ共通クライアントのまま。クォータと OAuth 未検証公開の100人上限は、YouTube連携についてはテナントの Google Cloud プロジェクト単位になる。
- 利用者向けの語(qa-076): 画面・APIエラー・規約では『ワークスペース』。識別子と開発者向け文書は tenant のまま。
- 無料枠の外部値: Cron を増やさず、設定画面の表示時に GraphQL Analytics API を読み1時間キャッシュする(qa-066/qa-067)。

## Delivery, migration and rollback

GitHub Actions で PR 時 dry-run、main push で D1 migrations → deploy。ロールバックは Workers のバージョン切り戻し、D1 は前方互換マイグレーションのみ。テナント移行は runbook(export→新DB import→db_binding 切替→旧行削除)。

## Risks and verification

- 無料枠超過 → 無料枠メーターで70%黄・90%赤(qa-072)、MAX_TENANTS=100、字幕取得は1日5本=1,000units(qa-070)。
- force-ssl 未検証の警告画面と100アカウント上限 → 字幕トグル一般公開前に検証申請(qa-073)。
- OAuth 未検証公開の100人上限 → 80人で検証申請。
- Reporting レポートの60日失効 → CSV で補う runbook。
- 越境 → 認可テストと E2E(403/404)。
- 検証は Playwright 3サイズ E2E、M1 固定値テスト、契約テスト。

# Frontend architecture

## Rendering and application pattern

React + Vite + React Router の SPA を Workers の静的アセットで配信。レポートHTMLは sandbox iframe で本体DOMと分離する。

## Routes, screens and navigation

ルートは6画面(ログイン/ダッシュボード/動画/AI分析/改善アクション/設定)+静的ページ2枚(プライバシーポリシー・利用規約)。サイドバー上部にテナント切替。幅900px未満では下部タブ5項目。全ルートを AppShell(Sidebar・Header・Footer)で包み、期間は ?period= で全画面共有する。設定画面は YouTube連携→データ取込→連携トークン→メンバー→無料枠の使用状況→データを削除の順(docs/screens/05-settings.png を区画・配置・文言の正とする)。

## Component and design-system boundaries

グラフは ECharts を採用する（qa-061）。必要な表現は折れ線・横棒・行内の横棒・小さな推移線を中心とし、出典バッジと M1〜M10 開示文は共通コンポーネントにして値の表示と必ず一緒に出す。ダッシュボード先頭は結果、5原因指標、改善候補または全指標目標達成、12週推移+データ品質の4ブロック。AI分析は前回からの変化を先に示す。共通部品 PageHeader/SectionCard/StatusBadge/DataTable(狭幅でカード化)/UsageBar/DropZone/ConfirmDialog(危険操作は名前入力)/Toast を全画面で使い回す。色は web/styles.css の :root CSS変数(--bg/--card/--text/--muted/--line/--primary/--danger/--alert-bg とダーク配色)だけを参照し、新色も同じ :root に追加して部品に色コードを書かない(qa-068)。

## State and data flow

選択中テナントはセッションで持ち、切替時に画面を再取得する。指標はAPIから受け取り、ブラウザ側で再計算しない。

## Backend integration

/api/* を同一オリジンで呼ぶ api client 層。役割に応じてボタンを出し分け、サーバ側でも拒否する。場面画像は R2 の短期URLを遅延読込。

## Performance and observability

グラフは横スクロールさせず幅に合わせて目盛りを間引く。タップ領域44pt以上。

## Frontend verification

Playwright 390×844 / 820×1180 / 1440×900 で主要操作の E2E。閲覧者403・他テナント404・招待の別アカウント拒否・開示文・両バッジ・上限到達を含める。

# Backend architecture

## Runtime and architecture pattern

Hono v4 on Workers。usecase と集約を1対1で対応させる(DDD)。

## Domain and module boundaries

集約は「レポート版」(reports+findings+psych_findings+comment_emotions)と「改善アクション」(actions)。collector(collectTenantDaily)、ingest(Studio CSV・週次事業CSV・字幕・画像)、tenant 管理、metrics/ を分ける。設定画面向けに youtube-connection(OAuth・チャンネル選択・再連携・解除・字幕トグル)、skill-tokens、usage(カウンタ+GraphQL Analytics キャッシュ)、audit を追加する。

## API and service contracts

画面用REST、テナントAPI、/api/skill/*(X-Skill-Api-Version ヘッダ)。`GET /api/skill/export`は週次ファネルと同一tenant+channelの直近5版の履歴射影を返し、`POST /api/skill/reports`は`history_versions_used`を持つ。設定画面用に /api/settings, /api/youtube/*(google-client・connect・channel-candidates・channel・reconnect・connection・captions-auto), /api/oauth/callback, /api/imports, /api/skill-tokens, /api/usage, /api/tenant/delete を置く。詳細は specs/youtube-analytics-system.md の API契約。

## Data and transaction behavior

usecase は1集約だけを1トランザクションで書く。TenantScopedRepository は tenant_id 無しのクエリを組めない。Reporting の修正版は同じ期間の行を置き換える。

## Async processing

`feat-youtube-daily-collection` の目標は Cron `0 18 * * *` → Queues collect-queue(sendBatch) → consumer max_batch_size=1。msg.retry()(max_retries=3・retry_delay=600秒)、最終失敗で collection_status=failed。現在の platform feature は producer binding のみで、成功 ack を行う仮 consumer は置かない。

## Security and resilience

入口で役割を1回検査。YouTube 書込系APIを呼ばない。POST /api/skill/reports は Idempotency-Key で冪等。

## Operations and verification

Workers Logs、無料枠メーター。契約テスト・認可テスト・M1 固定値テスト。

# Infrastructure architecture

## Environments and topology

Cloudflare アカウント1つ、Worker 1本(API・静的配信・Cron)、D1 1つ(binding DB)、R2 1バケット、Queues 1本(collect-queue)。日次収集 feature で同じ Worker に Queue consumer を追加する。現在は producer-only。

## Compute and storage

Workers Free(サブリクエスト50件/実行、CPU 10ms を考慮し Reporting CSV は必要列だけ読む)。D1 無料上限(10個・1つ500MB・書込10万行/日)、R2 Standard 無料10GB-month。Queues は1日約300操作(無料1万/日)。

## IaC and delivery

wrangler.toml(bindings、MAX_TENANTS=100、Cron、Queue producer 設定)。consumer 設定は処理と終端失敗契約を実装する日次収集 feature で同時に追加する。GitHub Actions で dry-run と migrations → deploy。

## Secrets and access

wrangler secret(TOKEN_ENC_KEY, GOOGLE_CLIENT_SECRET, CF_ANALYTICS_TOKEN)。CF_ANALYTICS_TOKEN は Account Analytics Read だけ。CLOUDFLARE_API_TOKEN は Workers Scripts/D1/R2 編集のみ。Google Cloud で YouTube Analytics/Reporting/Data API を有効化。

## Reliability and recovery

Queue の再試行と翌日の直近7日取り直し。削除は即時実行+毎日の再試行で7日以内。Reporting 60日失効は CSV で補う。

## Infrastructure verification

`wrangler deploy --dry-run`、28日連続の収集完了監視(O1)、無料枠メーター70%黄・90%赤(qa-072)。

# Data architecture

## Data domains and ownership

テナント(tenants/tenant_members/tenant_invites)、YouTube 由来(API: daily_metrics/video_metrics/retention_points/comments ほか)、Studio CSV 由来(video_period_metrics/video_daily_metrics/channel_daily_metrics)、事業CSV 由来(business_funnel_weekly)、目標(funnel_targets)、分析(analysis_requests/reports/findings/psych_findings/comment_emotions)、アクション(actions)、資格情報(oauth_tokens/skill_tokens)。全てテナント所有。

## Logical and physical model

全業務テーブルの主キー・索引の先頭に tenant_id。daily_metrics は PK (tenant_id, channel_id, date, content_type)。`business_funnel_weekly`はPK(tenant_id, channel_id, week_start)、`funnel_targets`はPK(tenant_id, channel_id, metric_id, effective_from)。出典ごとに表を分ける。設定画面の追加分: channels(UNIQUE tenant_id・UNIQUE channel_id・status)、oauth_pending(10分・暗号化)、oauth_tokens.granted_scopes、tenants.captions_auto、skill_tokens.name、imports、usage_counters、usage_snapshots、audit_log。画像は R2 の tenants/{tenant_id}/ 配下で、キーを media_assets に保存。

## Access and consistency

TenantScopedRepository 経由のみ。レポート版は追記のみ。分析履歴はreports/findings/actionsから同一tenant+channelの完了済み直近5版だけを射影し、新規版に`history_versions_used`を保存する。D1 batch で1テナント分の収集結果を書く。

## Lifecycle and governance

指標は refresh token の有効性が確認できる間だけ保持(30日超の更新失敗で削除)。指標以外のAPIデータは fetched_at 30日で削除。レポートはコメント本文を持たず comment_id で参照する。

## Migration and recovery

wrangler d1 migrations(前方互換)。テナント単位の別DB移行は db_binding 切替の runbook。

## Data verification

M1=16.97% 固定値テスト、空欄と0の区別、`source=api|studio_csv|business_csv`の出典分離、週次率・target_gap・min_sample・鮮度・全指標目標達成、履歴0/1〜4/5/別tenant除外の検査。

# Security architecture

## Assets, actors and threat model

資産: refresh token、チャンネル指標、コメント本文、レポート。主体: owner/editor/viewer、Claude Code トークン。脅威: テナント越境、権限昇格、招待リンクの流出、トークン漏えい、レポートHTMLのスクリプト実行、規約違反(派生指標・保持期間)。

## Identity and authorization

Google OAuth + PKCE、セッションCookie、個人トークン(SHA-256 保存)。役割の権限表(owner/editor/viewer)を usecase 入口で検査。最後の owner は外せない。連携・解除・字幕トグル・データ削除はオーナーのみ。連携トークンは1人5本まで(qa-071)で発行にレート制限を掛ける。状態変更APIは Origin を検査する。

## Data and secret protection

refresh token は AES-256-GCM(Web Crypto)で暗号化。鍵は Workers Secrets のみ。R2 は非公開で短期URLまたは Worker 経由。

## Application and supply-chain controls

レポートHTMLは sandbox iframe + CSP default-src 'none'。結果JSONは形式・サイズ検証。書込スコープは既定で要求しない。GitHub Actions は最小権限トークン。

## Detection and response

Workers Logs、収集失敗の collection_status、削除の再試行。連携解除時は Google revoke を呼びトークンを削除。字幕トグルOFF時も force-ssl を含むトークンを revoke する。設定・連携・トークン・削除の操作は audit_log に残す。

## Security verification

認可テスト(越境0・閲覧者書込0)、招待の別アカウント拒否、CSP とサンドボックスの確認、force-ssl を captions.download 以外に使わないことのコードレビュー。
