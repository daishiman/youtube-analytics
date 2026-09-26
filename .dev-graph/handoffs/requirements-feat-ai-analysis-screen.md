# 実装要件: feat-ai-analysis-screen (AI分析画面・週次自動実行の依頼作成・表示語『チャンネル管理』)

- handoff target: `task-graph` (capability-build / task-graph build)
- graph snapshot: `.dev-graph/state/graph.json` revision 11 / `sha256:89f262432942723401d47d0b1cef174e25c9f91b4a90b2597c9feff49ae824c7`
- package: `.dev-graph/published/feature-package-feat-ai-analysis-screen` / published digest `sha256:0c0bad66583d733a2d8f79c4587656e2ba5a4bc0f03093cb72b4ccdb68b12894`
- 本文書は実装コードを含まない。実装は下記 13 task spec を正本として task-graph build が行う。

## 1. 目的と範囲

feature node `feat-ai-analysis-screen` (confirmed / pass / readiness complete)。依存: feat-skill-analysis-reports, feat-web-screens-actions, feat-settings-channel-link。

- 目的: 利用者が AI分析画面から Claude Code への分析依頼を作って進み具合を追い、届いたレポートの根拠と版を確かめて、参考にしない版を外し、選んだ打ち手だけを改善アクションへ移せるようにする(資するゴール: G1, G2, G4)
- 到達状態: docs/screens/03-ai-analysis.png の区画・配置・文言どおりに依頼・実行状況・レポートの3区画と選択中の依頼バーが既存CSS変数の配色で動き、取消・再実行・JSON取込・アーカイブ・選択アクション登録・週次自動実行の依頼作成がサーバ側の状態遷移と権限の制約付きで働き、利用者向けの語が『チャンネル管理』に揃っている
- 範囲 (in):
  - /analysis の AnalysisPage(PlaceholderPage を置換): 見出し『AI分析』・問い1行・説明1行・右上『AI分析の使い方』、①依頼 ②実行状況 ③レポート の3区画と画面下部の選択中の依頼バー(ID・依頼内容・進捗・『詳細を開く』)。区画・配置・文言は docs/screens/03-ai-analysis.png を正とし色は既存CSS変数だけ(qa-080)
  - ①依頼: 分析対象期間(最新28日/90日/1年/任意。任意は DateRangePicker で最長1年・未来日不可、?period=custom&from=&to= をヘッダーと共有)、補足指示(最大1000字・文字数表示)、唯一の主ボタン『Claude Code用プロンプトをコピー』(依頼 A-xxxx 作成→GET /api/analysis-requests/:id/prompt→navigator.clipboard.writeText→Toast、失敗時は選択状態のテキスト欄で手動コピー)、『使用するデータ』表と『使用データを確認』モーダル(GET /api/analysis/data-summary)、『データは自動送信されません』注記
  - ②実行状況: RequestStatusTable(ID・ステータス・対象期間・作成日時・ProgressBar・依頼内容・操作)。待機中/実行中=キャンセル(ConfirmDialog)、完了=詳細、失敗/取消=再実行、失敗は原因1行と対処1行、created_via='skill' の行に『自動』バッジ。待機中・実行中がある間だけ10秒ごとに再取得し visibilityState=hidden で停止
  - ③レポート: ReportList(レポート名・要約の検索を300msデバウンス、『アーカイブを表示』切替、列は版・作成日時・レポート名・対象期間)と ResultImportPanel(JSON貼付・送信前の JSON.parse 行番号表示・『結果を取り込む』『クリア』)、ReportDetail(レポート名・版・最新版バッジ・作成日時・対象期間・作成元・ステータス、『アーカイブ』/『元に戻す』、要約の先頭に『前回からの変化』→週次5段ファネル→下流結果→改善候補/全指標目標達成/判定保留、タブ 要約/視聴者心理/コメント感情/離脱場面/根拠データ/HTMLレポート、PsychBox・ActionChecklist・VersionHistory・VersionDiffModal、HTMLレポートは srcdoc の sandbox iframe で allow-scripts なし)
  - 選択状態を URL に持つ(?request=A-xxxx、?report=<id>&v=<版>)再読込復元と、新しい共通部品 ProgressBar・DateRangePicker(AppShell の『任意』期間でも同じ部品を開く)
  - web/api.ts の分析用クライアント(createRequest/listRequests/cancel/retry/getPrompt/getDataSummary/listReports/getReport/diff/importResult/archive/unarchive/registerActions)と {error:{code,message,hint}} の表示
  - 画面用API: POST/GET /api/analysis-requests(最新20件・cursor)・GET /api/analysis-requests/:id・GET /api/analysis-requests/:id/prompt(トークン平文・他テナント情報を含めない)・POST /api/analysis-requests/:id/cancel・POST /api/analysis-requests/:id/retry・GET /api/analysis/data-summary?from=&to=
  - レポートAPI: GET /api/reports?q=&archived=0|1&cursor=(D1 LIKE・テナント内最新200版まで)・POST /api/reports/import(ingestReport を再利用、request_id 指定でその依頼を完了、未指定なら完了済み依頼を1件作る・qa-092、検証エラーは 422 INVALID_REPORT_JSON に line)・PUT/DELETE /api/reports/:id/archive・POST /api/reports/:id/actions({keys:[...]} の選択登録・同じ版の同じアクションは登録済みを返す・qa-091)
  - 分析依頼集約の拡張: analysis_requests に 取消 状態・progress・stage・instruction・retry_of・report_id・canceled_at/by・created_via(web|skill|import)を追加するマイグレーション。一方向遷移 待機中→実行中→完了|失敗|取消 を集約内で検査し、終端からは動かさない(qa-089)
  - スキル連携APIの差分: PATCH /api/skill/requests/:id に progress・stage(1-3)・error を受け、取消済み依頼への PATCH と POST /api/skill/reports は 409 REQUEST_CANCELED。POST /api/skill/requests(個人トークン・期間と指示は任意で既定は最新28日・実行中・created_via='skill' で作成、発行者が content.write を失っていれば403・qa-095)と /yt-analyze の request_id 無し起動時の依頼自動作成
  - report_archives(PK tenant_id,report_id・reports は追記のみを保つ)と、レポート一覧・analysis_history の直近5版をアーカイブ外の版だけから選ぶ変更(qa-090)
  - actions.source_report_id/source_key と UNIQUE(tenant_id,source_report_id,source_key) のマイグレーション、registerReportActions は改善アクション集約だけを書きレポート版は読むだけ
  - 権限と保護: 書込(依頼作成・キャンセル・再実行・取込・アーカイブ・アクション登録)は content.write(owner/editor)のみで閲覧者は403かつボタン非表示、他テナントの依頼・レポートは404、セッション書込の Origin 検査、依頼作成は画面・スキル合算で1ユーザー1分10件(超過429)、取込JSONは 2,000,000 bytes 以下とカタログ§6スキーマ検証、各操作を audit_log に1行
  - 利用者向けの語を『チャンネル管理』へ置換(qa-096 が qa-088 を置換): web/ の AppShell・CreateTenantForm・InvitePage・LoginPage・Shell・settings/*・YouTubeLinkBanner などと src/lib/errors.ts・src/usecases/* のエラーメッセージ・規約2ページの『ワークスペース』『テナント』表記。表示名は1か所の定数から引き、識別子・DB・開発者向け文書は tenant のまま
  - 幅900px未満の2カラム縦積み・表のカード化・下部バーを下部タブの上に固定、Playwright 390×844 / 820×1180 / 1440×900 で依頼→コピー→取込→登録→比較→アーカイブの E2E
- 範囲外 (out):
  - 個人トークンの検証・GET /api/skill/export・POST /api/skill/reports の ingestReport 本体と analysis_history の射影本体・launchd 週次実行の設定(feat-skill-analysis-reports。本 feature は取消・自動作成・アーカイブ除外の差分だけを持つ)
  - 改善アクション画面と actions 集約の状態遷移・GET/PATCH /api/actions/:id(feat-web-screens-actions)
  - AppShell・既存共通部品(PageHeader/SectionCard/StatusBadge/DataTable/ConfirmDialog/Toast)の作成と設定画面の機能(feat-settings-channel-link)
  - テナント別 OAuth クライアント(qa-087)の実装設計の見直し(system-spec 側で追跡する r2 medium 指摘)
  - アプリ内 LLM 呼出し・因果推論・Web からの Claude Code 実行の停止(取消は以後の送信拒否だけ)
  - 画像の配色の採用と新しい色トークンの追加、全文検索索引の作成

## 2. 受入要件 (feature acceptance → task 写像)

| # | 受入要件 | 担当 task |
|---|---|---|
| A1 | 03-ai-analysis.png の3区画と下部の選択中依頼バーが画像の配置・文言どおりに表示され、色指定が既存CSS変数以外0件 | SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07 |
| A2 | 『Claude Code用プロンプトをコピー』で A-xxxx の依頼が待機中で作られ、プロンプトにトークン平文が含まれず、クリップボード失敗時は手動コピー欄が出る | SYS-AIA-P03, SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07, SYS-AIA-P09 |
| A3 | 任意期間は最長1年・未来日不可で、期間がヘッダーの ?period= と共有される | SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07 |
| A4 | 待機中・実行中の依頼をキャンセルすると取消になり、その後の PATCH /api/skill/requests/:id と POST /api/skill/reports が 409 REQUEST_CANCELED を返す | SYS-AIA-P02, SYS-AIA-P03, SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07, SYS-AIA-P09 |
| A5 | 失敗・取消の依頼の再実行で同じ条件の新しい ID ができ retry_of が記録される。完了・失敗・取消の依頼は状態が動かない | SYS-AIA-P02, SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07 |
| A6 | 貼付JSONは選択中の依頼に紐付いてその依頼が完了になり、未選択なら完了済み依頼が1件作られる。形式誤りは行番号付きの422で保存されない | SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07 |
| A7 | アーカイブした版は一覧と次回の analysis_history から外れ『アーカイブを表示』で見え、元に戻せる。reports の行は変わらない | SYS-AIA-P02, SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07 |
| A8 | チェックしたアクションだけが改善アクションに登録され、初期は主対象1件だけにチェックがあり、同じ版の同じアクションの二重登録が0件 | SYS-AIA-P02, SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07 |
| A9 | レポート詳細の先頭に参照した直近版・前回仮説の当否・施策効果が表示され、履歴0件は初回分析になる。2つの版を選ぶと差分が並ぶ | SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07 |
| A10 | POST /api/skill/requests で作られた依頼が実行状況に『自動』バッジ付きで並び、閲覧者に変わった発行者のトークンでは403になる | SYS-AIA-P03, SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07, SYS-AIA-P09 |
| A11 | 閲覧者には書込ボタンが出ずAPIは403、他テナントの依頼・レポートIDは404、依頼作成の11件目/分は429、各操作が audit_log に1件ずつ残る | SYS-AIA-P03, SYS-AIA-P04, SYS-AIA-P05, SYS-AIA-P06, SYS-AIA-P07, SYS-AIA-P09 |
| A12 | 利用者に見える画面・APIエラー・規約に『ワークスペース』『テナント』が0件で『チャンネル管理』に揃っている | SYS-AIA-P05, SYS-AIA-P07, SYS-AIA-P08, SYS-AIA-P12 |
| A13 | 390×844 / 820×1180 / 1440×900 で依頼→コピー→取込→登録→比較→アーカイブの E2E が通る | SYS-AIA-P02, SYS-AIA-P04, SYS-AIA-P06, SYS-AIA-P07, SYS-AIA-P13 |

## 3. 実行 task (exact 13・前向き DAG)

| task | phase | タイトル | depends_on | spec |
|---|---|---|---|---|
| SYS-AIA-P01 | P01 | AI分析画面の要件を実装単位へ確定 | - | `tasks/feat-ai-analysis-screen/SYS-AIA-P01.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-01-requirements.md` |
| SYS-AIA-P02 | P02 | AnalysisPage・分析API・DB拡張の設計 | SYS-AIA-P01 | `tasks/feat-ai-analysis-screen/SYS-AIA-P02.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-02-architecture.md` |
| SYS-AIA-P03 | P03 | 取消・409・権限境界・監査ログの設計レビュー | SYS-AIA-P02 | `tasks/feat-ai-analysis-screen/SYS-AIA-P03.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-03-design-review.md` |
| SYS-AIA-P04 | P04 | 受入テスト・状態遷移テスト・3サイズE2Eの設計 | SYS-AIA-P03 | `tasks/feat-ai-analysis-screen/SYS-AIA-P04.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-04-test-design.md` |
| SYS-AIA-P05 | P05 | AnalysisPage・分析/レポートAPI・DB拡張・表示語置換の実装 | SYS-AIA-P04 | `tasks/feat-ai-analysis-screen/SYS-AIA-P05.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-05-implementation.md` |
| SYS-AIA-P06 | P06 | テスト実行と不具合修正 | SYS-AIA-P05 | `tasks/feat-ai-analysis-screen/SYS-AIA-P06.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-06-test-run.md` |
| SYS-AIA-P07 | P07 | 受入確認 | SYS-AIA-P06 | `tasks/feat-ai-analysis-screen/SYS-AIA-P07.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-07-acceptance.md` |
| SYS-AIA-P08 | P08 | 共通化の整理とマイグレーション整理 | SYS-AIA-P07 | `tasks/feat-ai-analysis-screen/SYS-AIA-P08.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-08-refactoring-migration.md` |
| SYS-AIA-P09 | P09 | セキュリティと品質の保証 | SYS-AIA-P08 | `tasks/feat-ai-analysis-screen/SYS-AIA-P09.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-09-quality-assurance.md` |
| SYS-AIA-P10 | P10 | 最終レビュー | SYS-AIA-P09 | `tasks/feat-ai-analysis-screen/SYS-AIA-P10.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-10-final-review.md` |
| SYS-AIA-P11 | P11 | 証跡の集約 | SYS-AIA-P10 | `tasks/feat-ai-analysis-screen/SYS-AIA-P11.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-11-evidence.md` |
| SYS-AIA-P12 | P12 | 運用手順『AI分析の取消と再実行を扱う』とドキュメント | SYS-AIA-P10 | `tasks/feat-ai-analysis-screen/SYS-AIA-P12.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-12-documentation-operations.md` |
| SYS-AIA-P13 | P13 | CI/CD とリリース | SYS-AIA-P11, SYS-AIA-P12 | `tasks/feat-ai-analysis-screen/SYS-AIA-P13.md` / `.dev-graph/published/feature-package-feat-ai-analysis-screen/task-specs/phase-13-release-deploy.md` |

## 4. 出典 (system-spec lineage)

- specification: `spec-youtube-analytics-system` ← `system-spec/00-requirements-definition.md` (evidence `eval-log/system-spec-completeness-ai-analysis-r2.json`)
- architecture: `arch-youtube-analytics-system` ← `system-spec/index.md`
- 根拠質疑: 要件定義書 qa-089〜qa-097 (appr-015/appr-016)、画面 `docs/screens/03-ai-analysis.png`
- architecture_refs (context): `architecture/youtube-analytics-system.md`, `specs/youtube-analytics-system.md`, `system-spec/index.md`, `system-spec/00-requirements-definition.md`, `system-spec/ui-ux.md`, `system-spec/frontend.md`, `system-spec/backend.md`, `system-spec/auth.md`, `system-spec/security.md`, `system-spec/database.md`, `docs/analysis/dashboard-analysis-catalog.md`, `docs/screens/03-ai-analysis.png`

## 5. Readiness matrix

| node | status | confirmation | evaluation | readiness | evidence digest |
|---|---|---|---|---|---|
| spec-youtube-analytics-system | active | confirmed | pass | complete | `4263d007f0f38086…` |
| arch-youtube-analytics-system | active | confirmed | pass | complete | `4263d007f0f38086…` |
| feat-skill-analysis-reports | active | confirmed | pass | complete | `1757c7940b6cf27b…` |
| feat-web-screens-actions | active | confirmed | pass | complete | `e45ab702cc3060bb…` |
| feat-settings-channel-link | active | confirmed | pass | complete | `d609b5b1106b27dd…` |
| feat-ai-analysis-screen | active | confirmed | pass | complete | `30582d220dcc63c8…` |
| SYS-AIA-P01 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P02 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P03 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P04 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P05 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P06 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P07 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P08 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P09 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P10 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P11 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P12 | active | confirmed | pass | complete | `0c0bad66583d733a…` |
| SYS-AIA-P13 | active | confirmed | pass | complete | `0c0bad66583d733a…` |

gate: C11 validate-graph-schema = pass (missing_sections 0) / C02 saved state = pass / validate-system-plan = pass (sha256:0c0bad66583d733a2d8f79c4587656e2ba5a4bc0f03093cb72b4ccdb68b12894) / plan evaluator = PASS (r4, findings 0)

## 6. 保留 (handoff は止めない)

- system-spec r2 medium: qa-087/qa-088 テナント別OAuthクライアントの実装設計が各章に未反映 (本 feature の scope_out。仕様側で追跡)
- system-spec r2 low: 運用章への qa-095 (launchd 週次の依頼自動作成) 手順の反映 → 本 feature では SYS-AIA-P12 の runbook で扱う
- マイグレーション番号 0008/0009/0010 は暫定。実装時に最大番号+1 で確定し renumber-receipt に記録 (SYS-AIA-P05/P08/P13)
- planner 入力は features context から depends_on を除いた9フィールドの写し (`.dev-graph/handoffs/plan-input-feat-ai-analysis-screen.context.json`、全フィールド値一致を確認済み)
