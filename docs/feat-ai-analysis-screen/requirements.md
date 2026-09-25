# feat-ai-analysis-screen 要件（SYS-AIA-P01）

最終更新: 2026-09-25。正本は `features/feat-ai-analysis-screen.md`（scope_in 14項目・acceptance 13項目・scope_out 6項目）。根拠章は system-spec の backend・ui-ux・database・security・00-requirements-definition。

## 1. 目的

AI分析画面から分析を依頼し、Claude Code（`/yt-analyze`）で実行した結果を取り込み、レポートとして読み、改善アクションへつなげる。画面は「依頼」「実行状況」「結果の取込」の3区画と、選択中の依頼を示す下部バーでできている。分析の実行そのものは画面の外（利用者の端末の Claude Code）で行う。

依存する feature は feat-skill-analysis-reports（スキル API・reports 表）、feat-web-screens-actions（改善アクション）、feat-settings-channel-link（連携トークン・チャンネル）。

## 2. 利用者の決定（qa 番号）

| qa | 決定 | 所在 |
|---|---|---|
| qa-089 | 依頼の状態は 待機中 → 実行中 → 完了・失敗・取消 の一方向だけ。終端からは動かさない。取消後の送信は 409 `REQUEST_CANCELED` | backend.md・ui-ux.md |
| qa-090 | アーカイブは別表 `report_archives` で持ち、reports は追記のみを保つ。一覧と analysis_history はアーカイブ外だけを読む | backend.md・database.md |
| qa-091 | actions に `source_report_id`・`source_key` を足し、UNIQUE で二重登録を防ぐ | backend.md・database.md |
| qa-092 | 取込で request_id が無ければ、完了済みの依頼を `created_via=import` で1件作る | backend.md |
| qa-093 / appr-015 | 詳細設計（画面構成・API・表）の承認 | 00-requirements-definition.md・ui-ux.md・backend.md・database.md |
| qa-094 | 具体値の一括承認（1ユーザー1分10件、2,000,000 bytes、iframe sandbox、LIKE は最新200版、ポーリング10秒、SHA-256）。値ごとの個別確認はしていない。取込本文の上限は qa-098 で見直した | backend.md・security.md・database.md |
| qa-095 | `POST /api/skill/requests` は実行中・`created_via=skill` で作り、一覧では『自動』バッジだけを付ける | backend.md・00-requirements-definition.md |
| qa-096 | 表示語は『チャンネル管理』（qa-088 を置換）。コード識別子・DB・開発者向け文書は tenant／テナントのまま | ui-ux.md |
| qa-097 / appr-016 | 要件定義 U7・I4・I5 の改訂 | 00-requirements-definition.md |
| qa-098 | 実装で見つかった食い違いの見直し（2026-09-25 のユーザー決定）。取込本文の上限を 3,500,000 bytes（`REPORT_BODY_MAX_BYTES`。スキルの POST と共通。report_html 単体は 2,000,000 bytes のまま）にし、結果 JSON の正本をスキルの buildReportJson の実出力にした（§3） | backend.md・security.md |

## 3. 取込 JSON の形

スキルの compute.mjs（buildReportJson）の実出力を正本とし、`src/domain/report-schema.ts` の型と `parseReport` で検査する（合わなければ 422。見本は `tests/fixtures/skill-analysis-report.json`）。検証は feat-skill-analysis-reports と共有し、本 feature では形を増やさない。画面は検査済みの型だけを読む。計画時は `docs/analysis/dashboard-analysis-catalog.md` §6 の列挙を正本としていたが、2026-09-25 のユーザー決定（qa-098）で変更した。

## 4. 受入対応表

| # | 受入項目 | 根拠章 | 区画/API | 検証方法 |
|---|---|---|---|---|
| AC1 | 3区画と下部バーが画像どおり。色は既存 CSS 変数以外0件 | ui-ux | `AnalysisPage`・`SelectionBar` | E2E・`css-vars-check` |
| AC2 | コピーで A-xxxx を待機中で作る。プロンプトにトークン平文なし。クリップボード失敗時は手動コピー欄 | backend・security | `RequestPanel`・`POST /analysis-requests`・`GET …/prompt` | 結合・E2E |
| AC3 | 任意期間は最長1年・未来日不可。`?period=` をヘッダーと共有 | ui-ux | `web/period.ts`・`DateRangePicker` | 単体・E2E |
| AC4 | キャンセルで取消。以後 PATCH と `POST /api/skill/reports` は 409 `REQUEST_CANCELED` | qa-089 | `POST …/:id/cancel` | 結合 |
| AC5 | 再実行は新しい ID と `retry_of`。終端は不変 | qa-089 | `POST …/:id/retry` | 結合 |
| AC6 | 取込は選択中の依頼を完了にし、未選択なら完了済み依頼を1件作る。形式誤りは行番号付き 422 | qa-092 | `ResultImportPanel`・`POST /reports/import` | 単体・結合・E2E |
| AC7 | アーカイブは一覧と analysis_history から外れ、『アーカイブを表示』で見え、戻せる。reports の行は不変 | qa-090 | `PUT/DELETE /reports/:id/archive` | 結合・E2E |
| AC8 | チェックしたアクションだけ登録。初期は主対象だけチェック。二重登録0件 | qa-091 | `ActionChecklist`・`POST /reports/:id/actions` | 結合・E2E |
| AC9 | 詳細の先頭に『前回からの変化』、履歴0件は『初回分析』、2版比較 | ui-ux | `ReportDetail`・`GET /reports/diff` | 結合・E2E |
| AC10 | skill 依頼に『自動』バッジ。閲覧者に降格した発行者のトークンは 403 | qa-095 | `RequestStatusTable`・`POST /api/skill/requests` | 結合・E2E |
| AC11 | 閲覧者はボタン非表示・API 403、他チャンネル管理は 404、11件目/分は 429、audit_log に1件ずつ | security | 全 API | 結合・E2E |
| AC12 | 『ワークスペース』『テナント』の表示0件 | qa-096 | web・errors・利用規約 | `wording-check` |
| AC13 | 3サイズ（390・820・1440）の E2E | ui-ux | 画面全体 | E2E |

scope_in 14項目とファイルの対応は final-review.md の S1〜S14 に置く。

## 5. 対象外（scope_out）

1. 個人トークンの検証・`GET /api/skill/export`・`POST /api/skill/reports` の ingestReport 本体・analysis_history の射影本体・launchd 週次実行の設定（feat-skill-analysis-reports。本 feature は取消・自動作成・アーカイブ除外の差分だけを持つ）
2. 改善アクション画面と actions 集約の状態遷移、`GET/PATCH /api/actions/:id`（feat-web-screens-actions）
3. AppShell と既存共通部品（PageHeader・SectionCard・StatusBadge・DataTable・ConfirmDialog・Toast）の作成、設定画面の機能（feat-settings-channel-link）
4. チャンネル管理ごとの OAuth クライアント（qa-087）の設計見直し
5. アプリ内の LLM 呼出し・因果推論・Web からの Claude Code 実行の停止（取消は以後の送信を拒否するだけ）
6. 画像の配色の採用と新しい色トークンの追加、全文検索索引の作成
