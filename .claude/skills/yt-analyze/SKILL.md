---
name: yt-analyze
description: YouTube分析アプリの「AI分析」依頼を1件処理するスキル。スキル連携 API（/api/skill/*）から週次データを書き出し、report-design-system で売上ファネル（露出→流入→維持→導線→成約）の目標差を再現計算して単一 HTML レポートにし、結果 JSON をアプリへ送る。「/yt-analyze」「AI分析を実行」「依頼 A-xxxx を分析」「週次分析」で使う。因果の断定と予測はしない。
---

# /yt-analyze — 週次ファネル分析

アプリの AI分析画面で作られた依頼（または、この手順で作る依頼）を1件受け取り、次の順で処理する。数字はすべて `lib/compute.mjs` がコードで計算し、同じ書き出しからは何度実行しても同じ結果になる。LLM が数字を書き換えたり、手で書き足したりしない。

## 使い方

```bash
# 依頼IDがある（AI分析画面で作った依頼）
node .claude/skills/yt-analyze/scripts/yt-analyze.mjs --request-id A-0001

# 依頼IDが無い（週次の自動実行など）: 個人トークンで依頼を作ってから処理する
node .claude/skills/yt-analyze/scripts/yt-analyze.mjs [--period-start 2026-08-03 --period-end 2026-08-30] [--instruction "..."]
```

| 環境変数 | 意味 |
|---|---|
| `YTA_BASE_URL` | アプリの URL。既定は `http://localhost:8791` |
| `YTA_SKILL_TOKEN` | 設定画面で発行した個人トークン（`yta_` で始まる）。必須。ログや出力に書かない |
| `YTA_WORK_ROOT` | 分析フォルダの置き場。既定は `~/.youtube-analytics/yt-analyze-runs` |
| `RDS_HOME` | report-design-system の場所。既定は同じ skills ディレクトリの `report-design-system` |

終了コード: 0=成功、1=その他の失敗、2=引数の誤り、3=接続できない、4=401・403、5=404（依頼が見つからない）、6=409（依頼が取消済み）。
週次起動のランチャ（`ops/launchd/run-weekly-analysis.sh`）の終了コードは `ops/launchd/README.md` を参照する。

## 手順（`lib/pipeline.mjs` がこの順に実行する）

1. **依頼を決める**: `request_id` が指定されていればそれを使う。無ければ `POST /api/skill/requests` で依頼を作る（期間と指示は任意。省けばサーバが最新28日を使う）。
   - 403: トークンの持ち主が閲覧者で、依頼を作る権限（content.write）が無い。理由を表示して非0で終了する。
2. **書き出し**: `GET /api/skill/export?request_id=` を取得し、`PATCH /api/skill/requests/:id` で `{progress:20, stage:1}` を送る。
3. **分析フォルダを作る**: 週次ファネル CSV（`funnelCsv`）を作り、`report.mjs init` で分析フォルダを作る。`templates/brief.json`（`範囲` は依頼の期間で上書き）、`templates/analysis.mjs`、`export.json` を置く。その後 `{progress:50, stage:2}` を送る。
4. **再現計算と HTML**: `report.mjs build` を実行する。analysis.mjs が `lib/render.mjs` を呼び、`results.json`・`<name>.src.html`・`yt-result.json` を書く。build は brief 検査・レポート検査・results 検査がすべて合格した場合だけ成功する。
5. **反映**: `{progress:90, stage:3}` を送ってから、`POST /api/skill/reports` に書き出しの `idempotency_key` を `Idempotency-Key` として付けて結果 JSON を送る。201 は新しい版が保存されたこと、200 は同じ版の再送で版が増えていないことを表す。
6. **失敗時**: 取消（409）以外の失敗は、`{status:"失敗", error:"<500字以内>"}` を PATCH して画面に理由を残す。

report-design-system は無改変で取り込んだものなので、1バイトも編集しない。YouTube 向けの違いは `templates/brief.json`・`templates/analysis.mjs`・`lib/` で表す。

## 判定の決まり

- 週は書き出しの `period`（週の開始日）単位で数える。開始日から7日目が依頼の期間末までに入る週だけを「確定週」とし、最新の確定週を対象週にする。確定週が無ければ全指標を「鮮度不足」で保留にする。
- 原因指標は5つ（露出=インプレッション、流入=クリック率、維持=加重平均視聴率、導線=導線誘導率、成約=問い合わせ→成約率）。目標比 `target_gap = (実績 − 目標) ÷ 目標` が負の指標のうち、最も小さいものを改善候補にする。
- 次の指標は判定保留にする: 分母が0または入力が欠けている、目標が無い（または0以下）、最小サンプル（min_sample）に届かない。
- 改善候補があれば「改善候補あり」。未達が無く、5指標すべてを判定できれば「全指標目標達成」。未達が無いが保留の指標が残れば「判定保留」。
- 原因指標は Studio CSV だけから計算する。Data API の値は混ぜない（`sources_used.excluded`）。
- 仮説 H1（未達が続いている）と対立仮説 H2（対象週だけの下振れ）は、判定できた週が4週以上ある場合だけ、反証条件で採用か棄却を決める。4週未満なら保留にする。
- 過去の分析は、今回の版より前の版を新しい順に最大5件まで使う。前回の仮説と打ち手の効果を再判定して `history_review` に入れる。

## 因果の断定を禁止する

- 目標との差、推移、時間的な前後だけを根拠に、ある指標が売上を動かしたと断定しない。書いてよいのは「目標との差が最大」「改善候補」「関係は施策後の効果測定で確かめる」までにする。
- `summary`・`conclusion` はアプリ側でも `src/domain/report-schema.ts` の `CAUSAL_PATTERNS` で検査され、該当すると 422 で拒否される。report-design-system の検査（E21）も、留保のない強い因果表現を不合格にする。
- 文言を変えたら `node scripts/skill-analysis/check-no-causal-language.mjs` で確かめる。このスクリプトは `lib/causal-language.mjs`（`CAUSAL_PATTERNS` と同じパターン）を使う。

## 分析担当としての振る舞い

Claude Code から `/yt-analyze` として呼ばれた場合は、`prompts/analyst-youtube.md` の方針に従う。スクリプトの出力（判定・警告・失敗理由）をそのまま利用者に伝え、数字を言い換えたり補ったりしない。

## 確認用コマンド（リポジトリ直下から）

```bash
node scripts/skill-analysis/run-yt-analyze-fixture.mjs tests/fixtures/skill-analysis-sample --with-stub=201   # 0
node scripts/skill-analysis/run-yt-analyze-fixture.mjs tests/fixtures/skill-analysis-sample --with-stub=403   # 4（権限なし）
node scripts/skill-analysis/verify-analysis-reproducibility.mjs tests/fixtures/skill-analysis-sample          # 0（2回の計算が一致）
node scripts/skill-analysis/check-no-causal-language.mjs                                                       # 0
node scripts/skill-analysis/check-rds-unmodified.mjs                                                           # 0
```
