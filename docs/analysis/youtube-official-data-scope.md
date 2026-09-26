# YouTube 提供データの広域カバレッジ契約

更新日: 2026-09-25。対象は、認可されたチャンネルで YouTube が公式に提供する分析データと、利用者が YouTube Studio から書き出した CSV。実装済み範囲の監査は [`data-coverage-audit.md`](../feat-dashboard-redesign/data-coverage-audit.md) を参照する。本書は実装完了を意味しない。

## 「全て」の定義

「全て」は **そのアカウントの権限で取得可能な、分析に関係するレポート・項目を発見し、取得・未取得・取得不能の状態を漏れなく説明できること** と定義する。権限がない Content Owner 専用レポート、YouTube が匿名化・非公開にした値、提供していない組み合わせまで数値を保証しない。トップ画面に全列を並べることも要件にしない。

| 取得元 | 扱う範囲と粒度 | 発見・制約 |
|---|---|---|
| [YouTube Data API](https://developers.google.com/youtube/v3/docs) | チャンネル、動画、プレイリスト等の属性と、取得時点の累積統計。動画ごとの現在値は [`videos.list`](https://developers.google.com/youtube/v3/docs/videos/list) または [`videos.batchGetStats`](https://developers.google.com/youtube/v3/docs/videos/batchGetStats)。 | `part` と所有者権限で取得項目が変わる。[日次クォータ](https://developers.google.com/youtube/v3/determine_quota_cost)内で更新する。`channels.statistics.subscriberCount` は概数であり、日次登録増減とは別の値。 |
| [YouTube Analytics API](https://developers.google.com/youtube/analytics/channel_reports) | チャンネル・動画・プレイリストの再生、エンゲージメント、登録増減、流入、地域、端末、視聴者属性、維持、ライブ、条件を満たす収益など。日・月・動画・各次元の組み合わせ。 | [指標](https://developers.google.com/youtube/analytics/metrics)と[次元](https://developers.google.com/youtube/analytics/dimensions)を公式の対応表で管理する。任意の組み合わせは不可。[複数動画フィルタは最大500 ID、維持曲線は1動画ずつ](https://developers.google.com/youtube/analytics/reference/reports/query)。 |
| [YouTube Reporting API](https://developers.google.com/youtube/reporting/v1/reports/full_report_list) | 日次の一括 CSV。基本統計、流入、視聴場所、端末、属性、カード、終了画面、プレイリスト、[サムネイル表示数・CTR](https://developers.google.com/youtube/reporting/v1/reports/channel_reports)など。権限によって Content Owner 用レポートもある。 | 認可主体ごとに [`reportTypes.list`](https://developers.google.com/youtube/reporting/v1/reference/rest/v1/reportTypes/list) をページングして利用可能な種別を発見する。固定のレポート一覧だけで「全て」と判断しない。レポートは版ごとに別契約とする。 |
| [YouTube Studio 詳細モード CSV](https://support.google.com/youtube/answer/9717005?hl=en) | 利用者が選択した期間・次元・指標のエクスポート。チャンネルまたは動画単位。 | 固定スキーマではない。アップロードごとにヘッダ、期間、単位、元画面条件を記録する。書き出しは最大500行で、超過分には Reporting API を使う。 |

## 取得と表示の共通契約

各データ系列は最低限 `source / reportType / version / dimensions / metric / grain / unit / channelId / videoId（該当時） / period / sourceTimeZone / observedAt / importedAt / provenance / availability` を持つ。原本または API 応答への参照、権限の種類、取得ジョブ ID、CSV のヘッダ・ファイル識別子も追跡する。同名の指標でも取得元や粒度が違えば無条件で足し合わせない。日付はレポート元の区切りを保存し、JST 表示への変換を明示する。[Reporting API の日次レポートは PST（UTC-8）の24時間](https://developers.google.com/youtube/reporting/v1/reports)を対象とする。

項目の状態は `未発見 / 利用可能・未取込 / 取込待ち / 取得済み / 更新遅延 / 取得失敗 / 権限不足 / 対象外 / 提供元で非公開・匿名化` のいずれかとし、数値の `0` と欠測を区別する。画面は最終取得日と対象期間を表示し、ステータスを「収集済み」と誤認させない。

Reporting CSV は[公式の取込指針](https://developers.google.com/youtube/reporting/v1/reports)に従いヘッダから列位置を特定する。新しい列を黙って破棄せず、原本に保持して「未マッピング」として登録する。同じ対象期間の差替レポートは新しい `createTime` を優先し、再取込は冪等にする。Studio CSV もヘッダで列を認識し、未知列は同じ扱いとする。指標の単位や意味を確認するまで、未知列を既存 KPI に自動加算しない。

## 正確性の境界

- [Analytics API は通常48～72時間遅延](https://developers.google.com/youtube/analytics/data_model)し、指定した終期より前でも、同一クエリの全指標が揃った最終日までしか返さない。現在値と確定した日次推移は別系列にする。
- [Reporting API](https://developers.google.com/youtube/reporting/v1/reports)はジョブ作成後に日次生成され、初回取得まで時間がかかる。通常レポートの取得可能期間は生成後60日、履歴レポートは30日。初回履歴の範囲や差替版も記録する。
- 収益・広告指標には[追加の monetary OAuth スコープと YouTube パートナープログラム資格](https://developers.google.com/youtube/analytics/channel_reports)が必要で、満たさないチャンネルでは表示しない。Content Owner 専用の資産・権利・確定収益レポートも権限がある場合のみ対象とする。
- [匿名化、少数値の制限、削除動画](https://developers.google.com/youtube/analytics/data_model)により、チャンネル合計と動画別行の合計は一致しない場合がある。差分を自動補正せず、元レポートの合計と内訳をそれぞれ保持する。
- [Data API の動画 `viewCount` の定義は2026-08-24に変更](https://developers.google.com/youtube/v3/docs/videos)された。現在の累積値から過去日次値を逆算しない。

## 画面での到達点

トップのダッシュボードはチャンネル全体と選択動画の主要 KPI、推移、構成比、データ鮮度を要約する。動画詳細は1本の推移・維持曲線・流入等を表示する。分析詳細はレポート種別、次元、指標、期間を選んで比較できるようにする。全取得項目はデータ一覧で検索・絞り込み・原本まで追跡できるようにする。未取得や利用不能の項目もカバレッジ一覧で確認できるようにし、利用可能な項目が増えた際には発見結果と未マッピング列を見直す。
