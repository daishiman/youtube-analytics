# feat-skill-analysis-reports 受入判定（SYS-SAR-P07）

最終更新: 2026-09-25。判定はローカルで行った（Workers runtime とローカル D1/R2 の vitest 35ファイル・375件、Playwright 138件、実 dev サーバ http://localhost:8793 での /yt-analyze 通し実行）。commit・push・deploy はしていないため、公開環境の列はすべて未実施。証跡の索引は `evidence/feat-skill-analysis-reports/index.json`。

## 1. 判定

| # | 受入項目 | ローカル | 根拠（テスト名・スクリプト） | 証跡 | 公開環境 |
|---|---|---|---|---|---|
| 1 | /yt-analyze を1回実行するだけで、依頼 → export → HTML と JSON の反映まで手作業なしで終わる | 合格 | 実 dev サーバで `node .claude/skills/yt-analyze/scripts/yt-analyze.mjs` を依頼IDなしで1回実行し、A-0011 v3 を HTTP 201 で保存（exit 0）。画面でも A-0011 が「完了・自動・100%」。フィクスチャでは `--with-stub=201\|403` が exit 0/4（判定時は 404 モードの exit 5 も確かめた。404 モードは 2026-09-25 に「未提供」分岐とともに廃止）。launchd の plist は `plutil -lint` 合格 | `e2e-run.txt`、`live-run-owner-desktop.png`、`plutil-lint.txt` | 未実施 |
| 2 | 週次5段ファネル・下流結果・改善候補（全指標目標達成または判定保留の理由）があり、因果を断定しない | 合格 | フィクスチャ sample の通し実行で「改善候補あり＝流入段のクリック率」（target_gap が負で最小の指標）を選び、その結果 JSON が再計算と完全一致。空データでは判定保留とその理由を出す。vitest「全指標目標達成・判定保留も受ける（受入2）」 | `e2e-run.txt`、`reproducibility.txt`、`unit-test-run.txt` | 未実施 |
| 3 | 同じ tenant と channel の完了済み直近5版だけを使い、前回仮説の当否・施策効果・参照版を保存する | 合格 | 「同じテナント・チャンネルの完了済み直近5版だけを新しい順に返す（他テナントは混ざらない）」「参照した版番号を保存し、存在しない版の参照は 422（受入3）」 | `unit-test-run.txt` | 未実施 |
| 4 | 履歴0件は初回分析として成功し、別の tenant/channel の履歴は混ざらない | 合格 | 「履歴0件でも初回分析として export でき、版1・キー request_id:v1 を返す」、直近5版のテスト、「依頼後に連携チャンネルが変わっていたら export しない」 | `unit-test-run.txt` | 未実施 |
| 5 | 改善アクションの効果比較に、対象ファネル段と下流結果が含まれる | 合格 | 「改善アクションの効果比較は対象ファネル段と指標を持つ」で段・指標・baseline・result に加え、analysis_history の downstream の値（問い合わせ3・成約1）まで確認 | `unit-test-run.txt` | 未実施 |
| 6 | 同じ Idempotency-Key の二重送信で版が増えない | 合格 | 「同じ Idempotency-Key の二重送信で版が増えない（受入6）」「Idempotency-Key が request_id:v版 と食い違えば 400」 | `unit-test-run.txt` | 未実施 |
| 7 | 過去の版は更新されない | 合格 | 「過去の版は書き換えられない（受入7…）」。トリガは 0009・0011 | `unit-test-run.txt`、`migrations-empty-db.txt` | 未実施 |
| 8 | 他テナントのトークンでは export できない | 合格（404） | 「他テナントのトークンでは依頼を export できない（404）」「無い・形式違い・失効済み・未知のトークンは 401」 | `unit-test-run.txt` | 未実施 |
| 9 | export の各行が source（api\|studio_csv\|business_csv）を持つ | 合格 | 「各行が source（api\|studio_csv\|business_csv）を持ち、期間外・他チャンネルの行は含まない」。M1〜M10 を studio_csv の行だけで計算するのは funnel.mjs | `unit-test-run.txt` | 未実施 |
| 10 | report_html は report.mjs build の合格物で、結果 JSON の数値は analysis.mjs を再実行した値と一致する | 合格 | `verify-analysis-reproducibility.mjs` で sample・empty・実サーバ送信済み（A-0011 v3 の posted-result.json）の3件が完全一致（exit 0）。report.mjs build の検査は通し実行の中で合格 | `reproducibility.txt`、`e2e-run.txt` | 未実施 |
| 11 | 事実と解釈を分け、仮説に反証条件と判定を付ける。因果の断定は0件 | 合格 | `check-no-causal-language.mjs` が10ファイルで検出0件（exit 0）。check-report（E08・E21）と LLM 検査（results）も通し実行で合格。サーバ側でも CAUSAL_PATTERNS で検査する（report-schema.ts） | `no-causal-language.txt`、`e2e-run.txt` | 未実施 |
| 12 | report-design-system は取込元と diff -r で一致し、無改変のまま | 合格 | `check-rds-unmodified.mjs` が取込元と一致（exit 0）。取込元が見つからない環境では exit 3 で止まる（確かめられないのに合格にしない）。CI など取込元の無い場所では `--allow-unverifiable` を明示したときだけ有無の確認に落とす | `rds-unmodified.txt` | 未実施 |

まとめ: ローカルでは12項目すべて合格。公開環境（preview・Actions）と、実際の `claude -p` による定時起動は未確認。

### 実行中に見つけて直した不具合（空データ経路）

実 dev サーバでは、書き出し行の元になる `analysis_export_rows`・`analysis_export_targets` がまだ無い（未分解の収集 feature が作る）。そのため書き出しは常に0行になる。この状態で通し実行すると、report-design-system の検査で5回続けて止まった（A-0006〜A-0010。画面には「失敗・自動」と理由が残る）。

- brief の仮説が profile に無い列を指していた → 週次データが0週なら仮説を置かない（pipeline.mjs）
- 要因セクションが0個 → 「判定保留」の要因を1つ置く（render.mjs）
- 結論・KPI・facts に数字が無い、facts に「原因」の語 → 判定できた指標数・判定保留の指標数・書き出し行数など数字で書く
- results.steps に要因が無い → 「判定保留」の step を足す

直したあとの A-0011 で成功し、同じ形の空データをフィクスチャ `tests/fixtures/skill-analysis-empty/` として残した（再現性の確認に使用）。

## 2. 証跡

| 種類 | 場所 |
|---|---|
| 索引 | `evidence/feat-skill-analysis-reports/index.json` |
| 単体と結合テスト | `evidence/feat-skill-analysis-reports/unit-test-run.txt` |
| 画面 E2E（Playwright） | `evidence/feat-skill-analysis-reports/e2e-playwright.txt` |
| スキルの通し実行 | `evidence/feat-skill-analysis-reports/e2e-run.txt` |
| 通し実行後の画面 | `evidence/feat-skill-analysis-reports/live-run-owner-desktop.png` |
| 型検査 | `evidence/feat-skill-analysis-reports/typecheck.txt` |
| lint | `evidence/feat-skill-analysis-reports/lint.txt` |
| 空の DB へのマイグレーション | `evidence/feat-skill-analysis-reports/migrations-empty-db.txt` |
| 無改変 | `evidence/feat-skill-analysis-reports/rds-unmodified.txt` |
| 非因果 | `evidence/feat-skill-analysis-reports/no-causal-language.txt` |
| 再現性 | `evidence/feat-skill-analysis-reports/reproducibility.txt` |
| launchd の plist | `evidence/feat-skill-analysis-reports/plutil-lint.txt` |

## 3. 残っている確認

1. **公開環境**: commit・push のあと、preview 環境で同じ通し実行をし、表の「公開環境」列を埋める。
2. **定時起動**: `ops/launchd/` の plist のプレースホルダ（リポジトリの場所など）を実際の値にして読み込み、`claude -p` での1回を確かめる。時刻は JST を前提にしている。
3. **実データ**: 収集 feature が `analysis_export_rows`・`analysis_export_targets` を作ったあと、判定保留でない版（改善候補あり）が実サーバでも出ることを確かめる。
