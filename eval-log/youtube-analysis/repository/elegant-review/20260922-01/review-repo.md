# Elegant review — repository

## 結論

30/30の思考法を適用し、3回の改善・独立再審査を経て、矛盾なし・漏れなし・整合性あり・依存関係整合の4条件はすべてPASSした。成果物や履歴は削除していない。

## 売上ファネル契約

- 原因指標: インプレッション、CTR、加重平均視聴率M1、導線誘導率（既定表示LINE誘導率）、問い合わせ→成約率（同週）。
- 結果指標: 売上、成約数。登録者数は参考の結果指標。
- 週次診断のYouTube側入力はStudio CSV、事業側入力は週次事業CSV。LINE誘導率は両方の複合由来を表示する。
- 改善候補は、targetが正で判定可能かつtarget_gapが負の段のうち最小の1件。全指標が0以上なら候補を作らない。
- 欠損、分母0、targetが0以下/未設定、min_sample未達、週未確定、週末後の取込なしは判定保留。
- 問い合わせ→成約率は同週スナップショットであり、コホート成約率ではない。

## 分析契約

- 同一tenant+channelの完了済み直近5版を、結論・要因・対象ファネル段・アクション・baseline/result・下流結果・版番号に絞って再利用する。
- 履歴0件は初回分析として正常。別tenant/channelは混ぜない。
- 新規版は前回仮説の当否、施策効果、前回差分、`history_versions_used`を持つ。

## 構造改善

- 6画面の共通デザインを`docs/screens/prompts/_shared.prompt.txt`へ集約した。
- 既存PNGは確認用スナップショットとし、仕様・分析カタログ・promptを受入正本にした。
- task依存表示をcanonical task graph参照のthin indexにし、13 node / 13 edge / root P01へ訂正した。
- READMEに正本・派生物・runtime投影・履歴の役割を整理した。AIDD runtimeやtask公開物など意図された投影は削除していない。
- 生成済みlineageのdigestは偽装更新せず、architecture projection・state graph・対象3 featureを正式再生成するまで計画を止めるgateを設けた。

## 検証

- 30思考法coverage: PASS
- Phase 1→2→3順序: PASS
- repository consistency: PASS
- feature frontmatter/context一致: PASS
- JSON構文、prompt生成shell構文、git diff check: PASS
- AIDD kit/runtime manifest: PASS
- 独立承認者: C1〜C4すべてPASS

## 増幅する再利用パターン

正本を一つに定め、派生物はthin projectionまたは機械検証付き再同期gateにする。生成を実行していないのにdigestだけを更新すること、分析履歴のHTML本体を毎回複製することは行わない。

## 実装前gate

現在の公開task package `feat-platform-tenant-auth` は今回の対象外で継続できる。`feat-csv-media-ingest`、`feat-skill-analysis-reports`、`feat-web-screens-actions`のtask計画前に、`eval-log/dev-graph-resync-required-20260922.json`に従いsystem-spec compile/evaluateとdev-graph compile/decomposeを実行する。
