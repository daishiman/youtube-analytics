# ダッシュボードのデータ網羅性監査

更新日: 2026-09-26。対象はこのワークツリーの実装。YouTube が提供する広い範囲は [youtube-official-data-scope.md](../analysis/youtube-official-data-scope.md) を契約とし、発見・取得・保存・画面反映を別々に判定する。

**結論: 全項目の画面反映は未完了。** チャンネルと動画の日次基本指標、週次事業CSVは数値を保存してダッシュボードへ接続した。Analytics の流入元・端末・国別集計は原値を別系列で閲覧できる。Reporting API は利用可能な種類を発見し、原本CSVの列名・期間・行数とダウンロードを提供する。公式リーチ基本レポートの動画別CTRは、実CSVで数値の単位を確認できるまで原値として表示する。Studio CSV は既知列だけを正規化し、未知列・未解決行・期間未確定を区別して、原本の全列・全行も設定画面で閲覧できる。出典や粒度が異なる値を KPI に自動加算しない。

[実サンプル](../analysis/studio-csv-sample-audit-20260925.md)のStudio「合計.csv」は日次2列で露出・CTRを含まず、現行の取込も両値を生成しない。週次ファネルの5原因指標は実サンプルだけでは揃わないため、該当段は判定保留とし、欠けた入力を推測しない。

| データ群 | 取得・保存 | 画面で確認できること | 未完了 |
|---|---|---|---|
| Data API チャンネル・動画 | 連携時のチャンネル情報、uploads 全ページの動画ID、動画タイトル・公開日時・長さ・ライブ判定根拠・サムネイルを取得。短尺を Shorts と確定できないときは `unknown` | チャンネル連携、動画選択・形式別の構成比・動画表・サムネイル | Data API が提供するその他の動画属性・累積統計、削除/非公開動画の網羅、実チャンネル検証 |
| Analytics API チャンネル日次 | 太平洋時間の直近35日を再取得し、視聴回数・視聴分・登録増減を保存。未返却日は0埋めしない | チャンネル全体KPI・前期比・推移 | 実チャンネルの鮮度確認 |
| Analytics API 多次元 | 流入元/日・端末/日・国/期間の3種類を列順と原値のまま保存。空・権限不足・0を区別 | 詳細欄で100行ずつページ閲覧 | 視聴者属性・維持・収益などの他のレポート、動画別の多次元分析、利用不能理由の網羅 |
| Analytics API 動画日次 | uploads の各動画に対して日次の視聴回数・視聴分・平均視聴率を保存。全ページ成功後だけ収集日時を更新 | 1本/複数動画のKPI・推移、動画表。選択した動画とチャンネル全体を分離 | 維持曲線、流入、動画別登録増減など。動画メタデータの形式判定は Studio 側との照合が必要 |
| Reporting API | 権限で利用可能な非 system managed 種類のジョブを作り、日次CSVをR2に原本保存。ページ継続・後発版置換・削除世代ガードあり。`channel_reach_basic_a1` の5列だけ日次リーチ表へ原子的に反映 | 利用可能な種類を検索。原本の種類・版・期間・全ヘッダー・行数を確認しCSVを取得。反映状態と動画別CTRの原値を表示 | その他のレポート列の正規化。CTRの実CSV値の単位検証、収益系の追加OAuth権限、Content Owner 権限、実チャンネル検証 |
| Studio 詳細モードCSV | 任意CSVをR2保存。実CSV6ファイルで確認した3形式をヘッダーで判定し、日次の視聴回数/エンゲージビューを列別の出典付きで保存。表データの長さ（秒）と平均視聴時間（時分秒）も秒へ正規化。未知列と未解決行は区別 | 設定画面で全列・全行の原本と列対応を閲覧。別CSVの同一動画・日付を統合しても未提供列を保持 | 表データの集計期間はCSV本文にない。Reporting未提供時のCTRは期間が確定し選択期間と一致するStudio値だけを使えるため、現行の表CSVでは保留する。グラフは5本だけで全動画ではない。正式M1・M2〜M10への期間を揃えた接続、公開環境での実アップロード確認 |
| 週次事業CSV | `business-funnel-weekly.csv` の列・整数・週・連携チャンネルを検証し、全行を原子的に `business_funnel_weekly` へ反映 | 週次売上ファネル・履歴の反映週数と期間 | 実ファイルによる運用確認。YouTube側の原因指標が揃わない週は判定保留 |
| AIレポート・改善アクション | 既存DBの読取側 | 最新レポート・実施中アクションの要約 | 実データでの作成/更新フローと専用動画分析画面 |

ローカルの初期値は `scripts/seed-local.sql` による開発用データであり、Google の実収集が成功した証拠ではない。Analytics API は通常48〜72時間の遅延がある。ダッシュボードの固定期間は現行チャンネルの基本日次 all 系列で視聴回数がある最新日を末日とし、JSTの昨日を上限にする（データなしはJSTの昨日、任意期間は指定日のまま）。API日次の太平洋時間と事業CSVのJST週境界は無条件に合算しない。KPIの合計と週次ファネルの登録者の増減は all 系列だけを数え、他の系列の行が同じ日にあっても二重に数えない。例外として、週次ファネルの「登録者の増減（参考）」は太平洋時間の日付のままJSTの週に入れた参考値で、週の境目が16〜17時間ずれることを画面に注記している（利用者の決定 qa-112）。[公式データモデル](https://developers.google.com/youtube/analytics/data_model)。

## API取得の優先監査

「取得処理がある」「保存された」「画面に反映された」「実チャンネルで成功した」は別々に判定する。現時点で実チャンネルのAPI応答・権限・行数を検証していないため、下表の実装済み系列も本番での取得成功を保証しない。

| 優先度 | 判断に必要なデータ | 現状と不足 |
|---|---|---|
| 高 | 動画別の日次視聴・再生時間・登録効果・反応 | 日次の視聴回数、再生時間、平均視聴率だけを取得。`engagedViews`、平均視聴時間、動画別登録増減、likes/comments/shares は未取得。動画起点の登録増減をチャンネル合計へ足さない。[Analytics指標](https://developers.google.com/youtube/analytics/metrics) |
| 高 | 1本の維持曲線と離脱点 | `elapsedVideoTimeRatio` と維持・視聴開始/停止指標は未取得。公式APIは1回に1動画のフィルタを要求する。[チャンネルレポート](https://developers.google.com/youtube/analytics/channel_reports)、[クエリ制約](https://developers.google.com/youtube/analytics/reference/reports/query) |
| 高 | 露出から視聴への変換 | Reporting の `channel_reach_basic_a1` 原本と動画別インプレッション/CTR原値は保存。実CSVでCTRの数値表現を確認できず、インプレッションは主画面へ未反映。流入元・端末を含むリーチ複合レポートは原本だけ。[Reportingレポート](https://developers.google.com/youtube/reporting/v1/reports/channel_reports) |
| 中 | なぜ見られたか・誰が見たか | 流入元の種類、端末、国はチャンネル系列の原値を保存。動画別の内訳、流入元詳細、再生場所、OS、登録状況、年齢/性別は未取得。年齢/性別の `viewerPercentage` はユニーク視聴者数ではない。[Analyticsレポート](https://developers.google.com/youtube/analytics/channel_reports) |
| 中 | 動画内容と公開状態 | Data API ではタイトル、公開日時、長さ、ライブ判定根拠、サムネイルを保存。description/tags/category/privacy、動画の累積 statistics、コメント本文や字幕本文は未取得。[videos.list](https://developers.google.com/youtube/v3/docs/videos/list) |
| 条件付き | プレイリスト、ライブ、メンバーシップ、収益、Content Owner | 対象チャンネルの機能・資格・OAuth権限に応じて取得する。収益には追加の `yt-analytics-monetary.readonly` 同意が必要。現在の基本スコープと通常のチャンネル連携だけでは全項目を保証できない。[Analytics権限](https://developers.google.com/youtube/analytics/reference)、[Reporting対応範囲](https://developers.google.com/youtube/reporting) |

優先度は「次の動画改善を判断できるか」で付けた。Data API が返せる全属性を無条件に主画面へ並べる意味ではない。Analytics の指標・次元は任意に組み合わせられず、動画フィルタは最大500 ID、維持曲線は1本ずつ取得する。[公式クエリ仕様](https://developers.google.com/youtube/analytics/reference/reports/query)。

## 残る受入条件

1. 公式の Analytics レポート組み合わせをさらに列挙し、属性・維持・収益などを権限別に収集する。取得不能/匿名化も状態として表示する。
2. Reporting のリーチ以外と Studio CSV の残る列をヘッダー・単位・粒度で正規化し、正式M1〜M10と動画詳細へ接続する。
3. 実チャンネルと公開環境で初回連携・再収集・差替・欠測・権限不足・大容量を確認する。Studio CSV の実サンプル6ファイルの形式は[監査記録](../analysis/studio-csv-sample-audit-20260925.md)で確認したが、表データの期間は原本にない。Reporting CSV は実サンプルがなくCTRの数値表現は未確定。
4. テナント/動画数の増加に対する Data API・Analytics API・Queue（継続通の数を含む）・D1（書込行数）の日次使用量を計測し、上限前にバックオフする。

現在の4条件判定: **矛盾なし PASS、整合性あり PASS、依存関係整合 PASS、広域の漏れなし FAIL**。最後の条件は上記の未収集・未正規化が解消されるまで PASS にしない。画像準拠ダッシュボードの限定範囲の PASS は、YouTube 提供全項目の網羅性を意味しない。
