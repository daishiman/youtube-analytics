---
status: confirmed
category: backend
aggregate: 確定
spec_cells: [backend.web, backend.mobile, backend.tablet, backend.desktop-windows, backend.desktop-linux, backend.desktop-macos]
serves_goals: [G1, G2, G4]
---

# バックエンド (backend)

- カテゴリ集約状態: **確定**
- 章確定マーカー: `status: confirmed`

## カテゴリ別収集状態

| プラットフォーム | 状態 | 根拠 |
|---|---|---|
| Web (web) | 確定 | 確定質疑: qa-049。裏付け質疑 (`qa_refs`): `qa-003`, `qa-007`, `qa-010`, `qa-016`, `qa-025`, `qa-027`, `qa-030`, `qa-015`, `qa-032`, `qa-033`, `qa-037`, `qa-038`, `qa-039`, `qa-040`, `qa-023`, `qa-041`, `qa-043`, `qa-044`, `qa-045`, `qa-046`, `qa-047`, `qa-042`, `qa-048`, `qa-050`, `qa-051`, `qa-052`, `qa-053`, `qa-054`, `qa-055`, `qa-056`, `qa-057`, `qa-058`, `qa-059` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G1, G2, G4 |
| モバイル (mobile) | 対象外 | 理由: mobile: 端末専用APIを設けず、Web用APIをそのまま使う(qa-036で中立に再確認) |
| タブレット (tablet) | 対象外 | 理由: tablet: 端末専用APIを設けず、Web用APIをそのまま使う(qa-036で中立に再確認) |
| デスクトップ (Windows) (desktop-windows) | 確定 | 確定質疑: qa-015。裏付け質疑 (`qa_refs`): `qa-016`, `qa-023`, `qa-025`, `qa-027`, `qa-037`, `qa-038`, `qa-046`, `qa-056`, `qa-059` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G2 |
| デスクトップ (Linux) (desktop-linux) | 確定 | 確定質疑: qa-015。裏付け質疑 (`qa_refs`): `qa-016`, `qa-023`, `qa-025`, `qa-027`, `qa-037`, `qa-038`, `qa-046`, `qa-056`, `qa-059` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G2 |
| デスクトップ (macOS) (desktop-macos) | 確定 | 確定質疑: qa-015。裏付け質疑 (`qa_refs`): `qa-007`, `qa-008`, `qa-016`, `qa-023`, `qa-025`, `qa-027`, `qa-037`, `qa-038`, `qa-046`, `qa-056`, `qa-059` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G2 |

## 対象外の承認範囲

> 本章の対象外セルが引用している承認の実体。状態表の「承認: <id>」だけでは、その承認が何をどこまで認めたものかを章から辿れない。

### 承認: `appr-002`

対象platformはweb(レスポンシブ)とClaude Code実行用desktop(macOS/Windows/Linux)。mobile/tabletのネイティブアプリは作らないことをユーザーが選択(2026-09-21T09:37:58Z)

## 上流指針 (doctrine anchors)

> 本章の設計判断が従う上流の正本 (1 concern 1 authority)。具体技術ではなく上流工程を導く規範であり、下位の技術選定は本節と矛盾してはならない。正本: `ref-system-design-knowledge/references/doctrine-anchor-registry.json`

| 設計 concern | 上流の正本 (authority) | 導く範囲 | 出典 | 最終確認 | 本章の確定セルへの反映 |
|---|---|---|---|---|---|
| application-architecture | Robert C. Martin — Clean Architecture | レイヤ境界・依存方向 (内向き)・ユースケース中心設計 | Clean Architecture (2017), the Dependency Rule | 2026-07-12 | [qa-023] routes(Hono)→usecases(collectMetrics/importCsv/ingestReport/ingestTranscript/ingestMedia/updateAction)→repositoriesの内向き依存。YouTube APIクライアントはadapterとして差し替え可能にしテストではモックする。 |
| data-access | Robert C. Martin — Clean Architecture | 永続化を境界の外側へ追い出し interface adapter で隔離する | Clean Architecture — gateways/repositories boundary | 2026-07-12 | [qa-023/qa-027] ingestReportは結果JSONのスキーマ検証→reports新版INSERT→findings/psych_findings/comment_emotions/actions一括INSERTをD1 batchで1トランザクションにまとめ、途中失敗で版だけ残る状態を作らない。 |

> **未記入** の行は、上流の正本を掲げただけで本章の確定内容へ反映した箇所を示せていない。表への出現は反映の証拠ではない。

## 確定内容 (質疑録)

> 本章の各確定セルが何を根拠に確定したかの実体。`qa_ref` が主たる接地根拠、`qa_refs` がそれを支える裏付け質疑であり、いずれも qa_log (spec-state.json) の逐語である。ここに現れない主張は本章の確定内容ではない。

### Web (web)

- 資するゴール: G1, G2, G4

#### 主たる接地根拠: `qa-049`

**問**

API からの自動収集は、どの頻度にしますか?

**答**

毎日1回: すべての数値を毎日取得し、直近7日を取り直して修正も反映する。提示した他の案: 毎日+一部(視聴者属性・維持率)は週1回 / 週1回のまま

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者の提案『APIやCSVは1日に1回取得する形に』を受け、qa-048の調査結果を示したうえでのAskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:59:04Z)

#### 裏付け質疑: `qa-003`

**問**

分析の対象にするデータ元はどれか

**答**

YouTube Analytics, CSVの手動取込 (GA4・Search Consoleは選択せず)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり / 回答時刻: 2026-09-21T09:30:09Z)

#### 裏付け質疑: `qa-007`

**問**

AIによる分析解析の方法

**答**

分析解析を行うには、AIを使って分析解析を行いたい。AIによる分析解析は report-design-system スキル(.claude/skills/report-design-system)を使えるようにしてほしい。Claude Code上でプロンプトを実行し、そのプロンプトで実行したものがこのシステムの方に反映される仕組みにしてほしい。

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: ユーザー追加指示(チャット原文) / 回答時刻: 2026-09-21T09:30:09Z)

#### 裏付け質疑: `qa-010`

**問**

スキルの実行結果はシステムに何を反映するか

**答**

HTMLレポート本体, 結論・要因の要約, 改善アクションの管理

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり / 回答時刻: 2026-09-21T09:30:09Z)

#### 裏付け質疑: `qa-016`

**問**

AI分析(プロンプト実行結果・情報取得結果からの分析結果)をどの粒度の画面で扱うか

**答**

参照画像(FINAL-UI 12-ai.png相当)のように、プロンプトで分析した内容や情報取得した内容から分析結果を出せるようにしておいてください。これぐらいの粒度で画面も作成してほしい。画像を作成してください。→ AI分析画面を①依頼(対象期間・補足指示・使用データ確認・Claude Code用プロンプトをコピー)②実行状況(タスクID・ステータス・進捗)③レポート(一覧・版・結果JSON取込とエラー表示・要約/主な発見/次に取るべきアクション/根拠データ・版履歴と2版比較)の3区画で構成する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: ユーザー追加指示(チャット原文+参照画像) / 回答時刻: 2026-09-21T09:52:46Z)

#### 裏付け質疑: `qa-025`

**問**

(ユーザー追加要望『文字起こしやスクリーンショットなどの情報も取得した上で分析解析できるように』を受けて)動画の文字起こし(字幕)をどう取得するか

**答**

両方に対応: 基本は手元取込(YouTube Studioの字幕SRT/VTT、または手元動画をWhisperで文字起こし。youtube.readonlyのまま・0円)、希望者だけ追加同意でcaptions.download(youtube.force-ssl・1本200 units)による自動取得

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き・推奨以外の代替案併記) / 起点はユーザー追加指示(チャット原文 2026-09-21T12:26:19Z) / 回答時刻: 2026-09-21T12:35:35Z)

#### 裏付け質疑: `qa-027`

**問**

(ユーザー追加要望『人・心理学・心理的側面・様々な感情を分析できる情報を交えて分析解析できる仕組みに』を受けて)人・心理・感情の分析として何を含めるか(複数選択)

**答**

コメントの感情分析 / 離脱場面の心理分析 / 台本・話し方の心理分析 / サムネ・タイトルの心理訴求 の全部。加えて自由記述『上記以外にもアナリティクスで取得した情報の内容をもとに、分析や解析、心理分析をしてほしい。人が何を考えて、何を思って、どう行動するのかを踏まえて分析し、どういう心理によってこの結果になっているのかを想定し、その結果をまとめてレポートにしてほしい』

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き・推奨以外の代替案併記) / 起点はユーザー追加指示(チャット原文 2026-09-21T12:26:40Z) / 回答時刻: 2026-09-21T12:35:35Z)

#### 裏付け質疑: `qa-030`

**問**

(ユーザー追加指示『画面は本当にこれだけで必要十分か確認してほしい。ただし情報が多すぎると混乱するのでシンプルな構成は変えない』を受けて)利用者タスク×画面の点検で見つかった不足(動画1本ごとの詳細の置き場所・YouTube API規約III.A.2のプライバシーポリシー・III.E.4.gのデータ削除依頼・ダッシュボード9区画の情報過多)をどう解消するか

**答**

動画詳細=6枚目の画面『動画』を追加(代替案: ダッシュボードの詳細パネル[AI推奨]/レポート内だけ は不採用)。規約対応=メニュー外の静的ページ2枚(プライバシーポリシー・利用規約。ログイン画面とフッターからリンク)+設定に『データを削除』(7日以内削除)。ダッシュボード=要点だけ先に表示(問い→KPI4枚→最新AI分析の要約→実施中アクション。ファネル/切り口/視聴者/Shorts/品質は『詳しく見る』で開く)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き・推奨以外の代替案併記) / 起点はユーザー追加指示(チャット原文 2026-09-21T12:45:15Z) / 回答時刻: 2026-09-21T12:48:30Z)

#### 裏付け質疑: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

#### 裏付け質疑: `qa-032`

**問**

動画1本ごとの詳細(文字起こし・場面画像・コメント感情・離脱曲線・切り口の確定)はどこで見ますか?

**答**

6枚目の画面を追加(メニューに『動画』を足して専用画面にする)。提示した他の案: 詳細パネル(AI推奨) / レポート内だけ

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(2026-09-21T12:46:46Z提示)。qa-030で他2問と束ねて記録していたものを1問1答へ分割 / 回答時刻: 2026-09-21T12:48:30Z)

#### 裏付け質疑: `qa-033`

**問**

プライバシーポリシーとデータ削除の依頼(YouTube API の規約で必須)はどう置きますか?

**答**

静的ページ＋設定: メニュー外にプライバシーポリシーと利用規約の2ページ(ログイン画面とフッターからリンク)、設定に『データを削除』ボタン(7日以内に削除)。提示した他の案: ログイン画面に集約(削除依頼はメール窓口)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(2026-09-21T12:46:46Z提示)。qa-030から分割 / 回答時刻: 2026-09-21T12:48:30Z)

#### 裏付け質疑: `qa-037`

**問**

仕様のうちAIが詳しく決めた部分(DBの列名、APIのエンドポイント名、データの不変条件、30日保持のやり方、削除用の毎日Cronなど)と、分析カタログ(docs/analysis/dashboard-analysis-catalog.md)をどう扱いますか?

**答**

このまま承認: 内容を利用者の決定として扱い、実装で気づいた点は後で個別に直す。提示した他の案: 未承認のまま進める / 先に内容を見たい

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし) / 回答時刻: 2026-09-21T13:13:00Z)

#### 裏付け質疑: `qa-038`

**問**

qa-037/appr-005 で一括承認した範囲は具体的にどの項目か(completeness evaluator r4 の指摘により明細を残す)

**答**

承認時点(2026-09-21T13:13:00Z)の対象は次の3群。(1) design_applications 8章(database・auth・ui-ux・security・infrastructure・backend・frontend・maintenance-ops)のうち、各[利用者確定 qa-…]の骨格をアシスタントが詳しくした部分: database=11テーブルの列名・主キー・fetched_at列とcomment_id参照 / auth=OAuthスコープ・同意画面の公開方針・セッションCookie・Claude Code用個人トークン / ui-ux=6画面の区画と2段表示・スマホ幅の下部タブとカード化 / security=5脅威と対策・30日保持・7日以内削除 / infrastructure=Workers・D1・R2の構成とCron2本(`0 * * * 0` 収集・`0 18 * * *` 削除と再試行) / backend=エンドポイント名・usecaseと集約・状態遷移 / frontend=ルート構成・api client層・Playwright 3サイズE2E / maintenance-ops=launchdの週次実行・無料枠メーター・派生指標M1〜M10のモジュールと検算テスト・runbook4本。(2) doctrine_applications(frontend/application-architecture・frontend/presentation・security/security ほか全件)。(3) docs/analysis/dashboard-analysis-catalog.md(sha256 fa5487b8084452d1ede6c400ae3e7b7f70faaa57fc4d4def153fa2faa157ce47)。いずれも内容を一件ずつ見せたうえでの承認ではない。

- (根拠の性質: コード・設定・公式文書で検証できる観測事実 / 出所: spec-state.json と分析カタログから、承認対象をアシスタントが列挙した記録。新たな質問・承認ではない / 回答時刻: 2026-09-21T13:25:30Z)

#### 裏付け質疑: `qa-039`

**問**

プライバシーポリシーと利用規約(YouTube APIの規約で掲示が必須)は、どこに置きますか?

**答**

独立した静的ページ: 2ページに分け、ログイン画面とフッターからリンクする。メニューには出さない。提示した他の案: ログイン画面に集約 / 外部ページに置く

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし・13:31Z頃提示)。qa-033 が2論点を1問で聞いていたため中立な2問に分けて聞き直し / 回答時刻: 2026-09-21T13:33:00Z)

#### 裏付け質疑: `qa-040`

**問**

利用者からのデータ削除の依頼(規約上、7日以内の対応が必須)は、どう受け付けますか?

**答**

設定画面のボタン: 『データを削除』を押すとすぐに削除を実行し、失敗分は自動で再試行する。提示した他の案: メール窓口 / ボタンとメールの両方

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし・13:31Z頃提示)。qa-033 が2論点を1問で聞いていたため中立な2問に分けて聞き直し / 回答時刻: 2026-09-21T13:33:00Z)

#### 裏付け質疑: `qa-023`

**問**

バックエンド(API)の詳細案(Hono v4 on Workers・画面用REST・スキル連携API3本・YouTube API失敗は指数バックオフ最大3回→次の毎時実行で拾い直し)で確定するか

**答**

この内容で確定(代替案: 再試行しない は不採用)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き・推奨以外の代替案併記) / 回答時刻: 2026-09-21T12:29:59Z)

#### 裏付け質疑: `qa-041`

**問**

テナントごとのデータは、どのように分けて保存しますか?

**答**

行で分け、将来DB分割できる形に: 今は1つのD1で全行にtenant_idを持たせて分け、テナント→DBの対応表を持って特定テナントだけ別DBへ移せるようにする。提示した他の案: 1つのDBで行ごとに分ける(対応表なし) / テナントごとにDBを1つ(無料はD1が10個まで)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者の要望『ユーザーごとにテナントを作成できるように』を受けたAskUserQuestion 3択(推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-043`

**問**

テナントごとに取り込める分析データの入手元を、すべて選んでください。

**答**

YouTube API(自動収集)・YouTube StudioのCSV・字幕/画像ファイルの3系統。GA4(Google Analytics)APIは選ばなかった

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者の要望『ユーザーごとに分析する情報をAPI、CSVなどから取得』を受けたAskUserQuestion 複数選択(4候補・推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-044`

**問**

テナントへの招待は、どう届けますか?

**答**

招待リンクをコピーして渡す: 招待先Googleアカウントのメールを登録し、発行されたリンク(7日有効)を自分で送る。そのアドレスでログインした人だけが参加できる。追加費用0円。提示した他の案: システムからメール送信(外部送信サービスの契約が必要)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-045`

**問**

招待した人には、どこまで操作を許しますか?

**答**

オーナー/編集者/閲覧者の3段階: オーナー=連携・招待・削除まで全部、編集者=CSV取込・分析依頼・アクション更新、閲覧者=見るだけ。提示した他の案: オーナー/メンバーの2段階 / 招待者は閲覧のみ

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-046`

**問**

マルチテナントの詳細設計(DBの3テーブルと全業務テーブルのtenant_id、権限表、招待の検証条件、削除の範囲、画面の変更点、収集Cronの単位)を各章に反映してよいですか?

**答**

この内容で承認: プレビューで詳細を表示したうえで承認。提示した他の案: 修正してから承認

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(詳細をプレビュー表示・推奨表示なし)。qa-037の一括承認と違い、内容を見たうえでの承認。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-047`

**問**

マルチテナント対応に合わせた上位概念の改訂(G1『テナントごと』、G4『テナント単位で分けメンバーが権限の範囲でアクセス』、O1/O4、scope.in、I10追加、成功基準追加)で確定してよいですか?

**答**

この内容で承認(改訂案をプレビュー表示)。提示した他の案: 修正してから承認

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(改訂案をプレビュー表示・推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-042`

**問**

1つのテナントには誰が入れますか?

**答**

招待で複数人: 作成者がオーナー。編集者・閲覧者を招待できる(設定画面にメンバー欄)。提示した他の案: 本人1人だけ / 今は1人・後で拡張可

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-048`

**問**

YouTube Studio のCSVの各列は、YouTube Analytics API / Reporting API / Data API のどれで自動取得できるか。1日1回収集の無料枠内の構成は(利用者の要望『1日に1回取得』『CSVも自動でAPIから取得可能か』の裏取り)

**答**

公式ドキュメント(2026-09-21 13:43〜13:48Z 確認)による。視聴回数・総再生時間・平均視聴時間・平均再生率・登録者増減・高評価・コメント・共有・カード・トラフィックソース・視聴者属性・Shorts区別(creatorContentType)・視聴者維持率=Analytics API(reports.query)。インプレッション数・インプレッションCTR=Reporting API の channel_reach_basic_a1 のみ(2026-01-15提供開始・Analytics APIには無い)。終了画面=Reporting API のみ。ユニーク視聴者数=どのAPIでも取得不可(uniques は2016-10-31廃止)。Reporting API はジョブ作成から約48時間で日次CSVが出始め、作成前30日分の過去分を生成し、それより前は取得不可。通常レポートは60日・過去分は30日で取得不能になり、YouTubeがデータを直すと同じ期間の修正版が新しいIDで出る。Analytics の数値は通常48〜72時間の処理遅延があり、後から値が変わりうる。Analytics/Reporting API のクォータ数値は非公開(Cloud Consoleで確認)。Data API は10,000 units/日、captions.download は200 units かつ youtube.force-ssl と動画の編集権限が必要。Workers Free は1実行サブリクエスト50(D1呼出しも含む)・CPU 10ms・Cron Trigger 5本、D1 Free は書込10万行/日(索引更新も数える)。規約 III.E.4(https://developers.google.com/youtube/terms/developer-policies, 2026-09-14更新): 『Your API Clients must not (i) replace API Data with similar, independently calculated data, or (ii) access or use API Data to create new or derived data or metrics.』。例外はIII.Lの監査済み開発者のみ。YouTube利用規約(https://www.youtube.com/t/terms, 2023-06-01発効)は、検索エンジンと事前の書面許可を除き自動化された手段でのアクセスを禁じる。

- (根拠の性質: コード・設定・公式文書で検証できる観測事実 / 出所: バックグラウンド調査(公式ドキュメントのみ)と、保存済み開発者ポリシー本文・YouTube利用規約の原文確認をアシスタントがまとめた観察事実。利用者への質問ではない / 回答時刻: 2026-09-21T14:03:14Z)

#### 裏付け質疑: `qa-050`

**問**

インプレッション数と CTR はどこから取りますか?

**答**

Reporting API で自動取得: テナント登録時に取得の設定(ジョブ作成)をし、毎日自動で取り込む。設定日から30日より前の分は CSV の手動取込で補う。提示した他の案: CSV の手動取込だけ / 扱わない

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:59:04Z)

#### 裏付け質疑: `qa-051`

**問**

Studio CSV の手動取込は、今後どう位置づけますか?

**答**

主な取得手段として残す: API と CSV のどちらでも同じように取り込めるようにする。提示した他の案: 補完用に残す(ユニーク視聴者数・過去分だけ) / やめる

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:59:04Z)

#### 裏付け質疑: `qa-052`

**問**

D1 の無料枠(書き込み10万行/日)を超えそうなときは、どうしますか?

**答**

テナント数に上限を設ける: 無料枠に収まる数(目安100テナント程度)で新規作成を止める。提示した他の案: 有料プランへ切り替える / 収集を遅らせて分散する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:59:04Z)

#### 裏付け質疑: `qa-053`

**問**

派生指標 M1〜M10(加重平均視聴率など)の計算を、規約に合わせてどう扱いますか?

**答**

CSV由来のデータだけで計算: M1〜M10 と統計分析は Studio CSV から取り込んだデータだけで計算し、API のデータは公式の値をそのまま表示するだけにする。提示した他の案: API公式指標に置き換える / Googleの個別許可(III.L)を前提にする

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: qa-048 の規約 III.E.4 原文(派生指標の禁止)を示し、既存仕様に抵触のおそれがあると説明したうえでのAskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:59:04Z)

#### 裏付け質疑: `qa-054`

**問**

API と CSV の両方に、同じ日・同じ動画・同じ指標の値があるときは、どう扱いますか?

**答**

両方保存し出典を表示: API 由来と CSV 由来を別々に保存し、画面では出典(API/CSV)のバッジを付けて表示する。提示した他の案: API の値を優先 / 後から取り込んだ方を優先

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:59:04Z)

#### 裏付け質疑: `qa-055`

**問**

Codex などの画面操作による Studio CSV の自動ダウンロードを、仕様ではどう扱いますか?

**答**

使わない(通知もなし): CSV は必要なときに手動で取り込むだけにする。提示した他の案: 使わない(取込の催促通知だけ出す) / 運営者本人だけ試す(規約リスクを記録)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者の質問『Codexのコンピュータユースで自動取得できないか』に、YouTube利用規約の自動アクセス禁止条項(qa-048)を示したうえでのAskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T14:03:14Z)

#### 裏付け質疑: `qa-056`

**問**

毎日収集の詳細設計(Cron `*/5 19-23 * * *`・1回2テナント、呼出しの内訳、出典別の表と出典バッジ、派生指標はCSV由来のみと開示文、Reportingのジョブと修正版の置換、テナント上限100、コメント感情の件数指標の廃止、runbook追加)を各章に反映してよいですか?

**答**

この内容で承認: 詳細設計(Cron・呼出し内訳・出典別の表とバッジ・派生指標はCSV由来のみと開示文・Reporting・上限100・コメント件数指標の廃止・runbook追加)をプレビューで表示したうえで承認。提示した他の案: 修正してから承認

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(詳細をプレビュー表示・推奨表示なし)。内容を見たうえでの承認。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T14:10:14Z)

#### 裏付け質疑: `qa-057`

**問**

毎日収集に合わせた上位概念の改訂(O1『毎日1回』と指標、I2/I3、scope.in の API と CSV と Cron、scope.out の2項目追加、制約2項目追加、成功基準の追加)で確定してよいですか?

**答**

この内容で承認(改訂案をプレビュー表示)。提示した他の案: 修正してから承認

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(改訂案をプレビュー表示・推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T14:10:14Z)

#### 裏付け質疑: `qa-058`

**問**

収集を『Cronは1日1回だけ+Cloudflare Queuesでテナントごとに別の実行』に変えますか? 変える場合、起動時刻はいつにしますか?

**答**

1日1回で、朝の3時(JST 3:00)に行う。提示した選択肢: Queues・1日1回 JST 5:00 / Queues・1日1回 JST 0:00 / Queuesを使わず現案のまま(朝5時間の5分おき)。利用者は自由記述で『1日1回で、朝の3時に行うようにしてください』と回答

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者の質問『24時間に1回取得するでいいのでは。15分・30分おきに取得する意味はあるのか』に、5分おきは Workers Free の1実行サブリクエスト50件(1実行2テナント)を回避するためだけだったと説明し、Queues(無料プラン可・1バッチ=1実行)による1日1回案を示したうえでのAskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T14:22:18Z)

#### 裏付け質疑: `qa-059`

**問**

qa-058 に合わせた改訂(収集を毎日JST 3:00の Cron 1回+Cloudflare Queuesでテナントごとに実行、削除処理を同じCronに統合してCron Triggerは1本、再試行は Queues の max_retries=3・10分間隔、上位概念の O1 と scope.in[3] の文言)で確定してよいですか?

**答**

この内容で承認(改訂箇所をプレビュー表示)。提示した他の案: 修正してから承認

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(改訂箇所をプレビュー表示・推奨表示なし)。内容を見たうえでの承認。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T14:24:26Z)

### デスクトップ (Windows) (desktop-windows)

- 資するゴール: G2

#### 主たる接地根拠: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

- 裏付け質疑 `qa-016` — 本章の上掲に既出

- 裏付け質疑 `qa-023` — 本章の上掲に既出

- 裏付け質疑 `qa-025` — 本章の上掲に既出

- 裏付け質疑 `qa-027` — 本章の上掲に既出

- 裏付け質疑 `qa-037` — 本章の上掲に既出

- 裏付け質疑 `qa-038` — 本章の上掲に既出

- 裏付け質疑 `qa-046` — 本章の上掲に既出

- 裏付け質疑 `qa-056` — 本章の上掲に既出

- 裏付け質疑 `qa-059` — 本章の上掲に既出

### デスクトップ (Linux) (desktop-linux)

- 資するゴール: G2

#### 主たる接地根拠: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

- 裏付け質疑 `qa-016` — 本章の上掲に既出

- 裏付け質疑 `qa-023` — 本章の上掲に既出

- 裏付け質疑 `qa-025` — 本章の上掲に既出

- 裏付け質疑 `qa-027` — 本章の上掲に既出

- 裏付け質疑 `qa-037` — 本章の上掲に既出

- 裏付け質疑 `qa-038` — 本章の上掲に既出

- 裏付け質疑 `qa-046` — 本章の上掲に既出

- 裏付け質疑 `qa-056` — 本章の上掲に既出

- 裏付け質疑 `qa-059` — 本章の上掲に既出

### デスクトップ (macOS) (desktop-macos)

- 資するゴール: G2

#### 主たる接地根拠: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

- 裏付け質疑 `qa-007` — 本章の上掲に既出

#### 裏付け質疑: `qa-008`

**問**

他の利用者はAI分析をどう使うか

**答**

各自がClaude Codeで実行

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり / 回答時刻: 2026-09-21T09:30:09Z)

- 裏付け質疑 `qa-016` — 本章の上掲に既出

- 裏付け質疑 `qa-023` — 本章の上掲に既出

- 裏付け質疑 `qa-025` — 本章の上掲に既出

- 裏付け質疑 `qa-027` — 本章の上掲に既出

- 裏付け質疑 `qa-037` — 本章の上掲に既出

- 裏付け質疑 `qa-038` — 本章の上掲に既出

- 裏付け質疑 `qa-046` — 本章の上掲に既出

- 裏付け質疑 `qa-056` — 本章の上掲に既出

- 裏付け質疑 `qa-059` — 本章の上掲に既出

## To-Be / Delta

> 本章の**規範**。上位概念 (要件定義書 U3 ゴール / U4 目標 / U9 具体的やりたいこと) を本章の serves_goals で絞り込んだ射影であり、設計知識 card (非規範の参考資料) とは役割が異なる。As-Is (現行実装の姿) は spec-state.json の管轄外のため本節では断定せず、到達点と、その到達を判定する観測点だけを規範として置く。

### 到達すべき状態 (To-Be)

- **G1**: YouTube Analyticsの実績データ(API連携+CSV取込+字幕・画像ファイル)をテナントごとに継続的に収集・集計できる
- **G2**: Claude Code上で実行したreport-design-systemの分析結果(HTML・結論/要因の要約・改善アクション)が、週次売上ファネルと直近5回の分析履歴を踏まえた差分分析としてシステムへ反映され、閲覧・管理・効果比較できる
- **G4**: 他の利用者にも提供でき、利用者ごとに作られるテナントの単位でデータを分け、そのテナントのメンバー(オーナー/編集者/閲覧者)だけが権限の範囲でアクセスできる

### 受入条件 (Delta の判定点)

| 目標 | 到達点 | 達成の観測点 (measure) |
|---|---|---|
| O1 | 全テナントの定期収集(毎日1回JST 3:00。Analytics APIは直近7日を取り直し、インプレッション・CTRはReporting APIから取得)がCloudflare Cron Triggersで自動実行される | 28日連続で、毎日09:00 JST時点で当日の収集が終わっていないテナント0件 |
| O2 | Claude Codeからの1回のスキル実行でデータ取得→分析(数値・心理・週次売上ファネル・直近5回との差分)→システム反映まで完了する | 初期設定後、反映までの手作業ステップ0 |
| O4 | テナント間のデータ越境と権限外の操作をなくす | 認可テストで他テナントのデータ(D1行・R2画像)取得成功0件、閲覧者の書込操作成功0件 |

### 本章がかなえる具体的やりたいこと (U9)

- **I1**: Googleでログインし、YouTubeチャンネルを読取専用で連携する
- **I2**: YouTube Studio CSV3種と週次事業CSVを手動取込し、出典、nullと実測0を保って保存する。YouTube派生指標M1〜M10と週次診断のYouTube側入力はStudio CSV由来だけで計算する
- **I3**: Cronで毎日1回、Analytics API(日別指標・動画別・流入元・視聴者属性・維持率)とReporting API(インプレッション・CTR)から取得し、出典(API)付きで保存する
- **I4**: Claude Codeで /yt-analyze を実行すると、YouTubeデータ・週次事業ファネル・同一テナント/チャンネルの直近5回の分析履歴パックを取得し、前回仮説の当否と施策効果を含む差分分析HTMLを作ってアップロードする
- **I5**: 運営者はlaunchdで週次にI4を自動実行する。一般利用者は手動実行
- **I6**: 改善アクションを未着手/実施中/効果測定中/完了で管理し、次回レポートで前後比較する
- **I9**: 字幕・画像・コメント・維持曲線を取り込み、Claude Codeで人の考え・感情・行動を推定した心理分析レポートを作る
- **I10**: 初回ログインで自分のテナントが作られ、招待リンクでメンバーを追加してオーナー/編集者/閲覧者の権限で共有する

### 分析履歴パック契約（保留要件 psc-001 の適用）

- `GET /api/skill/export` は現在データに加え、同じ`tenant_id + channel_id`の完了済みレポートを新しい順に最大5版返す。各版は結論、要因、対象ファネル段、改善アクション、baseline/result、下流結果、分析日時、版番号に絞り、HTML本体を重複添付しない。
- 履歴が0件でも初回分析として正常処理する。1〜4件なら存在する版だけを返す。別テナント・別チャンネルの履歴は混ぜない。
- 新しいレポートは`history_versions_used`と、前回仮説の当否、施策効果、前回からの差分を持つ。過去版は更新しない。

### 本章に効く確定意思決定

- **D-ai-engine**: AI分析の実行エンジンをどれにするか(Gemini API無料枠の扱いを含む)
  - 採択: Claude Code上のreport-design-systemスキル(利用者各自のPCで実行し結果をアップロード) (`claude-code-skill`)
  - 目的適合: 数値再現(analysis.mjs)+結論→要因→打ち手HTMLという既存資産をそのまま使えG2に直結
- **D-db**: データ・HTMLレポート・画像の保存先をどれにするか
  - 採択: D1(構造化データ・HTML)+R2(画像: サムネイル・場面画像・スクショ) (`d1-r2`)
  - 目的適合: 画像をレポート画面で見られるため心理分析(サムネ訴求・離脱場面)の根拠提示に適合しG1/G2/G4を満たす
- **D-auth**: Web画面のログインとYouTube連携の認証をどうするか
  - 採択: Google OAuth一本(同意画面を本番公開・未検証) (`google-oauth-published`)
  - 目的適合: ログインとYouTube連携を1回の同意で完結しG1/G4に適合
- **D-cron**: YouTubeデータの定期収集をどこで動かすか
  - 採択: Cloudflare Cron Triggers (`cf-cron`)
  - 目的適合: D1と同じ基盤で全利用者分を収集しG1に適合
- **D-transcript**: 動画の文字起こし(字幕)をどう取得するか
  - 採択: 両方に対応(既定は手元取込、希望者だけ追加同意でAPI自動取得) (`hybrid`)
  - 目的適合: readonly利用者と自動化希望者の両方を満たす

## 適用された設計知識

> 以下の deep knowledge card は設計判断を支援する**非規範の参考資料**であり、実装済み・検証済みの証拠ではない。カード内の `採否: applied` は設計採用を意味し、実装状態は意味しない。規範となる差分は本章の To-Be / Delta 節と参照先仕様で管理する。

### 本章での適用

[承認 qa-037/appr-005・一括承認] 骨格は各[利用者確定 qa-…]で利用者が選択肢から選んだ範囲。列名・エンドポイント名・集約と不変条件・テスト値・保持と削除のCronなどの詳細はアシスタントが骨格から詳しくしたもので、利用者は qa-037 の3択(このまま承認/未承認のまま進める/先に内容を見たい)から『このまま承認』を選び、一括で承認した。項目ごとの内容確認は行っていないため、実装で食い違いが見つかれば個別に見直す。承認範囲の明細は qa-038。[利用者確定 qa-015/qa-023] Hono v4 on Workers。画面用REST: GET /api/me, GET /api/dashboard?period=, POST /api/csv, GET/POST /api/analysis-requests, GET /api/reports(/:id, ?version=, /diff?a=&b=), GET/PATCH /api/actions/:id。スキル連携API(個人トークン): GET /api/skill/export?request_id= / PATCH /api/skill/requests/:id / POST /api/skill/reports。YouTube API失敗は指数バックオフ最大3回→次の毎時実行で拾い直し。[qa-025/026/027/029の機能決定に伴う追加(エンドポイント名はAI設計)] POST /api/skill/transcripts(SRT/VTT/Whisper結果を時刻付きで保存) / POST /api/skill/media(縮小画像をR2へ・キーをmedia_assetsへ) / exportに維持曲線・コメント・字幕・画像キー・派生指標M1〜M10を含める / POST /api/skill/reportsの受理JSONにpsych_findings・comment_emotions・ideasを追加。CSV取込はカタログの判定規則(Shorts判定・空欄と0の区別・集計遅延・合計行の別保存)で正規化する。[qa-030の画面追加に伴う追加(エンドポイント名はAI設計)] GET /api/videos(一覧) / GET /api/videos/:id(維持曲線・心理・コメント感情・場面画像キー・文字起こし) / PUT /api/videos/:id/angle(切り口の確定) / DELETE /api/me/data(全データ削除)。設計知識(API Design Patterns)の適用: エラーは {error:{code,message,hint}} の単一形式、POST /api/skill/reportsは request_id+版番号をIdempotency-Keyとして二重送信で版を増やさない、一覧はcursorページング、スキル連携APIは /api/skill/ 配下で版番号をヘッダ(X-Skill-Api-Version)で明示する。設計知識(DDD)の適用: usecaseと集約を1対1で対応させる。ingestReportは『レポート版』集約の新しい版を追記だけで作り、updateActionは『改善アクション』集約の状態遷移(未着手→実施中→効果測定中→完了の一方向)を集約内で検査する。ほかのusecaseが2つの集約を1トランザクションで同時に書き換えることはしない。[利用者確定 qa-041〜qa-045・内容承認 qa-046/appr-007 マルチテナント] 全usecaseの入力に TenantContext(tenant_id, user_id, role) を必須にし、repository は tenant_id 無しのクエリを組めない形(TenantScopedRepository)にする。役割の確認は usecase の入口で1回行う。追加API: GET/POST /api/tenants / POST /api/session/tenant(切替) / POST /api/tenants/:id/invites / DELETE /api/tenants/:id/invites/:inviteId / POST /api/invites/accept / PATCH・DELETE /api/tenants/:id/members/:userId / POST /api/tenants/:id/leave。収集Cronは毎日(qa-049、末尾の[毎日収集]節)。取得元はYouTube API・CSV・字幕/画像ファイルの3系統をテナント単位で受ける(qa-043)。[利用者確定 qa-049〜qa-055・qa-058・調査 qa-048・内容承認 qa-056/appr-009・qa-059/appr-010 毎日収集] collector usecase を日次に変える: 1テナントの処理を1関数(collectTenantDaily)にまとめ、Analytics はD-7〜D-1を取り直し、動画別は startDate=endDate=D-3 の単日クエリ(maxResults 200, sort -views)で積み上げる。Reporting は reports.list(createdAfter=前回値)で新しいレポートだけを取り、同じ startTime/endTime の修正版が来たらその期間の行を置き換える。レポートは60日で取れなくなるため、60日以上収集できなかった期間は CSV 取込で補う。テナント作成API(初回ログイン時)は MAX_TENANTS に達していたら作成せず『現在新規の受付を停止しています』を返す(招待でのメンバー追加は上限の対象外)。/api/skill/export は行ごとに source を付け、M1〜M10 は CSV 由来の行からだけ計算して返す。収集は毎日JST 3:00の Cron が Queues にテナントごとの通を入れ、consumer が1通=1テナントで collectTenantDaily を呼ぶ(qa-058)。

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 記録時刻: 2026-09-21T14:10:14Z)

### Clean Architecture — deep knowledge card

- 出典カード: `ref-system-design-knowledge/references/clean-architecture.md`

#### 目的

変化しやすいUI、DB、framework、外部サービスから、長く保持したい業務ルールとuse caseを隔離し、技術交換やテストを目的達成の阻害要因にしない。

#### 解決する問題

- 業務ルールがcontroller/ORM/UI lifecycleへ埋まり、単体で検証できない。
- 外部技術変更が内側のuse caseまで波及し、置換費用を予測できない。
- 入出力形式やvendor型が境界を越え、責務と所有者が曖昧になる。

#### 適用条件

- business ruleが外部I/Oより長寿命で、UI/DB/providerの変更可能性がある。
- 複数delivery channelや外部integrationから同じuse caseを再利用する。
- 重要なpolicyを高速・決定論的にテストする価値が、境界導入費を上回る。

#### 非適用条件

- 寿命の短い検証用prototypeで、交換可能性より学習速度が明確に優先される。
- domain ruleがほぼ無い単純変換scriptで、port/adapterが実質的な抽象を生まない。
- 外部製品そのものがsystemの目的で、抽象化すると必要機能が失われる。ただしsecurity/audit boundaryは別途必要。

#### トレードオフ・失敗モード

- 境界、DTO、mapping、dependency injectionの量が増え、小規模systemでは認知負荷が先行する。
- 「4層を作ること」が目的化すると、変化軸のないinterfaceやpass-through use caseが増える。
- domain modelを万能化してdelivery固有の制約を隠すと、現実のlatency/transaction/error semanticsを見失う。
- portを外側が定義したりinner layerがORM型を返したりすると、名前だけcleanな依存逆転になる。

#### goalへの寄与

- `essential_purpose`に直結するpolicyを外部詳細から守り、goal達成ロジックの検証を速くする。
- 制約に「vendor lock-in低減」「複数platform」「高い変更頻度」がある場合、変更範囲と移行riskを局所化する。
- 適用判断は「何層あるか」でなく、守るgoal、予想される変更、boundary testで観測する。

---

### API Design Patterns — deep knowledge card

- 出典カード: `ref-system-design-knowledge/references/api-design-patterns.md`

#### 目的

consumerとproviderの独立変更を支える安定した契約を作り、再試行、失敗、並行更新、pagination、evolutionを予測可能にする。

#### 解決する問題

- resource/operationの意味、error、null、time、identifierがendpointごとに揺れる。
- timeout後の再試行で二重処理が起き、clientが成功/失敗を判断できない。
- collection増大や並行更新でoffset paginationと全件responseが破綻する。
- version/evolution方針がなく、provider変更がconsumerを突然壊す。

#### 適用条件

- 複数client/team/organizationが独立releaseで同じservice boundaryを利用する。
- network failureとretryが通常事象で、operation結果の重複や不明状態を制御する必要がある。
- contractの長期互換性とobservabilityが局所的な実装簡潔性より重要。

#### 非適用条件

- 同一process内のprivate callで、network boundaryや独立versioningが存在しない。
- hard real-time stream、双方向session、巨大event flowなど、request/response RESTが問題形状に合わない。
- 単純CRUD表面化がdomain invariantを迂回させる場合。use-case operationまたは別interaction modelを選ぶ。

#### トレードオフ・失敗モード

- version、idempotency ledger、schema governance、compatibility testに運用費がかかる。
- 「名詞URL」だけ守ってtransaction、authorization、error semanticsを設計しない表層RESTになる。
- offset paginationは簡単だが大規模/更新中datasetで遅延・重複・欠落を起こす。
- idempotency keyのscope/TTL/payload bindingが曖昧だと、別requestを誤って同一視する。
- breaking changeを新versionで逃がし続けると、複数version保守とsecurity patch負担が増える。

#### goalへの寄与

- mobile/web/desktop間で一貫したbusiness capabilityを共有し、platform別再実装を減らす。
- reliability goalにはretry-safe operationと明示的error、delivery goalにはcontract testとadditive evolutionを結ぶ。
- 選択はAPI様式の流行でなく、consumer、latency、consistency、offline、security、cost constraintsへの適合で評価する。

---

### Domain-Driven Design — deep knowledge card

- 出典カード: `ref-system-design-knowledge/references/ddd.md`

#### 目的

businessの重要なruleと用語をmodel/code/会話で一致させ、複雑性を適切な境界へ閉じ込め、継続的な学習をsoftwareへ反映する。

#### 解決する問題

- 仕様語、画面語、DB列、code名がずれ、変更時に意味を再解釈する。
- 異なる業務文脈の同名概念を一modelへ押し込み、巨大で矛盾したmodelになる。
- invariantとtransaction ownerが不明で、どこからでもdataを変更できる。
- legacy codeのtechnical構造がbusiness capabilityを隠し、改善順を決められない。

#### 適用条件

- rule、例外、用語、状態遷移が多く、domain expertとの継続的なmodel学習が価値を持つ。
- team/部門ごとに言葉やownershipが異なり、integrationで翻訳が必要。
- core domainの差別化がsystemの本質的目的に直結する。

#### 非適用条件

- 単純CRUD、汎用supporting機能、既製serviceで十分なgeneric subdomain。
- domain expertへアクセスできず、用語とruleを検証するfeedback loopを作れない段階。
- bounded contextをservice数へ機械変換する目的。monolith内moduleでも境界は成立する。

#### トレードオフ・失敗モード

- workshop、model、mapping、専門語彙の維持に継続的な時間が必要。
- aggregateを大きくしすぎてlock/latencyを増やす、細かくしすぎてinvariantをeventual consistencyへ漏らす。
- 「Repository/Entity」等のpattern名だけ採用したanemic modelになり、business ruleがserviceへ散る。
- bounded contextを組織図やDB tableから決め、実際の言語・capability境界を検証しない。
- eventを事実でなくcommandとして命名し、ordering/idempotency/failure recoveryを設計しない。

#### goalへの寄与

- U1-U9の語彙をmodelへ接続し、goalがどのcontext/capability/invariantで実現されるかを示す。
- core domainへ設計投資を集中し、generic領域は無料/低コストserviceや標準実装も比較対象にできる。
- refactoringは一括rewriteでなく、重要なbusiness rule周辺からstrangler/bubble context等で境界を育てる。

## 最新ドキュメント出典

| 対象 | バージョン | 公式発行元 | 出典URL | 取得 | 最新確認 |
|---|---|---|---|---|---|
| cloudflare-cron-triggers | 2026-09-04 | Cloudflare (developers.cloudflare.com) | https://developers.cloudflare.com/workers/configuration/cron-triggers/ | 2026-09-21T09:50:54Z | 2026-09-21T09:50:54Z |
| youtube-data-api | 2026-09-15 | Google (developers.google.com) | https://developers.google.com/youtube/v3/determine_quota_cost | 2026-09-21T09:50:58Z | 2026-09-21T09:50:58Z |
| youtube-analytics-api | 2026-09-16 | Google (developers.google.com) | https://developers.google.com/youtube/analytics/reference/reports/query | 2026-09-21T09:50:59Z | 2026-09-21T09:50:59Z |
| gemini-api | 2026-09-16 | Google (ai.google.dev) | https://ai.google.dev/gemini-api/docs/pricing | 2026-09-21T09:51:01Z | 2026-09-21T09:51:01Z |
| claude-code | 2026-09-18 | Anthropic (code.claude.com) | https://code.claude.com/docs/en/overview | 2026-09-21T09:51:01Z | 2026-09-21T09:51:01Z |
| hono | 4.13.8 | Hono (hono.dev) | https://hono.dev/docs/getting-started/cloudflare-workers | 2026-09-21T09:51:02Z | 2026-09-21T09:51:02Z |
| youtube-captions-api | 2026-09-15 | Google (developers.google.com) | https://developers.google.com/youtube/v3/docs/captions/download | 2026-09-21T12:30:18Z | 2026-09-21T12:30:18Z |
| youtube-comment-threads-api | 2026-09-14 | Google (developers.google.com) | https://developers.google.com/youtube/v3/docs/commentThreads/list | 2026-09-21T12:30:20Z | 2026-09-21T12:30:20Z |
| youtube-analytics-retention-report | 2026-09-13 | Google (developers.google.com) | https://developers.google.com/youtube/analytics/channel_reports | 2026-09-21T12:30:20Z | 2026-09-21T12:44:00Z |
| openai-whisper | v20250625 | OpenAI (github.com) | https://github.com/openai/whisper/releases | 2026-09-21T12:40:39Z | 2026-09-21T12:40:39Z |
| ffmpeg | 9.0.2 | FFmpeg (ffmpeg.org) | https://ffmpeg.org/download.html | 2026-09-21T12:40:32Z | 2026-09-21T12:40:32Z |
| youtube-reporting-api | 2026-09-14 | Google (developers.google.com) | https://developers.google.com/youtube/reporting/v1/reports/channel_reports | 2026-09-21T14:25:35Z | 2026-09-21T14:25:35Z |
