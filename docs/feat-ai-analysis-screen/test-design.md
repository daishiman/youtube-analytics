# feat-ai-analysis-screen テスト設計（SYS-AIA-P04）

最終更新: 2026-09-25。受入13項目（AC1〜AC13）を、どの層のどのテストで確かめるかを書く。

## 1. 層の分け方

| 層 | 場所 | 対象 | 実行環境 |
|---|---|---|---|
| 単体（画面の純関数） | `tests/analysis/web-format.test.ts` | `checkJson`・`errorLine`（行番号）・表示の整形・期間の境界 | Vitest |
| 単体（詳細の表示モデル） | `tests/analysis/history-review.test.ts` | `web/pages/analysis/history-review.ts`。正本 fixture と seed の結果 JSON を parseReport に通したものだけを入力にする | Vitest |
| 結合（API とユースケース） | `tests/analysis/requests-screen.test.ts`・`tests/analysis/reports-screen.test.ts` | 状態遷移・権限・越境・レート制限・取込・アーカイブ・アクション登録 | Vitest（Workers プール、D1 は毎回 migration 適用済み） |
| 横断（ルートの網羅と保護） | `tests/platform/routes.ts`・`routes-coverage.test.ts`・`tests/settings/settings.test.ts` | 全ルートの権限分類、別 Origin の書込拒否 | Vitest |
| スキル API | `tests/skill-analysis/skill-api.test.ts` | 降格したトークンの 403（PATCH・reports） | Vitest |
| E2E | `e2e/analysis.spec.ts` | 画面の通し操作。390×844 / 820×1180 / 1440×900 の3プロジェクト | Playwright |

`tests/analysis` は4ファイル（件数は実行結果を正とする）。E2E は3本×3サイズで、チャンネル管理をサイズごとに分ける（`analysis-<project>@example.com`。版番号がチャンネル管理ごとの連番のため）。

## 2. AC とテストの対応

| AC | テスト（ファイル › テスト名） |
|---|---|
| AC1 | E2E「依頼 → コピー → 取込 → 登録 → 2版比較 → アーカイブ → 取消・再実行」で3区画と下部バーを確認。色は `css-vars-check`（CSS 変数以外の色指定0件） |
| AC2 | requests-screen「プロンプト › 依頼 ID・期間・補足指示・送信先を含み、トークンの平文は含まない」。E2E で `navigator.clipboard.readText()` の中身と、`writeText` 失敗時の手動コピー欄を確認 |
| AC3 | web-format「期間の境界（今日まで可・明日は未来・366日は可・367日は長すぎる）」、E2E「期間を切り替えると、表示と使用データが追従する」 |
| AC4 | requests-screen「取消 › 待機中・実行中を取消にし…以後スキルの送信は 409」「実行中も取り消せる。完了・失敗は 409」「viewer は 403 で状態は変わらない」 |
| AC5 | requests-screen「再実行 › 失敗・取消の依頼と同じ期間・補足指示で新しい依頼を作り、元の ID を残す」「待機中・完了の依頼は再実行できない（409）」 |
| AC6 | reports-screen「取込 › request_id 無しなら完了済みの依頼を作って取り込む（created_via=import）」（qa-092 を独立に確認）「request_id 付きならその依頼を完了にし、同じ内容の再取込は 200 で版を増やさない」「形式・版番号の誤りは保存せず、依頼も残さない」。行番号は web-format の `errorLine` |
| AC7 | reports-screen「アーカイブ › アーカイブした版は既定の一覧から消え、archived=1 で見える。版の行は変わらない」「viewer は 403・無い版は 404」、skill-api「アーカイブした版は analysis_history から外れ、戻すと再び入る」 |
| AC8 | reports-screen「アクション登録 › 選んだアクションだけを登録し、同じ版・同じキーは二重登録しない」「空・範囲外・形式違いのキーは 400、viewer は 403」 |
| AC9 | reports-screen「詳細 › 本文・発見・アクション（主対象付き）・版一覧を返し…」「比較 › 要点の変化と、発見・アクションの増減を返す」「同じ版・片方欠け・他テナントの版はエラー」「詳細 › 版一覧は同じチャンネルの版を件数で切らずに返す…」、history-review「history_review（前回からの変化）」、E2E で『前回からの変化』・『初回分析』の表示と2版比較のダイアログ |
| AC10 | requests-screen「スキル依頼 › 実行中・created_via=skill で作り、期間省略は直近28日」「viewer のトークンは 403…」（降格した editor のトークンも 403）、skill-api「viewer はトークンを発行できず、viewer へ降格した人のトークンは export だけ・書込みは 403」、E2E の閲覧者テストで A-0002 の『自動』バッジ |
| AC11 | requests-screen「依頼の詳細 › 閲覧者でも取れ、他テナントの依頼は 404」「再実行も依頼作成のレート制限（1分10件）に数える」「viewer のトークンは 403、チャンネル未連携は 409、画面と合算で11件目は 429」、reports-screen「他テナントのレポートは出ない・開けない」、E2E「閲覧者は一覧・詳細を見られるが、書込ボタンは出ない」 |
| AC12 | `wording-check`（web・`src/lib/errors.ts`・`src/usecases/`・規約2ページで、コメント以外の『ワークスペース』『テナント』0件） |
| AC13 | E2E 3本 × 3サイズ |

## 3. 画面の振る舞いの確認方法

- **ポーリング**: 待機中・実行中が0件なら止まる、hidden で止まる、visible で即再取得して再開する、間隔10秒。自動テストは無く、acceptance.md 3 節の手順で手で確かめる。
- **900px 未満の表示切替**: E2E の mobile（390）と tablet（820）で2カラムの縦積み・表のカード化・下部バーの位置を通し操作の中で確かめる。見た目は `analysis-owner-{mobile,tablet,desktop}.png` で残す。

## 4. テストの隙間（把握済み）

計画時に挙げた隙間（PATCH の取消後 409、降格した発行者のトークンでの `POST /api/skill/requests`、analysis_history のアーカイブ除外、『自動』バッジと『前回からの変化』、手動コピー欄）は、テストを足して埋めた（経緯は qa-report.md の4・5節、テスト名は本書2節の AC2・AC4・AC7・AC9・AC10）。自動テストが無いのはポーリングの実時間の動きだけで、3節のとおり手で確かめる。

## 5. 実行方法

```bash
pnpm -s vitest run tests/analysis
pnpm test                           # 全体
E2E_PORT=8794 pnpm e2e              # 3サイズ。webServer が migration と seed を流すので、共有の dev サーバとポートを分ける
```
