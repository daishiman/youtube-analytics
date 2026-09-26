# 保守の手引き

スキル自体を変えるときだけ読む。通常のレポート生成では読まない。

## 正本と責務

- 外部への入口は `scripts/report.mjs`。通常は init・build、早期診断は check、依頼時の厳格検証だけ verify・done を使う。個別スクリプトを別の公開経路にしない。
- セクション、情報量の段階・上限、列挙値、review の契約などの機械可読な正本は `scripts/lib.mjs` と `scripts/check-llm.mjs`。LLM へ操作を伝える prompt に必要な転記は、`selftest.mjs` で正本と照合する。
- `scripts/new-report.mjs` と `scripts/profile-data.mjs` は初期化、`scripts/stats.mjs` は計算、`scripts/charts.mjs` と `scripts/compose.mjs` は表現部品を担う。
- `scripts/build-report.mjs` と `check-report.mjs` は通常 build の生成・静的検査、`verify-render.mjs` と `build-state.mjs` は依頼時だけの実描画・証跡を担う。
- `assets/` は雛形と埋め込み資産。雛形の構造契約は `check-report.mjs` が検査し、vendor の出所と digest は `assets/vendor/SOURCE.json` が持つ。
- 通常変更のゲートは `scripts/smoke-test.mjs`。全変異・統計・図・証跡の回帰ゲートは `scripts/selftest.mjs` に分離し、必要な変更でだけ使う。

## 変更の流れ

1. 変える責務の機械正本を1つに絞る。prompt への人間向け転記が必要な場合は、同じ変更で selftest の照合も更新する。
2. 機械契約を変えたら、正常系だけでなく、欠落・不正値・依存切れの変異ケースを `selftest.mjs` に追加する。通常の文書変更では増やさない。
3. 文書は意図と使い方を説明する。人間の操作に不要な列挙・フィールドは機械正本のみに置く。
4. まず高速スモークを実行し、失敗の最初の1件から直す。
5. 検査器・統計・図・生成器・vendor 同期を変えた場合だけ全回帰を実行する。レポート雛形または描画を変えたときは、その後に実レンダリングを目視する。

```bash
S=.claude/skills/report-design-system/scripts
node $S/smoke-test.mjs
```

全回帰が必要な変更だけ実行する。`selftest.mjs` 内で vendor digest も検査するため、`sync-kit.mjs --verify` の重複実行は不要。

```bash
node $S/selftest.mjs
```

キットの更新を取り込む場合だけ、キットのルートを明示する。スクリプトに場所を推測させない。

```bash
node $S/sync-kit.mjs --kit <キットのルート> --check
node $S/sync-kit.mjs --kit <キットのルート>
node $S/selftest.mjs
```

## 追加時の判断

- 部品は `compose.mjs`、図は `charts.mjs`、統計手法は `stats.mjs` に置き、生成物側へ同じ実装を書かない。
- 統計手法は対象範囲の定番だけを追加し、既知値と失敗ケースを selftest へ入れる。因果推論や高度な予測を、記述・比較用の関数群へ混ぜない。
- 参照文書に巨大なプロンプトや別 workflow を貼り付けない。構造汚染の回帰は selftest の reference-integrity guard で止める。
