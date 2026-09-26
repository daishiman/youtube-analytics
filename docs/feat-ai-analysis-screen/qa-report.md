# feat-ai-analysis-screen 品質レポート（SYS-AIA-P09）

最終更新: 2026-09-25。ローカルでの品質ゲートの結果をまとめる。公開環境（preview）での確認はまだしていない。

## 1. 品質ゲート

ログは `evidence/feat-ai-analysis-screen/` に置く。

| ゲート | コマンド | 結果 | ログ |
|---|---|---|---|
| 型検査 | `pnpm typecheck`（`tsc --noEmit`） | 成功 | `typecheck.txt` |
| lint | `pnpm lint`（`biome check .`） | 成功（150ファイル、修正なし） | `lint.txt` |
| 単体と結合テスト | `pnpm test` | 375件すべて成功 | `unit-test-run.txt` |
| E2E（3サイズ） | `E2E_PORT=<空きポート> pnpm e2e` | 138件成功（分析は3本×3サイズ） | `e2e-run.txt` |
| 空の DB への migration | 新しいローカル D1 に `pnpm db:migrate:local` | 0001〜0015 を順に適用する（結果はログを正とする） | `migrations-empty-db.txt` |
| 表示語 | web・`src/lib/errors.ts`・`src/usecases/`・`public/privacy.html`・`public/terms.html` を grep | コメント以外の『ワークスペース』『テナント』0件 | `wording-check.txt` |
| 色 | 追加した CSS の色指定を grep | 既存 CSS 変数以外の色0件 | `css-vars-check.txt` |
| 依存の脆弱性 | `pnpm audit --audit-level=high` | このレポートの作成時点では未実行（ネットワークが要るため）。公開前に実行する | — |

## 2. セキュリティの個別確認

| 観点 | 確かめ方 | 結果 |
|---|---|---|
| iframe に allow-scripts が無い | `web/` と `src/` を `allow-scripts` で grep | 0件。`ReportDetail.tsx` の iframe は `sandbox=""` |
| プロンプトにトークン平文が無い | requests-screen「プロンプト › …トークンの平文は含まない」 | 成功。プロンプトは `YTA_SKILL_TOKEN` を案内するだけ |
| トークン平文がリポジトリとログに無い | トークンは SHA-256 のハッシュだけを保存。監査の詳細は依頼 ID・版 ID・キーだけ | 問題なし（コード確認） |
| 別 Origin の書込拒否 | `tests/settings/settings.test.ts`「Origin 不一致の書込は拒否」に分析の書込7本を登録 | 成功 |
| 本文の上限 | reports-screen「取込 › viewer は 403、上限を超える本文は 413、上限を超える HTML は 422」（2026-09-25 に上限を `REPORT_BODY_MAX_BYTES` へ変えたときに改名） | 成功 |
| レート制限 | requests-screen「…画面と合算で11件目は 429」「再実行も依頼作成のレート制限（1分10件）に数える」 | 成功 |

## 3. migration の番号

feat-skill-analysis-reports が 0008〜0012 を使うため、暫定の 0008〜0010 を 0013〜0015 に付け替えた。記録は `eval-log/renumber-receipt-feat-ai-analysis-screen-20260925.json`（0008→0013、0009→0014、0010→0015）。`tasks/feat-ai-analysis-screen/` の記述は暫定番号のまま残っている。`migrations/` の先頭4桁に重複は無い（0001〜0015）。

## 4. 手動確認

| 項目 | 結果 |
|---|---|
| ポーリング（0件で停止・hidden で停止・visible で再開・10秒） | 実装（`web/pages/analysis/hooks.ts`）をコードで確認。ブラウザでの確認は acceptance.md 3 節の 5 の手順で行う |
| 900px 未満の表示切替（390・820） | E2E の mobile・tablet と画面の撮影で確認 |
| クリップボード失敗時の手動コピー欄 | E2E で `writeText` を失敗させ、手動コピー欄が選択状態で出ることを確認 |
| 公開環境（preview）での通し操作 | 未実施 |

## 5. 見つかった課題

| # | 内容 | 扱い |
|---|---|---|
| Q1 | scope_in の「表示名は1か所の定数から引く」が未実装。『チャンネル管理』は各ファイルに直書き | 解消。`src/domain/labels.ts` の `TENANT_LABEL` に集め、17ファイルから参照 |
| Q2 | `PATCH /api/skill/requests/:id` の取消後 409 を直接確かめるテストが無い | 解消。requests-screen の取消テストに PATCH の 409 を追加 |
| Q3 | 降格した発行者のトークンで `POST /api/skill/requests` が 403 になる直接のテストが無い | 解消。editor で発行し viewer に降格させて 403 を確認 |
| Q4 | analysis_history からのアーカイブ除外にテストが無い | 解消。skill-api にアーカイブ・戻しで analysis_history が変わるテストを追加 |
| Q5 | 『自動』バッジと『前回からの変化』を確かめる自動テストが無い | 解消。E2E の閲覧者テストで A-0002 の『自動』と v2 の『前回からの変化』を確認 |
