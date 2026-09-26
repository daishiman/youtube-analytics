# 旧機能の C14 再分解に向けた境界監査（2026-09-25）

AI分析画面の実装レビューとは別に、現行 spec から生成された旧 feature の担当範囲を照合した。成果物と既存の Beads ID は変更していない。

| 境界 | 現状の矛盾 | 再分解時に必要な担当の整理 |
|---|---|---|
| 取込 | `feat-csv-media-ingest.md` の scope_in は `POST /api/imports` の原本受付を含み、scope_out は同じ `POST /api/imports` を設定機能へ割り当てている | 設定機能が HTTP 受付・履歴表示を持ち、CSV機能が受付後の解析・正規化・保存と `imports.import_id` への結果反映を持つ。`POST /api/csv` を残すなら同じ取込処理に接続する |
| レポート | `feat-skill-analysis-reports.md` はレポート閲覧画面を `feat-web-screens-actions` に割り当てるが、`feat-ai-analysis-screen` はレポート詳細・版比較を含む | スキル機能はレポート生成・保存・履歴 export、AI分析機能は閲覧・版比較・選択アクション登録、Web画面機能は改善アクション一覧・進捗画面を持つ |
| Web画面 | `feat-web-screens-actions.md` の scope_in はログインとAI分析を含み、scope_out はAI分析を別機能へ割り当てる。受入の「設定を除く5画面」も担当外を含む | Web画面機能の本体はダッシュボード・動画・改善アクションの3画面。ログインは `feat-login-redesign`、AI分析は `feat-ai-analysis-screen` に置く |
| 設定画面 | `feat-settings-channel-link.md` の scope_out はAI分析の中身を `feat-web-screens-actions` に割り当てる | ダッシュボード・動画・改善アクションはWeb画面機能、AI分析はAI分析機能へ分ける |

## 正式フローの試行

インストール済み `dev-graph 0.1.11` と `system-dev-planner 0.1.11` の manifest は Claude Code 2.1.62 の `plugin validate` で未対応の `dependencies` キーにより失敗した。プラグイン本体は変更せず、一時コピーの manifest からこのキーだけを外して両プラグインの validation を通した。

現作業ツリーのスナップショットを一時 Git リポジトリに隔離し、`/dev-graph decompose --dry-run` を旧3機能に対して実行した。結果は「3 feature とも境界が整合しており再分解不要」だった。しかし上表の同一 feature 内の scope_in/scope_out 矛盾を検出していないため、この出力を内容検査の PASS として採用しない。スナップショットの `git status` は空で、元の作業ツリーと graph、Beads、GitHub、Projects への書き込みはない。

同じ隔離環境で4件の矛盾を明示して再試行すると、4件すべての修正案が出た。この案は `context.json` を中心にしており、対応する feature Markdown と state graph の同時更新を列挙していない。また「公開済み package は source digest だけの更新でよい」とする箇所があるが、SAR と設定機能の task spec 本文にも古い担当先がある。両 package の task spec に対する検索でも複数ファイルが該当した。したがって再試行の結果も登録完了の根拠には使わず、修正案を正式生成時の入力として扱う。

さらに隔離コピーで登録を試し、実行予算の上限後に同じセッションを再開した。4機能の Markdown/context と SAR・設定機能の task 本文までは部分更新されたが、後者は正規 planner の再生成ではなく置換スクリプトによる変更だった。graph を直接変更しようとする操作は権限検査で拒否され、state graph と package manifest の正規登録は未完了のまま再度実行予算の上限に達した。この部分差分は元の作業ツリーへ移していない。

## 引き継ぎ条件

1. 正本の取込境界を明示し、旧3機能と設定機能を対象に、上表4点を入力に指定した C14 の生成差分を確認する。
2. feature Markdown、context、state graph、source lineage を C02 の単一 writer で揃える。digest だけを手作業で現在値に変えない。
3. `feat-skill-analysis-reports` と `feat-settings-channel-link` の公開済み13タスクにも旧担当先が複製されている。source feature digest を再評価し、必要な package を planner から再生成して既存 task/Beads ID を再利用する。CSV・Web画面機能の package は未作成。
4. 生成後、scope の単一所有、DAG、既存リンクの重複なし、graph schema、`pnpm check:repo` を再確認してから C14 ゲートを閉じる。

この監査は不一致を特定したもので、正式な再分解・再登録を完了した証跡ではない。

## 現行ツールで再登録できない理由

`dev-graph 0.1.11` に、既存 feature の Markdown/context/state graph/source lineage を一括更新する独立 CLI はない。C02 の `register-package.py` は exact-13 task の新規登録を扱い、既存13 IDの内容が変わると `duplicate node ids exist with different content` で止まる。`system-dev-planner 0.1.11` の C11 は世代別の公開先へ新 package を昇格できるが、同じ公開先の上書きは受け付けない。現行 context の SHA-256 と公開 package の feature pin は、SAR が `ae76e176…` 対 `0e193dc8…`、設定機能が `65926918…` 対 `7012b9ad…` で既にずれている。両者とも登録済み task node は13件あり、旧 package の再利用も検査で拒否される。

正式完了には、C14/C02 側の既存 feature 一括更新と、C02 側の旧 receipt を保持したままの13 task原子的世代交代が必要になる。Beads 側では既存 ID の再利用に加え、説明文と必要なら依存辺を同期する経路も確認する。これらは共有開発プラグインの機能追加に当たるため、本ワークツリーの生成物を手で置換してゲートを閉じる代用にはしない。

共有プラグインを改修する場合の受入は、(1) 4 feature の Markdown/context/state graph を旧版照合つきで一括更新、(2) 新 package を世代別に公開し旧 package/receipt を保存、(3) 既存13 task IDを保った検証つき一括差替え、(4) 同じ入力の再実行で増分0、競合・途中失敗で旧世代を維持、(5) Beads に重複 issue を作らず説明と依存を照合、の5点とする。プラグインのソースは別リポジトリ `harness-dev` にあり、この作業ツリーのローカル修正だけでは受入に達しない。

2026-09-25、利用者は今回の作業をこのワークツリーの監査までとすることを選択した。共有プラグインの改修、生成物の部分置換、正式再同期ゲートの完了処理は今回の対象外とする。
