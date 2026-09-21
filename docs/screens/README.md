# 画面資料の正本

- UI挙動・情報優先順位の正本は `system-spec/ui-ux.md`、`docs/analysis/dashboard-analysis-catalog.md`、`prompts/*.prompt.txt` です。
- `prompts/_shared.prompt.txt` は6画面共通デザインの唯一の正本です。各画面promptは固有内容だけを持ちます。
- `*.png` は生成時点の確認用スナップショットです。2026-09-22時点の `02-dashboard.png` は週次売上ファネル追補前の画像で、受入判定には使いません。次回画像生成時にprompt正本から更新します。
- `_prev-5screens/` は履歴です。現行仕様と重複していても参照用に保持し、正本として編集しません。
