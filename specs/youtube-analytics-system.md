---
graph_node_id: "spec-youtube-analytics-system"
artifact_kind: "specification"
artifact_subtypes: ["api"]
title: "YouTube分析システム 要件・機能仕様"
project_id: "youtube-analytics"
domain: "youtube-analytics"
status: "active"
priority: null
start_date: null
target_date: null
iteration: null
owners: ["daishiman"]
tags: ["system-spec", "youtube", "cloudflare", "multi-tenant"]
file_path: "specs/youtube-analytics-system.md"
template_id: "specification"
template_version: "1.0.0"
confirmation_status: "confirmed"
evaluation_status: "pass"
confirmation_evidence: {"evaluator": "system-spec-harness:assign-system-spec-completeness-evaluator", "evidence_ref": "eval-log/system-spec-completeness-ai-analysis-r2.json", "evaluated_digest": "4263d007f0f38086860edfa266115d93e374481082a865d12d234d5376c32094"}
source_lineage: {"origin_kind": "system-spec-harness", "source_plugin": "system-spec-harness", "source_path": "system-spec/00-requirements-definition.md", "source_version": "0.1.14", "source_digest": "d0e8b68964d98aac2d55a96769477c2c986198bb0ce0c281eef1855a10f7d768", "imported_at": "2026-09-24T14:59:43Z"}
created_at: "2026-09-21T14:36:15Z"
updated_at: "2026-09-24T14:59:43Z"
depends_on: []
related_nodes: ["arch-youtube-analytics-system"]
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
classification_reason: "system-spec-harness の要件定義書(U1-U9)と8章の機能要件・API契約を束ねた確定仕様。API契約を含むため api overlay を付与"
classification_candidates: [{"artifact_kind": "specification", "confidence": 0.97, "candidate_path": "specs/youtube-analytics-system.md"}, {"artifact_kind": "document", "confidence": 0.4, "candidate_path": "docs/youtube-analytics-system.md"}]
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

正本: system-spec/ (system-spec-harness 0.1.14・評価 eval-log/completeness-findings-20260924-r3.json)。本ノードは要約と参照であり、詳細・根拠(qa_ref)は各章を正とする。2026-09-24 に設定画面(docs/screens/05-settings.png)・YouTubeチャンネル紐付け・共通レイアウト(qa-074〜qa-086/appr-013・appr-014)を正規フローで取り込んだ。同日、テナントごとの Google Cloud OAuth クライアント(qa-087)と、利用者向け表記『ワークスペース』・Google Cloud 準備手順(qa-088)を追補した。

# 目的と成功状態

YouTubeチャンネルの実績データと週次の事業データを、再現可能な数値分析と Claude Code 上の report-design-system スキルによる改善提案へ変換し、売上に至る5つの原因指標から「目標未達が最大の改善候補」を根拠付きで判断・実行・効果検証できる状態を費用0円で提供する(system-spec/00-requirements-definition.md の U1)。候補は因果推論ではなく優先順位付けであり、全指標目標達成時は候補を作らない。成功状態は同章の成功基準(週次レポート自動生成・改善アクションの前後比較・週次5段ファネルと下流結果の表示・第三者での手順書どおりの完了・月次請求0円・Gemini無料範囲の出典付き文書化・テナント越境0・API/CSV出典バッジ並記)とし、測定値は O1〜O5 に従う。

## スコープ

- 対象: 要件定義書 scope.in の項目(Googleログインとテナント自動作成、YouTube Analytics/Reporting/Data API 読取連携、Studio CSV手動取込3種、週次事業CSVの手動取込、毎日1回 JST 3:00 の定期取得、字幕・画像のR2保存、コメント・維持曲線、心理分析、CSV起点ダッシュボード、Claude Code連携スキル、個人トークンと反映API、HTMLレポートと改善アクション管理、launchd定期実行、Gemini無料範囲の調査記録、Cloudflare/GitHub/Google Cloud 設定手順)。MVPの外部事業データproviderは週次manual CSVだけとする。
- 対象外: scope.out の8項目(GA4・Search Console、アプリ内LLM呼出し、因果推論・予測・機械学習、有料プラン前提、YouTubeへの書込、多数の画面、API由来データからの派生指標、画面自動操作による Studio 取得)。

## 用語と主体

- テナント: 初回ログインで作られるデータ分離の単位。1つの D1 に tenant_id で行分離する。利用者に見せる文言(画面・メール文面・APIエラー・利用規約・プライバシーポリシー)では『チャンネル管理』と表記し(qa-096 が qa-088 の『ワークスペース』を置換。1テナント1チャンネルのため)、コード・DB・開発者向け文書は tenant/テナントのまま。
- 役割: owner(全操作・YouTube連携・招待・役割変更・削除) / editor(取込・分析依頼・結果取込・アクション更新) / viewer(閲覧のみ)。
- 出典: API(YouTube API の公式値)、Studio CSV、週次事業CSV。YouTube側の派生指標 M1〜M10 は Studio CSV 由来だけで計算する。
- 原因指標: インプレッション、CTR、加重平均視聴率M1、誘導率(既定表示はLINE誘導率)、問い合わせ→成約率。結果指標: 売上、成約数、参考として登録者数。
- 主体: 運営者兼利用者、一般クリエイター、Google(API提供者)、各利用者の Claude Code 実行環境(要件定義書 stakeholders)。

## ユースケースとユーザーフロー

具体的やりたいこと I1〜I10 に対応する。主要フロー: (1) Googleログイン→テナント作成→YouTube読取連携(owner。OAuth後に channels.list mine=true の候補から1チャンネルを選ぶ。1テナント1チャンネル、変更は連携解除→旧データ7日以内削除→再連携・qa-075) (2) 毎日 JST 3:00 に自動収集 (3) Studio CSV・週次事業CSV・字幕・画像の取込 (4) AI分析画面で依頼 A-xxxx を作りコピーしたプロンプトで Claude Code の /yt-analyze を実行(運営者の launchd 週次実行ではスキルが POST /api/skill/requests で依頼を作る・qa-095/qa-097)しデータ取得→週次5段ファネルと下流結果を分析→report-design-system→HTMLと結果JSONを自動送信、または画面へJSONを貼り付けて取込 (5) 対象ファネル段を持つ改善アクションを 未着手→実施中→効果測定中→完了 で管理し、同じ原因指標と下流結果を次回レポートで前後比較 (6) 招待リンクでメンバー追加。詳細は system-spec/ui-ux.md と backend.md。

## 機能要件

- 収集: Analytics API で直近7日を毎日取り直し、動画別は D-3 単日クエリで積み上げ、インプレッション・CTR は Reporting API(channel_reach_basic_a1)から取得する(backend.md / infrastructure.md)。
- 取込: 表データ/グラフデータ/合計の3種Studio CSVを既存の判定規則で正規化する。週次事業CSVは `week_start`(JST月曜), `channel_id`, `route_label`(既定LINE), `route_visits`, `inquiries`, `closed_deals`, `revenue_jpy` を受け、nullと0を区別して tenant+channel+week 単位で冪等に上書きする。
- 分析連携: /api/skill/export がYouTubeデータ、週次ファネル、目標、判定保留理由、同一テナント/チャンネルの完了済み直近5版の分析履歴パックを出典付きで書き出し、/api/skill/reports が前回仮説の当否・施策効果・ファネル段・改善候補・下流結果・参照版番号を含む版を追記だけで受ける。
- 画面: ログイン/ダッシュボード/動画/AI分析/改善アクション/設定の6枚+静的ページ2枚(ui-ux.md)。ダッシュボード先頭4ブロックは結果サマリー、週次5段ファネル、目標未達が最大の改善候補+次のアクション(または全指標目標達成)、12週推移+データ品質とし、動画別実績は動画画面または詳細へ置く。
- 管理: テナント・メンバー・招待、データ削除、無料枠メーター。
- 設定画面(qa-074/qa-079): 順序は YouTube連携→データ取込→Claude Code連携トークン→メンバー(オーナーのみ)→無料枠の使用状況→データを削除。連携カードはチャンネル名・登録者数(表示のみ)・状態(正常/要再連携/未連携)・次回収集(毎日 3:00 JST・qa-077)・最終収集/最終CSV取込・付与スコープ・字幕自動取得トグル・再連携・連携解除。取込はCSV/字幕(SRT・VTT)/画像のタブ別ドロップ領域と履歴(最新20件・失敗理由)。トークンは名前必須・平文は発行時1回表示・1人5本まで(6本目は409・qa-083)・失効は確認付き。
- AI分析画面(qa-089〜qa-093・docs/screens/03-ai-analysis.png を区画・配置・文言の正、色は既存CSS変数): ①依頼(期間 最新28日/90日/1年/任意〈最長1年・未来日不可〉、補足指示≤1000字、唯一の主ボタン『Claude Code用プロンプトをコピー』で依頼 A-xxxx を作成しプロンプトをコピー、『使用するデータ』件数表と内訳モーダル、『データは自動送信されません』注記) ②実行状況(ID・ステータス・対象期間・作成日時・進捗・依頼内容・操作。待機中/実行中=キャンセル、完了=詳細、失敗/取消=同条件で新IDの再実行。週次自動実行の依頼に『自動』バッジ・qa-095) ③レポート(一覧の検索とアーカイブ表示、『結果の取り込み』JSON貼付〈選択中の依頼へ紐付け、未選択なら完了済み依頼を1件作る・qa-092〉、詳細の先頭に『前回からの変化』→週次5段ファネル→下流結果→改善候補、タブ 要約/視聴者心理/コメント感情/離脱場面/根拠データ/HTMLレポート、次に取るべきアクションのチェック選択登録〈初期は主対象のみ・二重登録なし・qa-091〉、版履歴と2版比較、アーカイブ/元に戻す〈アーカイブ版は一覧と analysis_history から外す・削除しない・qa-090〉)。下部に選択中の依頼バー。閲覧者は閲覧のみ。結果JSONの形は画像内の例でなく docs/analysis/dashboard-analysis-catalog.md §6 の正本に従う。
- 共通レイアウト(qa-079): AppShell=Sidebar(ロゴ・テナント切替・ナビ5項目、900px未満は下部タブ)+Header(画面名・最終更新・期間 ?period= 共有・アバターメニュー)+main+Footer(3バッジ+プライバシーポリシー|利用規約。ログイン・静的ページも同じ)。共通部品 PageHeader/SectionCard/StatusBadge/DataTable/UsageBar/DropZone/ConfirmDialog/Toast。色は web/styles.css の既存CSS変数だけを使い、画像の色は採用しない(qa-080)。

## 非機能要件

- 費用: Cloudflare Free / Google Cloud 無料 / GitHub 無料枠で完全無料。無料枠使用率の警告は70%で黄・90%で赤(qa-084。O3の80%超アラートはこの2段で満たす)。
- 規模: テナント上限 MAX_TENANTS=100(D1 書込10万行/日に収める)。
- 性能: 1テナントの収集を1回の Queue consumer 実行に収め、サブリクエスト上限50件内(約16件)。
- 表示: 幅360px以上で全操作、タップ領域44pt以上、各画面で最初に見える情報ブロックは4つ以内(O5)。
- 規約: YouTube API Developer Policies III.A.2 / III.D.2.c(Revocation).i / III.E.4 を遵守する(security.md。旧記載 III.D.2.3 は番号表記の誤りとして 2026-09-24 に公式原文で訂正)。

## UI・状態遷移

6画面の構成・スマホ幅の下部タブ切替は system-spec/ui-ux.md を正とする。ダッシュボードの先頭4ブロックは結果サマリー(売上・成約数・登録者数は参考)、週次5段ファネル、目標未達が最大の改善候補と次のアクション(または全指標目標達成)、12週推移とデータ品質。各原因指標は actual / target / target_gap または判定保留理由を示し、因果関係を断定しない。状態遷移: 分析依頼 待機中→実行中→完了|失敗|取消(一方向。取消は待機中・実行中から可能な終端で、取消後の進捗・結果の送信は409 REQUEST_CANCELED・qa-089。再実行は新しい依頼で retry_of を記録)、レポート版のアーカイブ/元に戻す(追記のみの版は変えず別表で管理・qa-090)、改善アクション 未着手→実施中→効果測定中→完了(一方向・完了時に判定 効果あり|不明|効果なし と baseline/result 必須)、テナントの collection_status(ok|failed)。

## ビジネスルールと検証

- API由来の値から新しい指標を計算しない(比率・スコア・合算・CTR再計算を含む)。M1〜M10 は CSV 由来の行だけから計算し、区画に「CSVの取込データから計算した値で、YouTube公式の数値ではありません」を常時表示する。
- 週次ファネルはStudio CSVに週境界を揃え、`lead_route_rate=route_visits/views*100`(viewsは同一週Studio CSV)、`inquiry_close_rate=closed_deals/inquiries*100`(同週スナップショット)、`target_gap=(actual-target)/target` とする。targetが正で判定可能かつtarget_gapが負の指標だけを候補にし、その中で最小のものを改善候補にするが因果とは呼ばない。全指標が目標以上なら候補を作らない。分母0・欠損・targetが0以下または未設定・min_sample未達・週未確定または週末後の取込なしは判定保留にする。min_sampleの母数は順にimpressions / impressions / engaged_views / views / inquiriesとする。
- レポート版は追記のみで過去版を更新しない。履歴パックは同一tenant+channelの完了済み直近5版だけを返し、0件は初回分析として正常、別tenant/channelは混ぜない。新規版は`history_versions_used`を保存する。video_angles は利用者確定後に再分析で上書きしない。
- 招待受理はトークンハッシュ一致・7日以内・未使用・未取消・確認済みメール一致のときだけ。最後の owner は外せない。
- 検算: 2026-08-22〜09-19 の実CSVで M1=16.97% を固定値テストにする(maintenance-ops.md)。

## API契約

Hono v4 on Workers の REST。画面用: GET /api/me, GET /api/dashboard(週次ファネルと判定保留理由を含む), POST /api/csv(Studio CSVまたは週次事業CSV), GET/POST /api/analysis-requests, GET /api/analysis-requests/:id(/prompt), POST /api/analysis-requests/:id/cancel, POST /api/analysis-requests/:id/retry, GET /api/analysis/data-summary, GET /api/reports(?q=&archived=, /:id, ?version=, /diff), POST /api/reports/import(422 INVALID_REPORT_JSON は line 付き), PUT/DELETE /api/reports/:id/archive, POST /api/reports/:id/actions({keys:[...]}・qa-091), GET/PATCH /api/actions/:id, GET /api/videos, GET /api/videos/:id, PUT /api/videos/:id/angle, DELETE /api/me/data。テナント: GET/POST /api/tenants, POST /api/session/tenant, POST/DELETE /api/tenants/:id/invites, POST /api/invites/accept, PATCH/DELETE /api/tenants/:id/members/:userId, POST /api/tenants/:id/leave。設定・連携(qa-079): GET /api/settings, POST /api/youtube/connect, GET /api/oauth/callback, GET /api/youtube/channel-candidates, POST /api/youtube/channel(別テナント連携済みは409・qa-081), POST /api/youtube/reconnect(同じチャンネルのみ), DELETE /api/youtube/connection, PUT /api/youtube/captions-auto, GET/POST /api/imports, GET/POST/DELETE /api/skill-tokens, GET /api/usage, POST /api/tenant/delete。スキル連携(個人トークン): POST /api/skill/requests(launchd 週次実行用。実行中・created_via='skill' で作成・qa-095), GET /api/skill/export(request_id 必須のまま), PATCH /api/skill/requests/:id(progress・stage 1-3・status・error。取消済みは409), POST /api/skill/reports, POST /api/skill/transcripts, POST /api/skill/media。操作単位の契約は下の「API: 共通契約」節。

## データモデル

D1 の業務テーブル(users, tenants, tenant_members, tenant_invites, channels, oauth_tokens, daily_metrics, video_metrics, csv_imports, video_period_metrics, video_daily_metrics, channel_daily_metrics, business_funnel_weekly, funnel_targets, video_angles, retention_points, transcripts, media_assets, comments, comment_emotions, analysis_requests, reports, findings, psych_findings, actions, skill_tokens)は全て tenant_id を主キー・索引の先頭に持つ。`business_funnel_weekly` は tenant+channel+week で冪等upsertし、`funnel_targets` は metric_id, target_value, min_sample, effective_from を持つ。出典で表を分け、API由来・Studio CSV由来・事業CSV由来を混ぜない。R2 は1バケットでキーを tenants/{tenant_id}/ で分ける。設定画面の追加分(qa-079/qa-081): channels(UNIQUE tenant_id・UNIQUE channel_id・status)、oauth_pending(10分・暗号化)、oauth_tokens.granted_scopes、tenants.captions_auto、skill_tokens.name、tenant_google_clients(テナントの OAuth クライアントID・暗号化シークレット・qa-087)、imports(kind統合の取込履歴)、usage_counters(YouTube units・D1書込行数・字幕取得本数)、usage_snapshots(Cloudflare GraphQL Analytics の1時間キャッシュ)、audit_log。AI分析画面の追加分(qa-089〜qa-095): analysis_requests(PK tenant_id,request_id・status に取消・progress・stage・instruction≤1000字・retry_of・report_id・canceled_at/by・created_via web|skill|import)、report_archives(PK tenant_id,report_id。reports は追記のみを保つ)、actions.source_report_id/source_key と UNIQUE(tenant_id,source_report_id,source_key)。列定義は system-spec/database.md。

## 認証・認可

Google OAuth 2.0 Authorization Code + PKCE。scope は openid email youtube.readonly yt-analytics.readonly、access_type=offline(字幕の captions.download を望む利用者だけ youtube.force-ssl を追加同意)。字幕自動取得トグルは既定OFF、ONで incremental authorization により force-ssl を追加し新着動画の字幕を1日5本(1,000units)まで取得、OFFで revoke→読み取り専用で再連携する(qa-076/qa-082)。force-ssl は sensitive scope のため、トグルの一般公開前に検証を申請し、通るまでは運営者テナントのオーナーだけが操作でき他の利用者には『準備中』と表示する(qa-085)。YouTube連携(連携・コールバック・トークン交換/更新・revoke・字幕の追加同意)は、テナントのオーナーが設定画面で登録した自分の Google Cloud プロジェクトの OAuth クライアントで行い、未登録のあいだは連携を始められない。Googleログインはアプリ共通のクライアントのまま。シークレットは TOKEN_ENC_KEY で暗号化して保存し画面・APIに返さない。クライアントIDの変更・削除は既存連携を『要再連携』にする。設定画面には初めての人向けの8手順の準備ガイドを表示する(qa-087/qa-088)。連携・解除・字幕・削除はオーナーのみ。AI分析の書込(依頼作成・キャンセル・再実行・取込・アーカイブ・アクション登録)は content.write(owner/editor)だけで閲覧者は403、他テナントの依頼・レポートは404、依頼作成は画面・スキル合算で1ユーザー1分10件(超過429)、プロンプトにトークン平文を含めない(qa-093。具体値は qa-094 の但し書きどおり個別未確認)。POST /api/skill/requests は発行者が content.write を失っていれば403。セッションは256bit ランダムIDの HttpOnly/Secure/SameSite=Lax Cookie・30日。Claude Code 用個人トークンは (tenant_id, user_id) ごとに発行し SHA-256 で保存、権限は発行者の役割の範囲。全APIで tenant_id はセッション/トークンから導き、tenant_members で役割を確認する(auth.md / security.md)。

## エラー・例外・回復

エラー応答は {error:{code,message,hint}} の単一形式。YouTube API 失敗は Queue の msg.retry()(max_retries=3・retry_delay=600秒)で再試行し、最終失敗で tenants.collection_status=failed を記録する(翌日の直近7日取り直しで欠けを埋める)。Reporting のレポートが60日以上取れなかった期間は CSV 取込で補う。データ削除は受付時に即時実行し、失敗分は毎日の Cron で再試行して7日以内に完了させる。

## イベント・非同期処理

Cron Trigger は `0 18 * * *`(UTC 18:00 = JST 3:00)の1本だけ。Cron はテナントごとの collect 通と cleanup 1通を Cloudflare Queues の collect-queue へ sendBatch で入れるだけで、consumer(max_batch_size=1)が1通=1テナントで collectTenantDaily を実行する。cleanup は fetched_at が30日を超えた指標以外のAPIデータの削除・失敗した削除の再試行・30日超 token 更新失敗の利用者の指標削除を担う。

## 可観測性

Workers Logs と設定画面の無料枠メーター(Workers/D1/R2/YouTube units・D1 の1日の書込行数・テナント数と上限)。YouTube Data API units と D1 書込はアプリ内カウンタ、D1容量・R2容量・Workersリクエストは Account Analytics Read トークン(CF_ANALYTICS_TOKEN・Workers Secrets)で GraphQL Analytics API から取得し1時間キャッシュ、全員に合計値だけを表示する(qa-078)。70%で黄・90%で赤(qa-084)。設定・連携・トークン・削除の操作は audit_log に残す。設定画面に最後の収集日時と最後のCSV取込日時を表示する(催促通知は出さない)。

## 互換性・移行・リリース

GitHub Actions: pull_request で lint/test/`wrangler deploy --dry-run`、main への push で `wrangler d1 migrations apply` → `wrangler deploy`。スキル連携APIは X-Skill-Api-Version ヘッダで版を明示する。テナントの別DB移行は tenants.db_binding の切替で行う(runbook)。OAuth 同意画面は未検証公開で開始し、利用者80人超で検証申請に着手する。

## テストと受入条件

- 認可: 他テナントのD1行・R2画像の取得成功0件、閲覧者の書込成功0件(O4)。
- E2E(Playwright 390×844 / 820×1180 / 1440×900): 閲覧者の書込が403、他テナントIDが404、招待リンクを別アカウントで開くと参加不可、M1区画の開示文、API/CSV同日値の両バッジ表示、上限到達時の新規テナント作成不可。
- 収集: 28日連続で 09:00 JST 時点の未完了テナント0件(O1)。
- 数値: M1=16.97% 固定値テスト。
- 週次ファネル: 同一 tenant+channel+week の再取込が重複せず、nullと0を維持し、2つの率とtarget_gapを固定値で検算する。分母0・欠損・targetが0以下または未設定・min_sample未達・週未確定・週末後の取込なしの各ケースが判定保留になり、全指標が目標以上なら改善候補を作らないことを確認する。
- 設定画面: 画像の区画・配置・文言どおりの6区画順、チャンネル選択と別テナント連携の409、再連携が同じチャンネルに限られること、字幕トグルON/OFFでのスコープ付与とrevoke・1日5本上限・未検証時の『準備中』表示、トークン6本目の409と平文の1回表示、使用量バーの70%黄/90%赤、共通 Header/Footer が全画面(ログイン・静的ページを含む)で同一であること、色が既存CSS変数だけであること。
- AI分析画面: 画像の区画・配置・文言、依頼→コピー→取込→登録→比較→アーカイブの E2E(3サイズ)、取消後の PATCH と reports 送信が409、再実行が新IDで retry_of を持つこと、アーカイブ版が一覧と analysis_history から外れること、同じ版の同じアクションの二重登録0件、未選択時取込で完了済み依頼が1件作られること、閲覧者に書込ボタンが出ず403であること、POST /api/skill/requests で『自動』バッジの依頼ができること、利用者向け文言に『ワークスペース』『テナント』が残らないこと(qa-096)。
- UI/分析: 先頭4ブロックの順序、登録者数が参考結果である表示、改善候補が因果断定でない表示、対象ファネル段と下流結果を含むアクション前後比較を確認する。

## 未決事項

N/A: completeness evaluator r6、2026-09-24 の r3、同日の AI分析画面追補 r2(eval-log/system-spec-completeness-ai-analysis-r2.json)で blocking な未決事項は0件。r2 の非blocking 指摘(medium: qa-087/qa-088 のテナント別 OAuth クライアント実装設計の各章『本章での適用』への反映、low: maintenance-ops への qa-095/qa-087 運用の反映ほか)は system-spec/ 側で追跡する(r3 の medium: 要件定義書 O3 の『80%超でアラート』表記は70/90の2段で満たされる旨の注記を正本側で追跡)。週次売上ファネルはユーザー追加要件として追補したため、既存の source_lineage digest を手作業で変更せず、次回dev-graph compileで正本から再同期する。残る low 指摘(画面モックへのテナント切替・メンバー欄・出典バッジの反映)は実装時の調整事項として system-spec/ 側で追跡する。

# API: 共通契約(画面用・テナント・スキル連携)

## 識別と目的

/api/* の画面用REST、/api/tenants 系の管理API、/api/skill/* の Claude Code 連携API。目的はテナント単位のデータ閲覧・取込・分析反映・メンバー管理。

## 認証・認可

画面用はセッションCookie、スキル連携は Bearer の個人トークン。tenant_id と role はサーバ側で導出し、パラメータの tenant_id/user_id を信用しない。usecase 入口で TenantContext(tenant_id, user_id, role)の役割を1回検査する。

## Request

JSON または multipart(CSV・字幕・画像)。POST /api/skill/reports は request_id と版番号を Idempotency-Key にする。一覧は cursor を受ける。

## Response

JSON。export は行ごとに `source=api|studio_csv|business_csv` を付ける。M1〜M10と週次診断のYouTube側入力は `studio_csv` 由来の行からだけ計算して返す。

## Validation・ビジネスルール

結果JSONは形式・サイズ検証後に保存(レポートHTMLは2,000,000 bytes 以下)。改善アクションは一方向遷移のみ。テナント作成は MAX_TENANTS 到達時に拒否(招待でのメンバー追加は対象外)。

## Error contract

{error:{code,message,hint}}。未認証401、役割不足403、他テナント資源は存在を明かさず404、検証失敗400、上限到達は受付停止メッセージを返す。

## 実行セマンティクス

レポート取込は冪等(同一 Idempotency-Key で版を増やさない)。usecase は1集約だけを1トランザクションで書く。

## キャッシュ・ページング

一覧は cursor ページング。R2 画像は署名付き短期URLまたは Worker 経由でのみ返す(公開バケットにしない)。

## 可観測性と監査

Workers Logs。reports/actions/csv_imports に操作した user_id を保持する。

## セキュリティ確認

レポートHTMLは allow-scripts なしの sandbox iframe + CSP default-src 'none'。refresh token は AES-256-GCM で暗号化し鍵は Workers Secrets のみ。YouTube 書込系APIは呼ばない。

## Contract tests

閲覧者の書込403・他テナント404・招待の別アカウント拒否・Idempotency-Key 重複で版不変・export の source 付与と M1〜M10 の CSV 限定計算を契約テストにする。
