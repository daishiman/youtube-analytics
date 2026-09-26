# feat-dashboard-redesign 品質レポート（SYS-DBR-P09）

> テスト件数・合否は初回ダッシュボード受入時点の証跡。後続の収集・取込変更を含む現在の全件合否や公開環境の稼働を示すものではない。現行のデータ範囲は `data-coverage-audit.md` を参照。

> 本書は初回実装時の検証記録。2026-09-25 の追加改善と最新のテスト件数・4条件の判定は `elegant-review-followup.md` を参照。

最終更新: 2026-09-25。

## 1. 品質ゲート

| ゲート | コマンド | 結果 | ログ |
|---|---|---|---|
| 型検査 | `pnpm typecheck` | 成功 | `evidence/feat-dashboard-redesign/typecheck.txt` |
| lint | `pnpm lint` | 成功（エラー 0、警告 0、info 0） | `lint.txt` |
| 単体と結合テスト | `pnpm test` | 50ファイル、447件すべて成功（重複整理のレビュー後に取り直し）。うち `tests/dashboard/` は5ファイル66件 | `unit-test-run.txt` |
| E2E（3サイズ） | `E2E_PORT=8791 npx playwright test` | 204件すべて成功（重複整理のレビュー後に取り直し）。当初の1件失敗（`login.spec.ts` A5 の mobile）は、共通の `devLogin`（`e2e/helpers.ts`）で入力欄の描画を待ってから同意するよう直し、A5 の60回連続実行で成功（`e2e-login-a5-repeat.txt`） | `e2e-run.txt` |
| E2E（dashboard だけ） | `npx playwright test e2e/dashboard.spec.ts` | 24件成功（E1〜E8 × 3サイズ） | `e2e-dashboard-parallel.txt` |
| migration | 空の D1 に 0001〜0008 を適用 | 成功 | `P08-migration-empty-db.txt` |
| deploy の dry-run | `pnpm build` | 成功（`THUMBNAIL_QUEUE`、`thumbnail-queue` の consumer を含む） | `build-dry-run.txt` |
| 構成チェック | `pnpm check:repo` | 成功 | `check-repo.txt` |

lint の最後の info（テストの文字列連結）は直したので、lint.txt は info 0 で取り直した。直したのはテストの書き方だけで、`tests/dashboard` の44件は再実行して全件成功。

## 2. login A5 の失敗（修正済み）

全件の E2E で、`e2e/login.spec.ts` の「A5 連携済みなら案内を出さない」がまれに失敗していた。原因は2つあった。

1. `/api/me` の差し替えをログイン前に入れていたため、ログイン中の画面遷移で応答が破棄され（`Response has been disposed`）、差し替えが空振りした。ログインを終えてから差し替え、読み直す形にした。
2. 開発用ログインの欄が描かれる前に同意を押すと、画面の組み直しでチェックが外れた（`Clicking the checkbox did not change its state`）。login と dashboard の spec に同じ `devLogin` が重複していたので `e2e/helpers.ts` へまとめ、欄が出てから押すようにした。

A5 だけを3サイズ×20回繰り返して60件すべて成功（`e2e-login-a5-repeat.txt`）。`e2e/smoke.spec.ts` にも同じ形のログイン処理があるが、このワークツリーでは変更していないファイルなので残した。

## 3. 設計レビュー・テスト設計の後に足したテスト

受入項目のうち、テストが薄かった3つを補った。

| AC | 追加したもの |
|---|---|
| AC9 | dashboard-api の最初のテストで、CSP の `img-src` に `'self' data:` があり、`ytimg` が無いことを検査 |
| AC11 | dashboard-api「video_ids を101本以上選んでも 200」（105本を選び、選択と動画ごとの線が105件） |
| AC13 | thumbnails「1,100本を超えるテナントは公開日の新しい1,000本だけを対象にする（1,100本ちょうどは全件）」 |

## 4. 仕様と派生物の同期

- qa-109（期間は共通ヘッダーに統一）を仕様へ反映し、`system-spec/*.md`、`specs/youtube-analytics-system.md`、`architecture/youtube-analytics-system.md` の派生 digest を揃えた。`pnpm check:repo` が成功。
- 既存の `e2e/shell-state.spec.ts` は、共通ヘッダーの期間に 7日が増えたことに合わせて期待値を直した。

## 5. 手動で確かめたこと

`pnpm dev`（http://localhost:8791）で `owner@example.com` の開発用ログインから、ダッシュボードの区画順、期間の切替、動画選択、構成比、詳しく見る（ファネル）、`viewer@` の表示を確かめた。3サイズと 360px のスクリーンショットは `docs/feat-dashboard-redesign/screenshots/` にある。サムネイルは seed に画像が無いので代替表示（acceptance.md の注記）。
