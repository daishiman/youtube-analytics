---
acceptance: ["ダッシュボードが docs/screens/02-dashboard.png と同じ区画の並びで、既存のインディゴ/マゼンタ配色のまま表示される", "共通ヘッダーの期間は 7日/28日/90日/1年/任意 の5つで ?period= 省略時は28日になり、切り替えると KPI・推移・前期比がすべて同じ期間で再計算され、対象の選択は保たれる。許可外の period、任意期間の366日以上、from>to は 400 になる(qa-099)", "対象セレクタで『動画を選ぶ』を選ぶと公開日の新しい順に直近10本が既定で選ばれ、外す・追加・入れ替えができ、11本以上も選べる(上限なし)。KPI と推移はその動画群の合計になり、推移に動画ごとの線が重なる", "動画別の実績は直近公開10本を既定表示し、視聴回数順へ並べ替えられ、『構成比』に切り替えると動画別上位+その他・切り口別・Shorts/長尺・新作/過去作の内訳と上位3本の占有率が出る", "KPI カードに出典バッジと M1 開示文が常に出て、前期比の上下が記号と色の両方で表される", "『詳しく見る』のファネルを開いたときだけ GET /api/dashboard/funnel が呼ばれ、actual/target/target_gap または判定保留理由と改善候補(非因果)が従来どおり表示される", "未連携・未収集・CSV未取込・レポート0件・アクション0件の各状態で、対応する空状態の文言と次の一手が出る", "閲覧者には CSV取込ボタンが出ない。アクション編集メニューは後続 feature の依存で現在はどの役割にも出さず、書込系 API は権限外を 403 とする。他テナントや存在しない video_ids を渡すと黙って除外され、自テナント分だけの集計で 200 が返る(存在の有無を応答で区別しない)", "GET /api/dashboard の応答に Cache-Control: private, no-store が付き、CSP の img-src は 'self' data: のまま変わらず、サムネイルは GET /api/media/thumbnails/:video_id から自サイト経由で表示され、他テナントの video_id では取得できない", "360px 幅で横スクロールが出ず、Playwright 390×844・820×1180・1440×900 の3サイズで主要操作の E2E が通る", "video_ids を101本以上指定しても GET /api/dashboard が 200 を返す(json_each で単一バインドし、D1 の bound parameters 上限100に当たらない)", "thumbnail 通1通の subrequest が50件以内に収まり、URL が変わった動画と fetched_at が25日を超えた動画が古い順に取り直され、30日を超えたサムネイルは Cron 役割①で R2 と media_assets から削除されて代替表示になる", "動画が1,100本を超えるテナントでは公開日の新しい順に1,000本だけがサムネイル保存の対象になり、それより古い動画は取得されず代替表示になる"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "candidate_path": "features/feat-dashboard-redesign.md", "confidence": 0.95}, {"artifact_kind": "issue", "candidate_path": "issues/feat-dashboard-redesign.md", "confidence": 0.2}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様(qa-089〜qa-098、completeness r8 PASS)から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:dev-graph-integrity-auditor", "evidence_ref": "eval-log/dev-graph-decompose-audit-20260924-r2.json", "evaluated_digest": "5c3104c48ffc4054a64f720fe7ecb9af21e7a204418cfd0d078db9283d30d4e7"}
confirmation_status: "confirmed"
created_at: "2026-09-24T10:16:21Z"
depends_on: ["feat-youtube-daily-collection", "feat-csv-media-ingest", "feat-skill-analysis-reports", "feat-web-screens-actions", "feat-login-redesign", "feat-settings-channel-link"]
domain: "youtube-analytics"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: null
file_path: "features/feat-dashboard-redesign.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "ダッシュボードが画像どおりの順(ヘッダ(共通ヘッダーの期間切替 ?period=)・対象セレクタ・問い・KPI 4枚・日次推移・動画別の実績と構成比・最新AI分析・実施中の改善アクション・詳しく見る)で、既存のインディゴ/マゼンタ配色のまま表示され、読み取り専用の集約 API GET /api/dashboard の1回取得で描かれ、チャンネル全体と選んだ動画(既定は公開日の新しい順に直近10本・外す/追加/入れ替え可・上限なし)を切り替えて比べられ、週次売上ファネル一式は『詳しく見る』から遅延取得で見られ、テナント境界・閲覧者の読み取り専用・自サイト経由のサムネイル配信(CSP は変えない)・キャッシュ禁止で守られた状態が main への push で自動デプロイされる"
graph_node_id: "feat-dashboard-redesign"
implementation_readiness: {"checked_at": "2026-09-24T10:16:21Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "ダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が選択期間の変化を見て次に打つ手を判断できるようにする"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["ダッシュボード UI の刷新(web/pages/DashboardPage.tsx の仮画面を置換): ヘッダ(パンくず・基本日次の収集状態・基本日次収集の最終成功時刻（Cron は毎日 JST 3:00）・CSV取込ボタンは編集者以上のみ・アバター)と既存インディゴ/マゼンタ配色", "期間は全画面共通の AppShell ヘッダーの切替に統一し(qa-099)、ヘッダーの PERIODS に 7日を加えて 7d/28d/90d/1y/custom(?period= 省略時は28日・任意は最大365日)とする。ダッシュボードは ?period= を読むだけでページ内の期間タブは置かない。固定期間の末日は基本日次(all系列・視聴回数あり)の最新収集済み日(JST昨日を上限・データなしはJST昨日)に置き、任意期間は指定日を維持する。Analytics日次の太平洋時間と事業CSVのJST週は混ぜない。前期(直前の同日数)と比較し、対象(scope/video_ids)はダッシュボード固有の URL クエリで保持して期間を切り替えても保つ(期間リンクは既存クエリを保持して period だけ差し替える)", "対象セレクタ: チャンネル全体(既定)/動画を選ぶ(公開日の新しい順に直近10本を既定選択・外す/追加/入れ替え可・上限なし、qa-096)。動画選択時は KPI と推移をその動画群の合計にし、推移に動画ごとの線を重ねる", "選択期間に応じた問いと KPI 4枚(値・推移線・前期比を記号と色で二重表現・出典バッジ・M1 開示文)", "この期間の判断(前期との変化・次に見る動画。日次欠測時は前期比較を保留し、動画候補は今期の値で判断)", "日次推移グラフ(ECharts 遅延読込・今期実線/前期点線/公開日マーカー・文字要約と表切替)", "動画別の実績: 直近公開10本を既定表示・視聴回数順への並べ替え・行押下で同じ期間の単一動画ダッシュボードへ絞る・『表/構成比』切替(動画別上位+その他/切り口別/Shorts・長尺/新作・過去作と上位3本の占有率)", "最新AI分析カード(題名・版・結論・発見3つ。詳細画面は準備中)と実施中/効果測定中の改善アクションカード(指標の基準値→最新値・期間。編集・状態更新は準備中)", "『詳しく見る』区画: 週次ファネル(旧ダッシュボード先頭4ブロックの判定ロジックを維持)/データ品質/収集済み原値/利用可能なレポート種別。構成比は動画別の実績に一本化", "空状態5種(未連携・未収集・CSV未取込・レポート0件・アクション0件)と読込中・エラー表示(集約API失敗は画面上部、独立API失敗は該当区画に表示)", "読み取り専用の集約 API GET /api/dashboard?period=7d|28d|90d|1y|custom&from&to&scope=channel|videos&video_ids=(全画面共通の ?period= をそのまま受け、省略時 28d・custom は from/to 必須で最大365日、qa-099): KPI・推移のグラフ仕様 JSON・動画別の実績・構成比・最新AI分析要約・改善アクション・基本日次収集の最終成功時刻・空状態フラグを daily_metrics/video_metrics/reports/actions から tenant_id で絞って返す。入力検証失敗は 400。video_ids は件数上限なしのため JSON 配列1個を json_each で展開して1パラメータでバインドする(D1 bound parameters 最大100)", "週次売上ファネルの分離 API GET /api/dashboard/funnel?week= (既存の actual/target/target_gap・判定保留・改善候補ロジックを移設)", "サムネイル配信 GET /api/media/thumbnails/:video_id: Data API の snippet.thumbnails から R2(media_assets, fetched_at・source_url 列を追加)へ保存したものを、テナント所属を確かめて自サイトから配る(Cache-Control: private)。未保存時は代替表示(qa-095)。取り直しは収集とは別の thumbnail 通(1通15件・1日最大3通、URL 変化と fetched_at 25日超を古い順)で行い、30日超は Cron 役割①で R2 と行を削除する(YouTube API Developer Policies III.E.4、Workers Free subrequest 50)。取り直しは fetched_at 無し→URL 変化→fetched_at の古い順。1,100本超のテナントは公開日の新しい順に1,000本だけを保存対象にする。Cron 役割①の削除はテナントごとに R2 delete() 1回へまとめ、1実行12テナントまで(qa-098)", "セキュリティ: テナント境界(他テナントや存在しない video_ids は黙って除外し自テナント分だけで 200、qa-097)・閲覧者は読むだけ(書込系はサーバで編集者以上を強制)・AI要約と動画タイトルはテキスト描画のみ・CSP は img-src 'self' data: のまま変えない(qa-095)・集約応答は Cache-Control: private, no-store", "アクセシビリティとレスポンシブ(360px 横スクロールなし・タップ領域44pt 以上・グラフの文字要約と表切替)と Playwright 3サイズ(390×844・820×1180・1440×900) E2E"]
scope_out: ["YouTube データの収集処理と収集時刻の変更(feat-youtube-daily-collection。確定済みの毎日 JST 3:00 のまま)", "Studio CSV・週次事業 CSV の取込処理(feat-csv-media-ingest。ダッシュボードは取込ボタンから既存の取込画面へ遷移するだけ)", "AI 分析レポートの生成とアップロード(feat-skill-analysis-reports)", "動画画面・AI分析画面・改善アクション画面・設定画面の本体と actions の状態遷移 API(feat-web-screens-actions)", "画像のティール配色(qa-091 で既存インディゴ/マゼンタを維持と確定)", "YouTube の画像ホスト(i.ytimg.com)からの直接表示と CSP の拡張(qa-095 で自サイト経由と確定)"]
source_lineage: {"imported_at": "2026-09-24T10:16:21Z", "origin_kind": "generated", "source_digest": "dc931acd91cef9dd74da3b457eea4442d702c2337c4dc3c12bf9ce5cc3bcf698", "source_path": "specs/youtube-analytics-system.md", "source_plugin": "dev-graph", "source_version": "1.0.0"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics", "dashboard"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "ダッシュボード刷新(今週、何が効きましたか?)"
tracker_binding: "beads"
updated_at: "2026-09-24T14:45:00Z"
---

# 目的

ダッシュボードを docs/screens/02-dashboard.png の構成どおりに刷新し、チャンネル全体と選んだ動画(既定は直近公開10本)それぞれの推移・前期比・構成比を1画面で比べられるようにして、利用者が選択期間の変化を見て次に打つ手を判断できるようにする(資するゴール: G1, G2, G4, G5)

## 到達状態

ダッシュボードが画像どおりの順(ヘッダ(共通ヘッダーの期間切替 ?period=)・対象セレクタ・問い・KPI 4枚・日次推移・動画別の実績と構成比・最新AI分析・実施中の改善アクション・詳しく見る)で、既存のインディゴ/マゼンタ配色のまま表示され、読み取り専用の集約 API GET /api/dashboard の1回取得で描かれ、チャンネル全体と選んだ動画(既定は公開日の新しい順に直近10本・外す/追加/入れ替え可・上限なし)を切り替えて比べられ、週次売上ファネル一式は『詳しく見る』から遅延取得で見られ、テナント境界・閲覧者の読み取り専用・自サイト経由のサムネイル配信(CSP は変えない)・キャッシュ禁止で守られた状態が main への push で自動デプロイされる

## スコープ

### 含む

- ダッシュボード UI の刷新(web/pages/DashboardPage.tsx の仮画面を置換): ヘッダ(パンくず・基本日次の収集状態・基本日次収集の最終成功時刻（Cron は毎日 JST 3:00）・CSV取込ボタンは編集者以上のみ・アバター)と既存インディゴ/マゼンタ配色
- 期間は全画面共通の AppShell ヘッダーの切替に統一し(qa-099)、ヘッダーの PERIODS に 7日を加えて 7d/28d/90d/1y/custom(?period= 省略時は28日・任意は最大365日)とする。ダッシュボードは ?period= を読むだけでページ内の期間タブは置かない。固定期間の末日は基本日次(all系列・視聴回数あり)の最新収集済み日(JST昨日を上限・データなしはJST昨日)に置き、任意期間は指定日を維持する。Analytics日次の太平洋時間と事業CSVのJST週は混ぜない。前期(直前の同日数)と比較し、対象(scope/video_ids)はダッシュボード固有の URL クエリで保持して期間を切り替えても保つ(期間リンクは既存クエリを保持して period だけ差し替える)
- 対象セレクタ: チャンネル全体(既定)/動画を選ぶ(公開日の新しい順に直近10本を既定選択・外す/追加/入れ替え可・上限なし、qa-096)。動画選択時は KPI と推移をその動画群の合計にし、推移に動画ごとの線を重ねる
- 選択期間に応じた問いと KPI 4枚(値・推移線・前期比を記号と色で二重表現・出典バッジ・M1 開示文)
- この期間の判断(前期との変化・次に見る動画。日次欠測時は前期比較を保留し、動画候補は今期の値で判断)
- 日次推移グラフ(ECharts 遅延読込・今期実線/前期点線/公開日マーカー・文字要約と表切替)
- 動画別の実績: 直近公開10本を既定表示・視聴回数順への並べ替え・行押下で同じ期間の単一動画ダッシュボードへ絞る・『表/構成比』切替(動画別上位+その他/切り口別/Shorts・長尺/新作・過去作と上位3本の占有率)
- 最新AI分析カード(題名・版・結論・発見3つ。詳細画面は準備中)と実施中/効果測定中の改善アクションカード(指標の基準値→最新値・期間。編集・状態更新は準備中)
- 『詳しく見る』区画: 週次ファネル(旧ダッシュボード先頭4ブロックの判定ロジックを維持)/データ品質/収集済み原値/利用可能なレポート種別。構成比は動画別の実績に一本化
- 空状態5種(未連携・未収集・CSV未取込・レポート0件・アクション0件)と読込中・エラー表示(集約API失敗は画面上部、独立API失敗は該当区画に表示)
- 読み取り専用の集約 API GET /api/dashboard?period=7d|28d|90d|1y|custom&from&to&scope=channel|videos&video_ids=(全画面共通の ?period= をそのまま受け、省略時 28d・custom は from/to 必須で最大365日、qa-099): KPI・推移のグラフ仕様 JSON・動画別の実績・構成比・最新AI分析要約・改善アクション・基本日次収集の最終成功時刻・空状態フラグを daily_metrics/video_metrics/reports/actions から tenant_id で絞って返す。入力検証失敗は 400。video_ids は件数上限なしのため JSON 配列1個を json_each で展開して1パラメータでバインドする(D1 bound parameters 最大100)
- 週次売上ファネルの分離 API GET /api/dashboard/funnel?week= (既存の actual/target/target_gap・判定保留・改善候補ロジックを移設)
- サムネイル配信 GET /api/media/thumbnails/:video_id: Data API の snippet.thumbnails から R2(media_assets, fetched_at・source_url 列を追加)へ保存したものを、テナント所属を確かめて自サイトから配る(Cache-Control: private)。未保存時は代替表示(qa-095)。取り直しは収集とは別の thumbnail 通(1通15件・1日最大3通、URL 変化と fetched_at 25日超を古い順)で行い、30日超は Cron 役割①で R2 と行を削除する(YouTube API Developer Policies III.E.4、Workers Free subrequest 50)。取り直しは fetched_at 無し→URL 変化→fetched_at の古い順。1,100本超のテナントは公開日の新しい順に1,000本だけを保存対象にする。Cron 役割①の削除はテナントごとに R2 delete() 1回へまとめ、1実行12テナントまで(qa-098)
- セキュリティ: テナント境界(他テナントや存在しない video_ids は黙って除外し自テナント分だけで 200、qa-097)・閲覧者は読むだけ(書込系はサーバで編集者以上を強制)・AI要約と動画タイトルはテキスト描画のみ・CSP は img-src 'self' data: のまま変えない(qa-095)・集約応答は Cache-Control: private, no-store
- アクセシビリティとレスポンシブ(360px 横スクロールなし・タップ領域44pt 以上・グラフの文字要約と表切替)と Playwright 3サイズ(390×844・820×1180・1440×900) E2E

### 含まない

- YouTube データの収集処理と収集時刻の変更(feat-youtube-daily-collection。確定済みの毎日 JST 3:00 のまま)
- Studio CSV・週次事業 CSV の取込処理(feat-csv-media-ingest。ダッシュボードは取込ボタンから既存の取込画面へ遷移するだけ)
- AI 分析レポートの生成とアップロード(feat-skill-analysis-reports)
- 動画画面・AI分析画面・改善アクション画面・設定画面の本体と actions の状態遷移 API(feat-web-screens-actions)
- 画像のティール配色(qa-091 で既存インディゴ/マゼンタを維持と確定)
- YouTube の画像ホスト(i.ytimg.com)からの直接表示と CSP の拡張(qa-095 で自サイト経由と確定)

## 受入

- ダッシュボードが docs/screens/02-dashboard.png と同じ区画の並びで、既存のインディゴ/マゼンタ配色のまま表示される
- 共通ヘッダーの期間は 7日/28日/90日/1年/任意 の5つで ?period= 省略時は28日になり、切り替えると KPI・推移・前期比がすべて同じ期間で再計算され、対象の選択は保たれる。許可外の period、任意期間の366日以上、from>to は 400 になる(qa-099)
- 対象セレクタで『動画を選ぶ』を選ぶと公開日の新しい順に直近10本が既定で選ばれ、外す・追加・入れ替えができ、11本以上も選べる(上限なし)。KPI と推移はその動画群の合計になり、推移に動画ごとの線が重なる
- 動画別の実績は直近公開10本を既定表示し、視聴回数順へ並べ替えられ、『構成比』に切り替えると動画別上位+その他・切り口別・Shorts/長尺・新作/過去作の内訳と上位3本の占有率が出る
- KPI カードに出典バッジと M1 開示文が常に出て、前期比の上下が記号と色の両方で表される
- 『詳しく見る』のファネルを開いたときだけ GET /api/dashboard/funnel が呼ばれ、actual/target/target_gap または判定保留理由と改善候補(非因果)が従来どおり表示される
- 未連携・未収集・CSV未取込・レポート0件・アクション0件の各状態で、対応する空状態の文言と次の一手が出る
- 閲覧者には CSV取込ボタンが出ない。アクション編集メニューは後続 feature の依存で現在はどの役割にも出さず、書込系 API は権限外を 403 とする。他テナントや存在しない video_ids を渡すと黙って除外され、自テナント分だけの集計で 200 が返る(存在の有無を応答で区別しない)
- GET /api/dashboard の応答に Cache-Control: private, no-store が付き、CSP の img-src は 'self' data: のまま変わらず、サムネイルは GET /api/media/thumbnails/:video_id から自サイト経由で表示され、他テナントの video_id では取得できない
- 360px 幅で横スクロールが出ず、Playwright 390×844・820×1180・1440×900 の3サイズで主要操作の E2E が通る
- video_ids を101本以上指定しても GET /api/dashboard が 200 を返す(json_each で単一バインドし、D1 の bound parameters 上限100に当たらない)
- thumbnail 通1通の subrequest が50件以内に収まり、URL が変わった動画と fetched_at が25日を超えた動画が古い順に取り直され、30日を超えたサムネイルは Cron 役割①で R2 と media_assets から削除されて代替表示になる
- 動画が1,100本を超えるテナントでは公開日の新しい順に1,000本だけがサムネイル保存の対象になり、それより古い動画は取得されず代替表示になる

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/ui-ux.md, system-spec/frontend.md, system-spec/backend.md, system-spec/security.md, system-spec/database.md, system-spec/infrastructure.md(qa-089〜qa-099、評価 eval-log/completeness-report-20260924-r8.json。main 取込時の番号付け替えは eval-log/renumber-receipt-feat-dashboard-redesign-20260924.json)
- 画面正本: docs/screens/02-dashboard.png

## 機能間依存

- feat-youtube-daily-collection(daily_metrics / video_metrics と収集の通。thumbnail 通の起点)
- feat-csv-media-ingest(Studio CSV 由来の M1〜M10 と media_assets / R2。CTRのStudioフォールバックはCSV期間が確定し選択期間と一致するときだけ使い、現行の期間未確定CSVでは保留する)
- feat-skill-analysis-reports(最新AI分析カードが読む reports)
- feat-web-screens-actions(SPA 共通土台・ECharts・actions 集約。ダッシュボード本体はこの feature から移管)
- feat-login-redesign(YouTubeLinkBanner と CSP ヘッダの土台。本 feature は CSP を変えない)
- feat-settings-channel-link(AppShell・共通ヘッダーの期間切替 ?period=・共通部品 PageHeader/SectionCard/StatusBadge/DataTable。本 feature はヘッダーの PERIODS に 7d を足すだけで共通レイアウトは作り直さない qa-099)

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-dashboard-redesign --feature-context features/feat-dashboard-redesign.context.json` で生成する。本ノードは task を持たない。
