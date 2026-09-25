---
acceptance: ["03-ai-analysis.png の3区画と下部の選択中依頼バーが画像の配置・文言どおりに表示され、色指定が既存CSS変数以外0件", "『Claude Code用プロンプトをコピー』で A-xxxx の依頼が待機中で作られ、プロンプトにトークン平文が含まれず、クリップボード失敗時は手動コピー欄が出る", "任意期間は最長1年・未来日不可で、期間がヘッダーの ?period= と共有される", "待機中・実行中の依頼をキャンセルすると取消になり、その後の PATCH /api/skill/requests/:id と POST /api/skill/reports が 409 REQUEST_CANCELED を返す", "失敗・取消の依頼の再実行で同じ条件の新しい ID ができ retry_of が記録される。完了・失敗・取消の依頼は状態が動かない", "貼付JSONは選択中の依頼に紐付いてその依頼が完了になり、未選択なら完了済み依頼が1件作られる。形式誤りは行番号付きの422で保存されない", "アーカイブした版は一覧と次回の analysis_history から外れ『アーカイブを表示』で見え、元に戻せる。reports の行は変わらない", "チェックしたアクションだけが改善アクションに登録され、初期は主対象1件だけにチェックがあり、同じ版の同じアクションの二重登録が0件", "レポート詳細の先頭に参照した直近版・前回仮説の当否・施策効果が表示され、履歴0件は初回分析になる。2つの版を選ぶと差分が並ぶ", "POST /api/skill/requests で作られた依頼が実行状況に『自動』バッジ付きで並び、閲覧者に変わった発行者のトークンでは403になる", "閲覧者には書込ボタンが出ずAPIは403、他テナントの依頼・レポートIDは404、依頼作成の11件目/分は429、各操作が audit_log に1件ずつ残る", "利用者に見える画面・APIエラー・規約に『ワークスペース』『テナント』が0件で『チャンネル管理』に揃っている", "390×844 / 820×1180 / 1440×900 で依頼→コピー→取込→登録→比較→アーカイブの E2E が通る"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "candidate_path": "features/feat-ai-analysis-screen.md", "confidence": 0.95}, {"artifact_kind": "issue", "candidate_path": "issues/feat-ai-analysis-screen.md", "confidence": 0.2}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:dev-graph-integrity-auditor", "evidence_ref": "eval-log/dev-graph-decompose-audit-feat-ai-analysis-screen-scope-wording-20260925.json", "evaluated_digest": "06489dabdcfa3ccf364a90f3343d8f89452b6591295ffd437cade7e79194b871"}
confirmation_status: "confirmed"
created_at: "2026-09-24T15:12:01Z"
depends_on: ["feat-skill-analysis-reports", "feat-web-screens-actions", "feat-settings-channel-link"]
domain: "youtube-analytics"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: null
file_path: "features/feat-ai-analysis-screen.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "docs/screens/03-ai-analysis.png の区画・配置・文言どおりに依頼・実行状況・レポートの3区画と選択中の依頼バーが既存CSS変数の配色で動き、取消・再実行・JSON取込・アーカイブ・選択アクション登録・週次自動実行の依頼作成がサーバ側の状態遷移と権限の制約付きで働き、利用者向けの語が『チャンネル管理』に揃っている"
graph_node_id: "feat-ai-analysis-screen"
implementation_readiness: {"checked_at": "2026-09-24T15:12:01Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "利用者が AI分析画面から Claude Code への分析依頼を作って進み具合を追い、届いたレポートの根拠と版を確かめて、参考にしない版を外し、選んだ打ち手だけを改善アクションへ移せるようにする(資するゴール: G1, G2, G4)"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["/analysis の AnalysisPage(PlaceholderPage を置換): 見出し『AI分析』・問い1行・説明1行・右上『AI分析の使い方』、①依頼 ②実行状況 ③レポート の3区画と画面下部の選択中の依頼バー(ID・依頼内容・進捗・『詳細を開く』)。区画・配置・文言は docs/screens/03-ai-analysis.png を正とし色は既存CSS変数だけ(qa-080)", "①依頼: 分析対象期間(最新28日/90日/1年/任意。任意は DateRangePicker で最長1年・未来日不可、?period=custom&from=&to= をヘッダーと共有)、補足指示(最大1000字・文字数表示)、唯一の主ボタン『Claude Code用プロンプトをコピー』(依頼 A-xxxx 作成→GET /api/analysis-requests/:id/prompt→navigator.clipboard.writeText→Toast、失敗時は選択状態のテキスト欄で手動コピー)、『使用するデータ』表と『使用データを確認』モーダル(GET /api/analysis/data-summary)、『データは自動送信されません』注記", "②実行状況: RequestStatusTable(ID・ステータス・対象期間・作成日時・ProgressBar・依頼内容・操作)。待機中/実行中=キャンセル(ConfirmDialog)、完了=詳細、失敗/取消=再実行、失敗は原因1行と対処1行、created_via='skill' の行に『自動』バッジ。待機中・実行中がある間だけ10秒ごとに再取得し visibilityState=hidden で停止", "③レポート: ReportList(レポート名・要約の検索を300msデバウンス、『アーカイブを表示』切替、列は版・作成日時・レポート名・対象期間)と ResultImportPanel(JSON貼付・送信前の JSON.parse 行番号表示・『結果を取り込む』『クリア』)、ReportDetail(レポート名・版・最新版バッジ・作成日時・対象期間・作成元・ステータス、『アーカイブ』/『元に戻す』、要約の先頭に『前回からの変化』→週次5段ファネル→下流結果→改善候補/全指標目標達成/判定保留、タブ 要約/視聴者心理/コメント感情/離脱場面/根拠データ/HTMLレポート、PsychBox・ActionChecklist・VersionHistory・VersionDiffModal、HTMLレポートは srcdoc の sandbox iframe で allow-scripts なし)", "選択状態を URL に持つ(?request=A-xxxx、?report=<id>&v=<版>)再読込復元と、新しい共通部品 ProgressBar・DateRangePicker(AppShell の『任意』期間でも同じ部品を開く)", "web/api.ts の分析用クライアント(createRequest/listRequests/cancel/retry/getPrompt/getDataSummary/listReports/getReport/diff/importResult/archive/unarchive/registerActions)と {error:{code,message,hint}} の表示", "画面用API: POST/GET /api/analysis-requests(最新20件・cursor)・GET /api/analysis-requests/:id・GET /api/analysis-requests/:id/prompt(トークン平文・他テナント情報を含めない)・POST /api/analysis-requests/:id/cancel・POST /api/analysis-requests/:id/retry・GET /api/analysis/data-summary?from=&to=", "レポートAPI: GET /api/reports?q=&archived=0|1&cursor=(D1 LIKE・テナント内最新200版まで)・POST /api/reports/import(ingestReport を再利用、request_id 指定でその依頼を完了、未指定なら完了済み依頼を1件作る・qa-092、検証エラーは 422 INVALID_REPORT_JSON に line)・PUT/DELETE /api/reports/:id/archive・POST /api/reports/:id/actions({keys:[...]} の選択登録・同じ版の同じアクションは登録済みを返す・qa-091)", "分析依頼集約の拡張: analysis_requests に 取消 状態・progress・stage・instruction・retry_of・report_id・canceled_at/by・created_via(web|skill|import)を追加するマイグレーション。一方向遷移 待機中→実行中→完了|失敗|取消 を集約内で検査し、終端からは動かさない(qa-089)", "スキル連携APIの差分: PATCH /api/skill/requests/:id に progress・stage(1-3)・error を受け、取消済み依頼への PATCH と POST /api/skill/reports は 409 REQUEST_CANCELED。POST /api/skill/requests(個人トークン・期間と指示は任意で既定は最新28日・実行中・created_via='skill' で作成、発行者が content.write を失っていれば403・qa-095)のエンドポイント本体(呼出し元の /yt-analyze が request_id 無し起動時に依頼を自動作成するクライアント側分岐は feat-skill-analysis-reports が実装する)", "report_archives(PK tenant_id,report_id・reports は追記のみを保つ)と、レポート一覧・analysis_history の直近5版をアーカイブ外の版だけから選ぶ変更(qa-090)", "actions.source_report_id/source_key と UNIQUE(tenant_id,source_report_id,source_key) のマイグレーション、registerReportActions は改善アクション集約だけを書きレポート版は読むだけ", "権限と保護: 書込(依頼作成・キャンセル・再実行・取込・アーカイブ・アクション登録)は content.write(owner/editor)のみで閲覧者は403かつボタン非表示、他テナントの依頼・レポートは404、セッション書込の Origin 検査、依頼作成は画面・スキル合算で1ユーザー1分10件(超過429)、取込JSONは 2,000,000 bytes 以下とカタログ§6スキーマ検証、各操作を audit_log に1行", "利用者向けの語を『チャンネル管理』へ置換(qa-096 が qa-088 を置換): web/ の AppShell・CreateTenantForm・InvitePage・LoginPage・Shell・settings/*・YouTubeLinkBanner などと src/lib/errors.ts・src/usecases/* のエラーメッセージ・規約2ページの『ワークスペース』『テナント』表記。表示名は1か所の定数から引き、識別子・DB・開発者向け文書は tenant のまま", "幅900px未満の2カラム縦積み・表のカード化・下部バーを下部タブの上に固定、Playwright 390×844 / 820×1180 / 1440×900 で依頼→コピー→取込→登録→比較→アーカイブの E2E"]
scope_out: ["個人トークンの検証・GET /api/skill/export・POST /api/skill/reports の ingestReport 本体と analysis_history の射影本体・launchd 週次実行の設定(feat-skill-analysis-reports。本 feature は取消・自動作成・アーカイブ除外の差分だけを持つ)", "改善アクション画面と actions 集約の状態遷移・GET/PATCH /api/actions/:id(feat-web-screens-actions)", "AppShell・既存共通部品(PageHeader/SectionCard/StatusBadge/DataTable/ConfirmDialog/Toast)の作成と設定画面の機能(feat-settings-channel-link)", "テナント別 OAuth クライアント(qa-087)の実装設計の見直し(system-spec 側で追跡する r2 medium 指摘)", "アプリ内 LLM 呼出し・因果推論・Web からの Claude Code 実行の停止(取消は以後の送信拒否だけ)", "画像の配色の採用と新しい色トークンの追加、全文検索索引の作成"]
source_lineage: {"imported_at": "2026-09-24T15:12:01Z", "origin_kind": "generated", "source_digest": "4510a55312a28c7c6b05afc8ac33d6ca0c7392475d295d0bcf2d2d397de68fbd", "source_path": "specs/youtube-analytics-system.md", "source_plugin": "dev-graph", "source_version": "1.0.0"}
start_date: null
status: "draft"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "AI分析画面(依頼・実行状況・レポート管理)と週次自動実行の依頼作成"
tracker_binding: "beads"
updated_at: "2026-09-25T00:19:55Z"
---
# 目的

利用者が AI分析画面から Claude Code への分析依頼を作って進み具合を追い、届いたレポートの根拠と版を確かめて、参考にしない版を外し、選んだ打ち手だけを改善アクションへ移せるようにする(資するゴール: G1, G2, G4)

## 到達状態

docs/screens/03-ai-analysis.png の区画・配置・文言どおりに依頼・実行状況・レポートの3区画と選択中の依頼バーが既存CSS変数の配色で動き、取消・再実行・JSON取込・アーカイブ・選択アクション登録・週次自動実行の依頼作成がサーバ側の状態遷移と権限の制約付きで働き、利用者向けの語が『チャンネル管理』に揃っている。

## スコープ

### 含む

- /analysis の AnalysisPage(PlaceholderPage を置換): 見出し『AI分析』・問い1行・説明1行・右上『AI分析の使い方』、①依頼 ②実行状況 ③レポート の3区画と画面下部の選択中の依頼バー(ID・依頼内容・進捗・『詳細を開く』)。区画・配置・文言は docs/screens/03-ai-analysis.png を正とし色は既存CSS変数だけ(qa-080)
- ①依頼: 分析対象期間(最新28日/90日/1年/任意。任意は DateRangePicker で最長1年・未来日不可、?period=custom&from=&to= をヘッダーと共有)、補足指示(最大1000字・文字数表示)、唯一の主ボタン『Claude Code用プロンプトをコピー』(依頼 A-xxxx 作成→GET /api/analysis-requests/:id/prompt→navigator.clipboard.writeText→Toast、失敗時は選択状態のテキスト欄で手動コピー)、『使用するデータ』表と『使用データを確認』モーダル(GET /api/analysis/data-summary)、『データは自動送信されません』注記
- ②実行状況: RequestStatusTable(ID・ステータス・対象期間・作成日時・ProgressBar・依頼内容・操作)。待機中/実行中=キャンセル(ConfirmDialog)、完了=詳細、失敗/取消=再実行、失敗は原因1行と対処1行、created_via='skill' の行に『自動』バッジ。待機中・実行中がある間だけ10秒ごとに再取得し visibilityState=hidden で停止
- ③レポート: ReportList(レポート名・要約の検索を300msデバウンス、『アーカイブを表示』切替、列は版・作成日時・レポート名・対象期間)と ResultImportPanel(JSON貼付・送信前の JSON.parse 行番号表示・『結果を取り込む』『クリア』)、ReportDetail(レポート名・版・最新版バッジ・作成日時・対象期間・作成元・ステータス、『アーカイブ』/『元に戻す』、要約の先頭に『前回からの変化』→週次5段ファネル→下流結果→改善候補/全指標目標達成/判定保留、タブ 要約/視聴者心理/コメント感情/離脱場面/根拠データ/HTMLレポート、PsychBox・ActionChecklist・VersionHistory・VersionDiffModal、HTMLレポートは srcdoc の sandbox iframe で allow-scripts なし)
- 選択状態を URL に持つ(?request=A-xxxx、?report=<id>&v=<版>)再読込復元と、新しい共通部品 ProgressBar・DateRangePicker(AppShell の『任意』期間でも同じ部品を開く)
- web/api.ts の分析用クライアント(createRequest/listRequests/cancel/retry/getPrompt/getDataSummary/listReports/getReport/diff/importResult/archive/unarchive/registerActions)と {error:{code,message,hint}} の表示
- 画面用API: POST/GET /api/analysis-requests(最新20件・cursor)・GET /api/analysis-requests/:id・GET /api/analysis-requests/:id/prompt(トークン平文・他テナント情報を含めない)・POST /api/analysis-requests/:id/cancel・POST /api/analysis-requests/:id/retry・GET /api/analysis/data-summary?from=&to=
- レポートAPI: GET /api/reports?q=&archived=0|1&cursor=(D1 LIKE・テナント内最新200版まで)・POST /api/reports/import(ingestReport を再利用、request_id 指定でその依頼を完了、未指定なら完了済み依頼を1件作る・qa-092、検証エラーは 422 INVALID_REPORT_JSON に line)・PUT/DELETE /api/reports/:id/archive・POST /api/reports/:id/actions({keys:[...]} の選択登録・同じ版の同じアクションは登録済みを返す・qa-091)
- 分析依頼集約の拡張: analysis_requests に 取消 状態・progress・stage・instruction・retry_of・report_id・canceled_at/by・created_via(web|skill|import)を追加するマイグレーション。一方向遷移 待機中→実行中→完了|失敗|取消 を集約内で検査し、終端からは動かさない(qa-089)
- スキル連携APIの差分: PATCH /api/skill/requests/:id に progress・stage(1-3)・error を受け、取消済み依頼への PATCH と POST /api/skill/reports は 409 REQUEST_CANCELED。POST /api/skill/requests(個人トークン・期間と指示は任意で既定は最新28日・実行中・created_via='skill' で作成、発行者が content.write を失っていれば403・qa-095)のエンドポイント本体(呼出し元の /yt-analyze が request_id 無し起動時に依頼を自動作成するクライアント側分岐は feat-skill-analysis-reports が実装する)
- report_archives(PK tenant_id,report_id・reports は追記のみを保つ)と、レポート一覧・analysis_history の直近5版をアーカイブ外の版だけから選ぶ変更(qa-090)
- actions.source_report_id/source_key と UNIQUE(tenant_id,source_report_id,source_key) のマイグレーション、registerReportActions は改善アクション集約だけを書きレポート版は読むだけ
- 権限と保護: 書込(依頼作成・キャンセル・再実行・取込・アーカイブ・アクション登録)は content.write(owner/editor)のみで閲覧者は403かつボタン非表示、他テナントの依頼・レポートは404、セッション書込の Origin 検査、依頼作成は画面・スキル合算で1ユーザー1分10件(超過429)、取込JSONは 2,000,000 bytes 以下とカタログ§6スキーマ検証、各操作を audit_log に1行
- 利用者向けの語を『チャンネル管理』へ置換(qa-096 が qa-088 を置換): web/ の AppShell・CreateTenantForm・InvitePage・LoginPage・Shell・settings/*・YouTubeLinkBanner などと src/lib/errors.ts・src/usecases/* のエラーメッセージ・規約2ページの『ワークスペース』『テナント』表記。表示名は1か所の定数から引き、識別子・DB・開発者向け文書は tenant のまま
- 幅900px未満の2カラム縦積み・表のカード化・下部バーを下部タブの上に固定、Playwright 390×844 / 820×1180 / 1440×900 で依頼→コピー→取込→登録→比較→アーカイブの E2E

### 含まない

- 個人トークンの検証・GET /api/skill/export・POST /api/skill/reports の ingestReport 本体と analysis_history の射影本体・launchd 週次実行の設定(feat-skill-analysis-reports。本 feature は取消・自動作成・アーカイブ除外の差分だけを持つ)
- 改善アクション画面と actions 集約の状態遷移・GET/PATCH /api/actions/:id(feat-web-screens-actions)
- AppShell・既存共通部品(PageHeader/SectionCard/StatusBadge/DataTable/ConfirmDialog/Toast)の作成と設定画面の機能(feat-settings-channel-link)
- テナント別 OAuth クライアント(qa-087)の実装設計の見直し(system-spec 側で追跡する r2 medium 指摘)
- アプリ内 LLM 呼出し・因果推論・Web からの Claude Code 実行の停止(取消は以後の送信拒否だけ)
- 画像の配色の採用と新しい色トークンの追加、全文検索索引の作成

## 受入

- 03-ai-analysis.png の3区画と下部の選択中依頼バーが画像の配置・文言どおりに表示され、色指定が既存CSS変数以外0件
- 『Claude Code用プロンプトをコピー』で A-xxxx の依頼が待機中で作られ、プロンプトにトークン平文が含まれず、クリップボード失敗時は手動コピー欄が出る
- 任意期間は最長1年・未来日不可で、期間がヘッダーの ?period= と共有される
- 待機中・実行中の依頼をキャンセルすると取消になり、その後の PATCH /api/skill/requests/:id と POST /api/skill/reports が 409 REQUEST_CANCELED を返す
- 失敗・取消の依頼の再実行で同じ条件の新しい ID ができ retry_of が記録される。完了・失敗・取消の依頼は状態が動かない
- 貼付JSONは選択中の依頼に紐付いてその依頼が完了になり、未選択なら完了済み依頼が1件作られる。形式誤りは行番号付きの422で保存されない
- アーカイブした版は一覧と次回の analysis_history から外れ『アーカイブを表示』で見え、元に戻せる。reports の行は変わらない
- チェックしたアクションだけが改善アクションに登録され、初期は主対象1件だけにチェックがあり、同じ版の同じアクションの二重登録が0件
- レポート詳細の先頭に参照した直近版・前回仮説の当否・施策効果が表示され、履歴0件は初回分析になる。2つの版を選ぶと差分が並ぶ
- POST /api/skill/requests で作られた依頼が実行状況に『自動』バッジ付きで並び、閲覧者に変わった発行者のトークンでは403になる
- 閲覧者には書込ボタンが出ずAPIは403、他テナントの依頼・レポートIDは404、依頼作成の11件目/分は429、各操作が audit_log に1件ずつ残る
- 利用者に見える画面・APIエラー・規約に『ワークスペース』『テナント』が0件で『チャンネル管理』に揃っている
- 390×844 / 820×1180 / 1440×900 で依頼→コピー→取込→登録→比較→アーカイブの E2E が通る

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/ui-ux.md, system-spec/frontend.md, system-spec/backend.md, system-spec/security.md, system-spec/database.md, system-spec/auth.md, system-spec/00-requirements-definition.md(qa-089〜qa-097・appr-015/appr-016)
- 結果JSONの正本: docs/analysis/dashboard-analysis-catalog.md §6
- 画面: docs/screens/03-ai-analysis.png

## 機能間依存

- feat-skill-analysis-reports(analysis_requests・reports・ingestReport・/api/skill/* の土台)
- feat-web-screens-actions(actions 集約。選択アクション登録の書込先)
- feat-settings-channel-link(AppShell・共通部品・audit_log・個人トークン発行画面)

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-ai-analysis-screen --feature-context features/feat-ai-analysis-screen.context.json` で生成する。本ノードは task を持たない。

## 補遺（2026-09-26・qa-098）

実装中に、仕様との食い違いが2点見つかった。どちらも 2026-09-25 のユーザー決定（system-spec qa-098）で、次のとおり見直した。上の「スコープ」「受入」「アーキテクチャ参照」にある旧い記述は書き換えていない。公開済みパッケージとの対応を保つためである（feature_digest は `features/feat-ai-analysis-screen.context.json` に束縛されている）。旧い記述よりも、この補遺を優先する。

- **取込JSONの本文上限**: 2,000,000 bytes から **3,500,000 bytes** に変えた。
  - スキルの送信（POST /api/skill/reports）と画面の取込は、同じ定数 `REPORT_BODY_MAX_BYTES`（`src/domain/analysis.ts`）を使う。
  - report_html 単体の上限 2,000,000 bytes（`REPORT_HTML_MAX_BYTES`）は変えていない。
- **結果JSONの正本**: docs/analysis/dashboard-analysis-catalog.md §6 から、**スキルの `compute.mjs`（buildReportJson）の実出力**に変えた。
  - 取込時に `src/domain/report-schema.ts` の parseReport で検査し、合わなければ 422 を返す。
  - 見本は `tests/fixtures/skill-analysis-report.json`。
  - catalog §6 にはキーを写さない。
