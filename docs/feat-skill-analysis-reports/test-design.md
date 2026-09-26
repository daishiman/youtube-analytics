# feat-skill-analysis-reports テスト設計（SYS-SAR-P04）

最終更新: 2026-09-25。

## 1. 層

| 層 | 対象 | 場所 |
|---|---|---|
| 単体と結合（Workers runtime + ローカル D1/R2） | 画面 API、スキル API、usecase、トリガ | `tests/skill-analysis/requests.test.ts`、`skill-api.test.ts`、`reports.test.ts`（境界テーブルは `helpers.ts` が作る） |
| ルート網羅 | 登録ルートと仕様の突合 | `tests/platform/routes.ts`、`routes-coverage.test.ts` |
| スキルの通し実行 | init → build → POST | `scripts/skill-analysis/run-yt-analyze-fixture.mjs`（スタブは `tests/skill-analysis/fixtures/skill-requests-stub-server.mjs`） |
| 再現性 | analysis.mjs の2回計算の一致 | `scripts/skill-analysis/verify-analysis-reproducibility.mjs` |
| 非因果 | 禁止表現の走査 | `scripts/skill-analysis/check-no-causal-language.mjs`、report-design-system の `check-report.mjs` |
| 無改変 | report-design-system と取込元の一致 | `scripts/skill-analysis/check-rds-unmodified.mjs` |

計画では受入ごとに9ファイル（analysis-output、history、history-boundary、action-effect、idempotency、append-only、tenant-isolation、export-source、e2e-yt-analyze の各 `.test.ts`）に分ける予定だった。実装では3ファイル・51件にまとめた。e2e-yt-analyze.test.ts はまだ無く、受入1はドライバスクリプトで確かめる。

## 2. 受入とテストの対応

| # | 受入 | テスト（実在する名前） |
|---|---|---|
| 1 | /yt-analyze 1回で完了 | `run-yt-analyze-fixture.mjs`（request_id を渡す場合と渡さない場合。`--with-stub=201/403`） |
| 2 | 5段ファネル・候補・全達成・保留、非因果 | 「全指標目標達成・判定保留も受ける（受入2）」。候補の選び方は compute.mjs が担う |
| 3 | 直近5版と参照版の保存 | 「同じテナント・チャンネルの完了済み直近5版だけを…」「参照した版番号を保存し、存在しない版の参照は 422（受入3）」 |
| 4 | 初回分析と混入なし | 「履歴0件でも初回分析として export でき、版1・キー request_id:v1 を返す」、上の直近5版のテスト |
| 5 | 効果比較 | 「改善アクションの効果比較は対象ファネル段と指標を持つ」 |
| 6 | 二重送信 | 「同じ Idempotency-Key の二重送信で版が増えない（受入6）」 |
| 7 | 追記だけ | 「過去の版は書き換えられない（受入7…）」 |
| 8 | 他テナントの拒否 | 「他テナントのトークンでは依頼を export できない（404）」 |
| 9 | source | 「各行が source（api\|studio_csv\|business_csv）を持ち…」 |
| 10 | build 合格物と再現性 | `verify-analysis-reproducibility.mjs --compare-with` |
| 11 | 事実と解釈の分離、反証条件、断定0件 | `check-report.mjs`（E21・E08）と `check-no-causal-language.mjs` |
| 12 | 無改変 | `check-rds-unmodified.mjs` |

## 3. 実行方法

```bash
pnpm -s vitest run tests/skill-analysis
node scripts/skill-analysis/run-yt-analyze-fixture.mjs tests/fixtures/skill-analysis-sample --with-stub=201
node scripts/skill-analysis/verify-analysis-reproducibility.mjs tests/fixtures/skill-analysis-sample
node scripts/skill-analysis/check-no-causal-language.mjs tests/fixtures/skill-analysis-sample
node scripts/skill-analysis/check-rds-unmodified.mjs
```

run-yt-analyze-fixture の終了コードはスキル（`yt-analyze.mjs`）と同じで、正本は `.claude/skills/yt-analyze/SKILL.md`。`--with-stub=201` は 0、`--with-stub=403` は 4 で終わる。
