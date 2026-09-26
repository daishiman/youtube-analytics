# 実装要件: feat-dashboard-redesign (ダッシュボード刷新)

- handoff target: `task-graph` (capability-build / task-graph build)
- graph snapshot: `.dev-graph/state/graph.json` revision 12 / `sha256:d9053e183bce9e373297d1903b47365bf948964f81fbdcee19d33b9c7ad7554a`
- package: `.dev-graph/published/feature-package-feat-dashboard-redesign-r2` / validated digest `sha256:8753a49bb769c2bee8d85a0f15d801e6f97b49ed86837558895cbe090f08ab1d`
- 本文書は実装コードを含まない。実装は下記 13 task spec を正本として task-graph build が行う。

## 1. 目的と範囲

- 目的: ダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が『今週、何が効いたか』と次に打つ手をすぐ判断できるようにする
- 範囲 (in):
  - ダッシュボード UI の刷新(web/pages/DashboardPage.tsx の仮画面を置換): ヘッダ(パンくず・『データ収集: 毎日 3:00(Cloudflare Cron) 最終成功 日付』・CSV取込ボタンは編集者以上のみ・アバター)と既存インディゴ/マゼンタ配色
  - 期間は全画面共通の AppShell ヘッダーの切替に統一し(qa-099)、ヘッダーの PERIODS に 7日を加えて 7d/28d/90d/1y/custom(?period= 省略時は28日・任意は最大365日)とする。ダッシュボードは ?period= を読むだけでページ内の期間タブは置かない。前期(直前の同日数)と比較し、対象(scope/video_ids)はダッシュボード固有の URL クエリで保持して期間を切り替えても保つ(期間リンクは既存クエリを保持して period だけ差し替える)
  - 対象セレクタ: チャンネル全体(既定)/動画を選ぶ(公開日の新しい順に直近10本を既定選択・外す/追加/入れ替え可・上限なし、qa-096)。動画選択時は KPI と推移をその動画群の合計にし、推移に動画ごとの線を重ねる
  - 問い『今週、何が効きましたか?』と KPI 4枚(値・推移線・前期比を記号と色で二重表現・出典バッジ・M1 開示文)
  - 日次推移グラフ(ECharts 遅延読込・今期実線/前期点線/公開日マーカー・文字要約と表切替)
  - 動画別の実績: 直近公開10本を既定表示・視聴回数順への並べ替え・行押下で動画詳細へ遷移・『表/構成比』切替(動画別上位+その他/切り口別/Shorts・長尺/新作・過去作と上位3本の占有率)
  - 最新AI分析カード(題名・版・結論・発見3つ・『レポートを開く』)と実施中/効果測定中の改善アクションカード(指標の基準値→最新値・期間・…メニューは編集者以上)
  - 『詳しく見る』区画: ファネル(旧ダッシュボード先頭4ブロックの週次売上ファネル一式を移設し判定ロジックは維持)/切り口別/視聴者の形/Shorts/データ品質
  - 空状態5種(未連携・未収集・CSV未取込・レポート0件・アクション0件)と区画ごとの読込中・エラー表示(1区画の失敗で全画面を落とさない)
  - 読み取り専用の集約 API GET /api/dashboard?period=7d|28d|90d|1y|custom&from&to&scope=channel|videos&video_ids=(全画面共通の ?period= をそのまま受け、省略時 28d・custom は from/to 必須で最大365日、qa-099): KPI・推移のグラフ仕様 JSON・動画別の実績・構成比・最新AI分析要約・改善アクション・最終収集時刻・空状態フラグを daily_metrics/video_metrics/reports/actions から tenant_id で絞って返す。入力検証失敗は 400。video_ids は件数上限なしのため JSON 配列1個を json_each で展開して1パラメータでバインドする(D1 bound parameters 最大100)
  - 週次売上ファネルの分離 API GET /api/dashboard/funnel?week= (既存の actual/target/target_gap・判定保留・改善候補ロジックを移設)
  - サムネイル配信 GET /api/media/thumbnails/:video_id: Data API の snippet.thumbnails から R2(media_assets, fetched_at・source_url 列を追加)へ保存したものを、テナント所属を確かめて自サイトから配る(Cache-Control: private)。未保存時は代替表示(qa-095)。取り直しは収集とは別の thumbnail 通(1通15件・1日最大3通、URL 変化と fetched_at 25日超を古い順)で行い、30日超は Cron 役割①で R2 と行を削除する(YouTube API Developer Policies III.E.4、Workers Free subrequest 50)。取り直しは fetched_at 無し→URL 変化→fetched_at の古い順。1,100本超のテナントは公開日の新しい順に1,000本だけを保存対象にする。Cron 役割①の削除はテナントごとに R2 delete() 1回へまとめ、1実行12テナントまで(qa-098)
  - セキュリティ: テナント境界(他テナントや存在しない video_ids は黙って除外し自テナント分だけで 200、qa-097)・閲覧者は読むだけ(書込系はサーバで編集者以上を強制)・AI要約と動画タイトルはテキスト描画のみ・CSP は img-src 'self' data: のまま変えない(qa-095)・集約応答は Cache-Control: private, no-store
  - アクセシビリティとレスポンシブ(360px 横スクロールなし・タップ領域44pt 以上・グラフの文字要約と表切替)と Playwright 3サイズ(390×844・820×1180・1440×900) E2E
- 範囲外 (out):
  - YouTube データの収集処理と収集時刻の変更(feat-youtube-daily-collection。確定済みの毎日 JST 3:00 のまま)
  - Studio CSV・週次事業 CSV の取込処理(feat-csv-media-ingest。ダッシュボードは取込ボタンから既存の取込画面へ遷移するだけ)
  - AI 分析レポートの生成とアップロード(feat-skill-analysis-reports)
  - 動画画面・AI分析画面・改善アクション画面・設定画面の本体と actions の状態遷移 API(feat-web-screens-actions)
  - 画像のティール配色(qa-091 で既存インディゴ/マゼンタを維持と確定)
  - YouTube の画像ホスト(i.ytimg.com)からの直接表示と CSP の拡張(qa-095 で自サイト経由と確定)

## 2. 受入要件 (feature acceptance → task 写像)

| # | 受入要件 | 検証 task |
|---|---|---|
| AC1 | ダッシュボードが docs/screens/02-dashboard.png と同じ区画の並びで、既存のインディゴ/マゼンタ配色のまま表示される | P02,P05,P07 |
| AC2 | 共通ヘッダーの期間は 7日/28日/90日/1年/任意 の5つで ?period= 省略時は28日になり、切り替えると KPI・推移・前期比がすべて同じ期間で再計算され、対象の選択は保たれる。許可外の period、任意期間の366日以上、from>to は 400 になる(qa-099) | P02,P04,P05,P07 |
| AC3 | 対象セレクタで『動画を選ぶ』を選ぶと公開日の新しい順に直近10本が既定で選ばれ、外す・追加・入れ替えができ、11本以上も選べる(上限なし)。KPI と推移はその動画群の合計になり、推移に動画ごとの線が重なる | P04,P05,P07 |
| AC4 | 動画別の実績は直近公開10本を既定表示し、視聴回数順へ並べ替えられ、『構成比』に切り替えると動画別上位+その他・切り口別・Shorts/長尺・新作/過去作の内訳と上位3本の占有率が出る | P04,P05,P07 |
| AC5 | KPI カードに出典バッジと M1 開示文が常に出て、前期比の上下が記号と色の両方で表される | P04,P05,P07 |
| AC6 | 『詳しく見る』のファネルを開いたときだけ GET /api/dashboard/funnel が呼ばれ、actual/target/target_gap または判定保留理由と改善候補(非因果)が従来どおり表示される | P04,P05,P07 |
| AC7 | 未連携・未収集・CSV未取込・レポート0件・アクション0件の各状態で、対応する空状態の文言と次の一手が出る | P04,P05,P07 |
| AC8 | 閲覧者には CSV取込ボタンとアクションの…メニューが出ず、書込系 API は 403 を返す。他テナントや存在しない video_ids を渡すと黙って除外され、自テナント分だけの集計で 200 が返る(存在の有無を応答で区別しない) | P03,P04,P09 |
| AC9 | GET /api/dashboard の応答に Cache-Control: private, no-store が付き、CSP の img-src は 'self' data: のまま変わらず、サムネイルは GET /api/media/thumbnails/:video_id から自サイト経由で表示され、他テナントの video_id では取得できない | P03,P04,P09 |
| AC10 | 360px 幅で横スクロールが出ず、Playwright 390×844・820×1180・1440×900 の3サイズで主要操作の E2E が通る | P04,P06,P08 |
| AC11 | video_ids を101本以上指定しても GET /api/dashboard が 200 を返す(json_each で単一バインドし、D1 の bound parameters 上限100に当たらない) | P04,P09 |
| AC12 | thumbnail 通1通の subrequest が50件以内に収まり、URL が変わった動画と fetched_at が25日を超えた動画が古い順に取り直され、30日を超えたサムネイルは Cron 役割①で R2 と media_assets から削除されて代替表示になる | P04,P05,P12 |
| AC13 | 動画が1,100本を超えるテナントでは公開日の新しい順に1,000本だけがサムネイル保存の対象になり、それより古い動画は取得されず代替表示になる | P04,P05,P12 |

## 3. 実行 task (exact 13・前向き DAG)

P01 要件 → P02 設計 → P03 設計レビュー → P04 テスト先行 → P05 実装 → P06 リファクタ → P07 受入 → P08 migration/dry-run → P09 QA → P10 最終レビュー → {P11 証跡索引, P12 runbook} → P13 本番反映。

各 task spec: `.dev-graph/published/feature-package-feat-dashboard-redesign-r2/task-specs/`。graph 投影: `tasks/feat-dashboard-redesign/sys-dbr-p01.md` 〜 `p13.md`。

## 4. 出典 (system-spec lineage)

`system-spec/00-requirements-definition.md`, `ui-ux.md`, `frontend.md`, `backend.md`, `security.md`, `database.md`, `infrastructure.md`, `index.md` (qa-089〜qa-099)、`specs/youtube-analytics-system.md`、`architecture/youtube-analytics-system.md`、`docs/screens/02-dashboard.png`。

## 5. Readiness matrix

| gate | 結果 | 証跡 |
|---|---|---|
| C11 validate-graph-schema | valid / implementation_readiness complete / violations 0 / missing_sections 0 | graph rev 12 |
| C02 saved state | feature + SYS-DBR-P01..P13 が全て confirmed / pass / complete | graph rev 12 |
| validate-system-plan (published r2) | pass、P01..P13 exact 13、violations 0 | `eval-log/validation-sdp-feat-dashboard-redesign-r2.json` |

missing_sections: なし。前回 (rev 10) の blocker「task md 13件の欠落」は解消済み。

## 6. 保留 (handoff は止めない)

- P13 本番反映 (Queue 作成・remote D1 migration・deploy) は利用者の明示の指示まで実行しない (`docs/feat-dashboard-redesign/runbook.md` 3 節)。
- thumbnail 通の送信元は feat-youtube-daily-collection 側で接続する。
