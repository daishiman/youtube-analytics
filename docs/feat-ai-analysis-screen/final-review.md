# feat-ai-analysis-screen 最終レビュー（SYS-AIA-P10）

最終更新: 2026-09-25。scope_in 14項目がどのファイルで満たされたか、scope_out を守ったか、残した事項を記録する。

## 1. scope_in とファイルの対応

| # | scope_in（要約） | 主なファイル | 状態 |
|---|---|---|---|
| S1 | /analysis の AnalysisPage、3区画と下部バー、『AI分析の使い方』 | `web/pages/AnalysisPage.tsx`・`web/pages/analysis/SelectionBar.tsx`・`web/main.tsx` | 済 |
| S2 | ①依頼（期間・補足指示・コピー・手動コピー・使用データ・注記） | `web/pages/analysis/RequestPanel.tsx`・`PromptCopy.tsx` | 済 |
| S3 | ②実行状況（ProgressBar・キャンセル・再実行・原因と対処・『自動』・10秒ポーリング） | `RequestStatusTable.tsx`・`PromptCopy.tsx`・`hooks.ts`・`format.ts` | 済 |
| S4 | ③レポート（検索・アーカイブ表示・取込・詳細・タブ6つ・sandbox iframe・版比較） | `ReportList.tsx`・`ResultImportPanel.tsx`・`ReportDetail.tsx` | 済 |
| S5 | URL の選択状態、共通部品 ProgressBar・PeriodSelector・DateRangePicker | `AnalysisPage.tsx`・`web/period.ts`・`web/components/ProgressBar.tsx`・`PeriodSelector.tsx`・`DateRangePicker.tsx`・`AppShell.tsx` | 済 |
| S6 | web/api.ts の分析用クライアントとエラー表示 | `web/api.ts` | 済 |
| S7 | 画面用 API（依頼・プロンプト・取消・再実行・使用データ） | `src/http/analysis-requests-routes.ts`・`src/usecases/analysis-requests.ts` | 済 |
| S8 | レポート API（一覧・取込・アーカイブ・アクション登録） | `src/http/analysis-requests-routes.ts`・`src/usecases/analysis-reports.ts`・`src/repositories/skill-analysis-repository.ts` | 済 |
| S9 | analysis_requests の拡張と一方向の状態遷移 | `migrations/0013_analysis_requests_extension.sql`・`src/usecases/analysis-requests.ts` | 済 |
| S10 | スキル API の差分（PATCH の progress・stage・error、取消後 409、`POST /api/skill/requests`） | `src/http/skill-routes.ts`・`src/usecases/analysis-requests.ts`（activeRequest・patchSkillRequest・createSkillRequest） | 済 |
| S11 | report_archives と、一覧・analysis_history のアーカイブ除外 | `migrations/0014_report_archives.sql`・リポジトリの `recentReports` | 済 |
| S12 | actions の source 列と UNIQUE、registerReportActions | `migrations/0015_actions_source_report.sql`・`src/usecases/analysis-reports.ts` | 済 |
| S13 | 権限・越境・Origin・レート制限・本文の上限・監査 | `src/http/middleware.ts`（既存）・`src/domain/analysis.ts`（`REPORT_BODY_MAX_BYTES`。2026-09-25 のユーザー決定で 2,000,000 から 3,500,000 bytes に変更し、スキルの送信と共通にした）・ユースケース各所 | 済 |
| S14 | 表示語の『チャンネル管理』置換（qa-096） | web の各画面・`src/lib/errors.ts`・`src/usecases/common.ts`・`usage.ts`・`tenants.ts`・`public/privacy.html`・`public/terms.html` | 済（表示名は `src/domain/labels.ts` の `TENANT_LABEL`） |
| — | 900px 未満の表示切替と3サイズの E2E | `web/styles.css`・`e2e/analysis.spec.ts` | 済 |

## 2. scope_out の遵守

| scope_out | 確認 |
|---|---|
| トークン検証・export・ingestReport 本体・analysis_history の射影本体・launchd | 本 feature の変更は `activeRequest` の取消判定、`recentReports` のアーカイブ除外、`POST /api/skill/requests` の追加だけ |
| 改善アクション画面と actions の状態遷移 | actions には列2つと UNIQUE を足しただけ。`/api/actions/:id` は変更なし |
| AppShell・既存共通部品の作成、設定画面の機能 | AppShell の表示位置は維持し、期間操作を依頼欄と共通の PeriodSelector に集約。設定機能は変更なし |
| テナント別 OAuth クライアントの見直し | 変更なし |
| アプリ内 LLM 呼出し・Claude Code の停止 | 変更なし。取消は以後の送信を拒否するだけ |
| 新しい色トークン・全文検索索引 | 変更なし（色は既存 CSS 変数、検索は LIKE） |

今回の追加改善依頼は画面間の共通化を含むため、AppShell の期間操作だけはこの scope_out の例外として扱った。設定画面の機能と見た目の配置は変えていない。

**作業ツリーの境界**: この worktree には feat-skill-analysis-reports の未コミット変更（`migrations/0008`〜`0012`、`src/http/skill-routes.ts`・`src/usecases/skill-export.ts` の本体など）が同居している。本 feature の差分は上の S1〜S14 に挙げた範囲で、同じファイルに両方の変更が入るもの（skill-routes・analysis-requests・analysis-reports・リポジトリ）は、コミット時に feature ごとに分けるか、依存元を先にまとめて入れる。

## 3. 残した事項

| # | 内容 | 次の扱い |
|---|---|---|
| R1 | scope_in の「表示名は1か所の定数から引く」が未実装。『チャンネル管理』は各ファイルに直書きされている（表示は置換済み） | 解消（`TENANT_LABEL` に集約。規約2ページは静的 HTML なので同じ語を直接書く） |
| R2 | `PATCH /api/skill/requests/:id` の取消後 409 の直接テスト | 解消（テスト追加） |
| R3 | 降格した発行者のトークンで `POST /api/skill/requests` が 403 になるテスト | 解消（テスト追加） |
| R4 | analysis_history のアーカイブ除外のテスト | 解消（テスト追加） |
| R5 | 『自動』バッジ・『前回からの変化』の自動テスト | 解消（E2E 追加） |
| R6 | 取込先の解釈。選択中の依頼が待機中・実行中のときだけその依頼へ取り込み、完了などを選んでいるときは新しい依頼を作る | 選択状態に応じた取込先を表示し、貼付 JSON の依頼 ID と食い違うと送信前に止める |
| R7 | qa-094 の具体値は一括承認で、値ごとの個別確認はしていない | 運用で詰まったら見直す |
| R8 | preview 環境での受入確認と `pnpm audit` | 公開作業時に行う |

未解決の high 指摘は0件。

## 4. 思考リセット後の30手法レビュー（2026-09-25）

先行レビューの「high 0」を結論として使わず、画面の依頼→実行→結果→行動を最初からたどり直した。成果物は削除していない。以下は各手法から得た論点と、それを受けた最小の対応である。

| # | 思考法 | 発見・判断と対応 |
|---|---|---|
| 1 | 批判的思考 | 既存の合格判定を疑い、取消と取込の競合を再検証。DBの保存条件を修正 |
| 2 | 演繹思考 | 「取消後は送信不可」から、レポート保存時にも有効状態の条件が必要と導いた |
| 3 | 帰納的思考 | 画面・自動・再実行の依頼作成に共通する保存と制限を `createRequestRow` に集約 |
| 4 | アブダクション | 別 feature で増えた作成入口が重複の原因と推定し、入口は残して内部処理を共有 |
| 5 | 垂直思考 | 根本原因は条件付き UPDATE の0件が成功扱いになる点と特定し、INSERT自体を条件付けた |
| 6 | 要素分解 | 作成・プロンプト取得・コピー・実行・取込を分解し、再実行にコピーが欠けると確認 |
| 7 | MECE | 選択依頼の有無・状態とJSONの依頼IDを組み合わせ、取込先の不一致を送信前に検出 |
| 8 | 2軸思考 | 影響と発生頻度で、状態整合・再実行導線・案内・共通化の順に優先 |
| 9 | プロセス思考 | 再実行の新ID作成後に操作が途切れないよう、同じ流れでプロンプトをコピー |
| 10 | メタ思考 | 合格基準を「IDが現れる」から「新IDを使って実行できる」へ見直し、E2Eを拡張 |
| 11 | 抽象化思考 | 新規・再実行・再コピーの共通操作を `usePromptCopy` と `ManualCopy` にまとめた |
| 12 | ダブル・ループ思考 | 「再実行は新IDを作れば完了」という前提を捨て、実行に必要なコピーまで含めた |
| 13 | ブレインストーミング | 行ごとの別モーダル等と比較し、既存の手動コピー表示を共有する最小案を採用 |
| 14 | 水平思考 | クリップボード拒否を再実行にも適用し、手動でコピーできる回復経路を共有 |
| 15 | 逆説思考 | 期間UIを一方から消す案を検証し、画像の2か所表示を保ったまま操作だけ共通化 |
| 16 | 類推思考 | URLで選択を復元する一覧・詳細の構造を維持し、一覧外依頼の更新を追加 |
| 17 | if思考 | 完了・取消の依頼を選択した場合を調べ、取込先表示と下部バーの説明を状態に合わせた |
| 18 | 素人思考 | 画面内でAIが動く誤解を避け、Claude Codeへ貼って実行する案内を維持 |
| 19 | システム思考 | 依頼→Skill→レポート→履歴→アクションの接続を確認し、取消を保存境界で守った |
| 20 | 因果関係分析 | 再実行が新ID作成だけで止まる原因を、コピー処理が新規欄に閉じていたことと特定 |
| 21 | 因果ループ | 一覧外の選択中依頼が更新されず古い進捗を示す循環を断つため、可視時の再取得を追加 |
| 22 | トレードオン思考 | 共有による一貫性と抽象化の負担を比べ、依頼作成・コピー・期間操作だけを共通化 |
| 23 | プラスサム思考 | 作成処理の共有でレート制限と作成元の一貫性を同時に保つ |
| 24 | 価値提案思考 | 利用者の成果を「コピー→端末実行→結果→行動」の完走と置き、再実行を優先修正 |
| 25 | 戦略的思考 | 先に保存整合と操作の欠落を直し、画面全体の再設計は避けた |
| 26 | why思考 | 再実行できない→プロンプトがない→新IDしか作らない→コピーが新規欄専用→作成と実行の責務が分断、の5段で真因を確認 |
| 27 | 改善思考 | 再実行直後のコピー、既存依頼の再コピー、取込IDの事前確認を追加 |
| 28 | 仮説思考 | 「コピー操作を共有すれば新規と再実行で同じ回復ができる」をE2Eで検証 |
| 29 | 論点思考 | ファイル数そのものより、終端状態と利用者の完走の整合を主論点とした |
| 30 | KJ法 | 指摘をフロー欠落・状態整合・表示鮮度・処理重複の4群にまとめて順次修正 |

## 5. AI分析実装の4条件の再検証

| 条件 | 判定 | 根拠 |
|---|---|---|
| 矛盾なし | PASS | 取消済み依頼への取込は409かつ保存0件。取消の案内は「以後の送信を拒否」に合わせた |
| 漏れなし | PASS | 再実行時のプロンプトコピーと拒否時の手動コピー、一覧外依頼の更新を実装 |
| 整合性あり | PASS | 取込先の表示とJSONの依頼IDを照合。期間選択と依頼作成の重複処理を共有 |
| 依存関係整合 | PASS | 画面APIとSkill APIが同じ依頼作成・レポート保存の規則を使用。`pnpm check:repo` も成功 |

検証は `pnpm typecheck`、Biome対象13ファイル、Vitest 97件、Playwright 3幅9件、`pnpm check:repo` が成功。`architecture/graph.json` と再同期ゲートの現在値は C02 receipt と実SHAを照合して更新し、監査証跡を `eval-log/dev-graph-current-projection-refresh-20260925.json` に残した。旧3 feature の正式 C14 再分解ゲートは引き続き開いており、この4条件のPASSはその完了を意味しない。

旧機能を含む全体の境界監査では4件の不一致が見つかった。詳細と正式フローの dry-run 結果は [C14境界監査](c14-boundary-audit.md) に記録した。全体の「矛盾なし」「整合性あり」「依存関係整合」は、正式再分解と公開済み task package の再評価が済むまで未達とする。
