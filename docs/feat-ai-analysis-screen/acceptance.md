# feat-ai-analysis-screen 受入判定（SYS-AIA-P07）

最終更新: 2026-09-25。判定環境はローカル Workers runtime（`wrangler dev --var DEV_LOGIN:1` と seed）。commit、push、deploy はしていないので、公開環境（preview）の列は未実施。当初「条件付き」だった AC2・AC4・AC7・AC9・AC10 は、足りなかった経路のテストを足して合格にした。3 節は同じ内容を手で確かめる手順。

## 1. 判定

| # | 受入項目 | ローカル | 根拠テスト | 公開環境 |
|---|---|---|---|---|
| AC1 | 3区画と下部バーが画像どおり。色は既存 CSS 変数以外0件 | 合格 | E2E「依頼 → コピー → 取込 → 登録 → 2版比較 → アーカイブ → 取消・再実行」、`css-vars-check` | 未実施 |
| AC2 | コピーで A-xxxx を待機中で作る。プロンプトにトークン平文なし。クリップボード失敗時は手動コピー欄 | 合格 | requests-screen「プロンプト › 依頼 ID・期間・補足指示・送信先を含み、トークンの平文は含まない」、E2E のクリップボード読取と、`writeText` 失敗時の手動コピー欄（選択状態・依頼 ID 入り） | 未実施 |
| AC3 | 任意期間は最長1年・未来日不可。`?period=` をヘッダーと共有 | 合格 | web-format の期間の境界、E2E「期間を切り替えると、表示と使用データが追従する」 | 未実施 |
| AC4 | キャンセルで取消。PATCH と `POST /api/skill/reports` が 409 `REQUEST_CANCELED` | 合格 | requests-screen「取消 › 待機中・実行中を取消にし…以後スキルの送信は 409」（reports と PATCH の両方を確認）「実行中も取り消せる。完了・失敗は 409」 | 未実施 |
| AC5 | 再実行で新しい ID と `retry_of`。終端は不変 | 合格 | requests-screen「再実行 › 失敗・取消の依頼と同じ期間・補足指示で新しい依頼を作り、元の ID を残す」「待機中・完了の依頼は再実行できない（409）」 | 未実施 |
| AC6 | 取込は選択中の依頼を完了にし、未選択なら完了済み依頼を1件作る。形式誤りは行番号付き 422 | 合格 | reports-screen「取込 › request_id 無しなら完了済みの依頼を作って取り込む（created_via=import）」「request_id 付きならその依頼を完了にし…」「形式・版番号の誤りは保存せず、依頼も残さない」 | 未実施 |
| AC7 | アーカイブは一覧と analysis_history から外れ、『アーカイブを表示』で見え、戻せる。reports の行は不変 | 合格 | reports-screen「アーカイブ › アーカイブした版は既定の一覧から消え、archived=1 で見える。版の行は変わらない」、skill-api「アーカイブした版は analysis_history から外れ、戻すと再び入る」、E2E のアーカイブと元に戻す | 未実施 |
| AC8 | チェックしたアクションだけ登録。初期は主対象だけチェック。二重登録0件 | 合格 | reports-screen「アクション登録 › 選んだアクションだけを登録し、同じ版・同じキーは二重登録しない」、E2E の『登録済み』 | 未実施 |
| AC9 | 詳細の先頭に『前回からの変化』、履歴0件は『初回分析』、2版比較 | 合格 | reports-screen「比較 › 要点の変化と、発見・アクションの増減を返す」、E2E の seed v2 の『前回からの変化』（参照した直近版: v1）・『初回分析』・比較ダイアログ | 未実施 |
| AC10 | skill 依頼に『自動』バッジ。閲覧者に降格した発行者のトークンは 403 | 合格 | requests-screen「スキル依頼 › 実行中・created_via=skill で作り…」「viewer のトークンは 403…」（降格した editor のトークンで `POST /api/skill/requests` が 403）、skill-api「…viewer へ降格した人のトークンは export だけ・書込みは 403」、E2E の A-0002 の『自動』バッジ | 未実施 |
| AC11 | 閲覧者はボタン非表示・API 403、他チャンネル管理は 404、11件目/分は 429、audit_log に1件ずつ | 合格 | E2E「閲覧者は一覧・詳細を見られるが、書込ボタンは出ない」、requests-screen「…画面と合算で11件目は 429」、reports-screen「他テナントのレポートは出ない・開けない」 | 未実施 |
| AC12 | 『ワークスペース』『テナント』の表示0件 | 合格 | `wording-check`（表示名は `src/domain/labels.ts` の `TENANT_LABEL` 1か所） | 未実施 |
| AC13 | 3サイズの E2E | 合格（分析3本×3サイズを含む全138件成功） | `e2e/analysis.spec.ts` | CI で実行予定 |

## 2. 証跡

置き場所は `evidence/feat-ai-analysis-screen/`。

| 種類 | 場所 |
|---|---|
| 単体と結合テスト | `unit-test-run.txt`（全375件成功） |
| E2E | `e2e-run.txt`（3サイズ、138件成功） |
| 型検査 | `typecheck.txt` |
| lint | `lint.txt` |
| 空の DB への migration 適用 | `migrations-empty-db.txt` |
| 表示語の検査（AC12） | `wording-check.txt` |
| 色の検査（AC1） | `css-vars-check.txt` |
| 証跡の索引 | `index.json`（AC ごとの判定と証跡パス） |
| 画面 | `analysis-owner-mobile.png`、`analysis-owner-tablet.png`、`analysis-owner-desktop.png`、`analysis-viewer-desktop.png` |

## 3. 手で確かめる手順（ローカル）

準備は runbook.md の 3 節。seed のチャンネル管理Aには A-0001〜A-0005（完了・完了（自動）・失敗・実行中・待機中）と2版のレポートがある。

1. **AC1・AC10**: `owner@example.com` で /analysis を開く。①依頼 ②実行状況 ③レポートと下部バーが並び、A-0002 の行にだけ『自動』が付く。
2. **AC2**: ブラウザのクリップボード権限を拒否してから『Claude Code用プロンプトをコピー』を押す。選択状態のテキスト欄が出て、中に `YTA_SKILL_TOKEN` の案内はあるがトークン文字列は無い。
3. **AC3**: 期間で『任意』を選び、明日や367日の範囲を入れると確定できない。確定すると URL が `?period=custom&from=&to=` になり、ヘッダーの期間表示も同じになる。
4. **AC9**: 8月の振り返り（v2）を開くと、要約の先頭に『前回からの変化』が出る。v1（7月の全体診断）を開くと『初回分析』。
5. **ポーリング**: A-0004（実行中）がある状態で開発者ツールのネットワークを見ると、10秒ごとに `/api/analysis-requests` を取る。タブを隠すと止まり、戻すとすぐ取り直す。待機中・実行中を全部取り消すと止まる。
6. **900px 切替**: 幅を 899px 以下にすると2カラムが縦に並び、表がカードになり、下部バーが下部タブの上に固定される。
7. **AC11**: `viewer@example.com` で入ると、コピー・取込・キャンセル・再実行・アーカイブ・登録のボタンが出ない。
