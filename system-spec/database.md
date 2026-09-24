---
status: confirmed
category: database
aggregate: 確定
spec_cells: [database.web, database.mobile, database.tablet, database.desktop-windows, database.desktop-linux, database.desktop-macos]
serves_goals: [G1, G2, G4]
---

# データベース (database)

- カテゴリ集約状態: **確定**
- 章確定マーカー: `status: confirmed`

## カテゴリ別収集状態

| プラットフォーム | 状態 | 根拠 |
|---|---|---|
| Web (web) | 確定 | 確定質疑: qa-079。裏付け質疑 (`qa_refs`): `qa-003`, `qa-010`, `qa-014`, `qa-016`, `qa-020`, `qa-015`, `qa-035`, `qa-037`, `qa-038`, `qa-026`, `qa-042`, `qa-043`, `qa-044`, `qa-045`, `qa-046`, `qa-047`, `qa-041`, `qa-048`, `qa-049`, `qa-050`, `qa-051`, `qa-052`, `qa-053`, `qa-055`, `qa-056`, `qa-057`, `qa-058`, `qa-059`, `qa-054`, `qa-062`, `qa-063`, `qa-064`, `qa-065`, `qa-070`, `qa-071`, `qa-074`, `qa-075`, `qa-076`, `qa-077`, `qa-078`, `qa-081`, `qa-086`, `qa-082`, `qa-084`, `qa-087` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G1, G2, G4 |
| モバイル (mobile) | 対象外 | 理由: mobile: 端末内にデータを保存しない。スマホ・タブレットのブラウザからWeb経由でD1/R2を読み書きする(qa-036で中立に再確認) |
| タブレット (tablet) | 対象外 | 理由: tablet: 端末内にデータを保存しない。スマホ・タブレットのブラウザからWeb経由でD1/R2を読み書きする(qa-036で中立に再確認) |
| デスクトップ (Windows) (desktop-windows) | 対象外 | 理由: desktop-windows: Claude Code連携スキルは一時ファイル(書き出しCSV・字幕・切り出し画像)のみ扱い、永続データはWeb側D1/R2だけに置くためローカルDBを持たない(qa-015『DB/画面なし』・qa-026) |
| デスクトップ (Linux) (desktop-linux) | 対象外 | 理由: desktop-linux: Claude Code連携スキルは一時ファイル(書き出しCSV・字幕・切り出し画像)のみ扱い、永続データはWeb側D1/R2だけに置くためローカルDBを持たない(qa-015『DB/画面なし』・qa-026) |
| デスクトップ (macOS) (desktop-macos) | 対象外 | 理由: desktop-macos: Claude Code連携スキルは一時ファイル(書き出しCSV・字幕・切り出し画像)のみ扱い、永続データはWeb側D1/R2だけに置くためローカルDBを持たない(qa-015『DB/画面なし』・qa-026) |

## 対象外の承認範囲

> 本章の対象外セルが引用している承認の実体。状態表の「承認: <id>」だけでは、その承認が何をどこまで認めたものかを章から辿れない。

### 承認: `appr-002`

対象platformはweb(レスポンシブ)とClaude Code実行用desktop(macOS/Windows/Linux)。mobile/tabletのネイティブアプリは作らないことをユーザーが選択(2026-09-21T09:37:58Z)

## 上流指針 (doctrine anchors)

> 本章の設計判断が従う上流の正本 (1 concern 1 authority)。具体技術ではなく上流工程を導く規範であり、下位の技術選定は本節と矛盾してはならない。正本: `ref-system-design-knowledge/references/doctrine-anchor-registry.json`

| 設計 concern | 上流の正本 (authority) | 導く範囲 | 出典 | 最終確認 | 本章の確定セルへの反映 |
|---|---|---|---|---|---|
| data-access | Robert C. Martin — Clean Architecture | 永続化を境界の外側へ追い出し interface adapter で隔離する | Clean Architecture — gateways/repositories boundary | 2026-07-12 | [qa-020/qa-026] D1はrepositories(metricsRepo/reportsRepo/actionsRepo/mediaRepo)に、R2はmediaStoreアダプタに閉じ込め、ユースケース層はD1/R2 APIを直接呼ばない。各repoはuser_idを必須引数に取る。 [qa-066/qa-070/qa-071] consent_records は追記のみとし、ログイン試行を数えるテーブルは持たずに書込行数を増やさない。 channelsRepo(1テナント1チャンネル。channel_id の UNIQUE 違反を ChannelTakenError に変換・qa-081)、oauthPendingRepo、usageRepo(usage_counters/usage_snapshots)、auditRepo を加え、同じく tenant_id を必須引数とする。 |
| reliability | Google SRE | SLO/エラーバジェット・冗長性・スケーリング・監視の上流指針 | https://sre.google/books/ | 2026-07-12 | [qa-020/qa-018/qa-049/qa-052/qa-058] D1 Free枠上限到達時はクエリがエラーになるため、収集はupsertで再実行可能にし失敗したテナントは Queues の自動再試行(最大3回・10分間隔)で再取得する(qa-049/qa-058)。値が変わった行だけ書き、D1の書込10万行/日に対してテナント上限100で余裕を残す(qa-052)。週次でwrangler d1 exportをGitHub Actionsで取得しバックアップとする。 チャンネル変更は連携解除→旧チャンネルの行を7日以内に削除→再連携の順で行い、別チャンネルのデータが混ざらないようにする(qa-075/qa-086)。 |

> **未記入** の行は、上流の正本を掲げただけで本章の確定内容へ反映した箇所を示せていない。表への出現は反映の証拠ではない。

## 確定内容 (質疑録)

> 本章の各確定セルが何を根拠に確定したかの実体。`qa_ref` が主たる接地根拠、`qa_refs` がそれを支える裏付け質疑であり、いずれも qa_log (spec-state.json) の逐語である。ここに現れない主張は本章の確定内容ではない。

### Web (web)

- 資するゴール: G1, G2, G4

#### 主たる接地根拠: `qa-079`

**問**

設定画面・チャンネル紐付け・共通レイアウトの詳細設計(画面に見えないバックエンド/DB/セキュリティ/運用を含む)をこの内容で確定してよいか

**答**

この内容で承認(詳細設計をプレビュー表示)。提示した他の案: 修正してから承認。承認内容: [共通レイアウト] AppShell=Sidebar(ロゴ・テナント切替・ナビ5項目、900px未満は下部タブ)+Header(画面名・最終更新=収集/取込の新しい方・期間28日/90日/1年/任意を?period=で全画面共有・アバターメニュー)+main+Footer(3バッジ『OAuthは読み取り専用(字幕ON時は字幕のみ追加許可)』『データは利用者ごとに分離』『無料枠で運用』+プライバシーポリシー|利用規約。ログイン・静的ページも同じFooter)。共通部品 PageHeader/SectionCard/StatusBadge/DataTable(狭幅でカード化)/UsageBar/DropZone(+ファイル選択ボタン)/ConfirmDialog(危険操作は名前入力)/Toast/デザイントークン。[設定画面] 順序 YouTube連携→データ取込→Claude Code連携トークン→メンバー(オーナーのみ・既存qa-041〜)→無料枠の使用状況→データを削除。連携カード=アイコン・チャンネル名・登録者数(表示のみ)・状態(正常/要再連携/未連携)・次回収集(毎日3:00 JST)・最終収集/最終CSV取込・付与スコープ・字幕自動取得トグル・再連携・連携解除。チャンネル選択=OAuth(prompt=select_account consent)→channels.list mine=true→1つ選択→確定。ブランドアカウントはGoogleのアカウント選択で選ぶ旨を案内。同じチャンネルが別テナントに連携済みなら拒否。再連携は同じチャンネルのみ、変更は連携解除から。字幕ON=追加同意→新着動画の字幕を毎日収集で取得(1日上限10本=2000units)、OFF=revoke→読み取り専用で再連携。取込=タブ別DropZoneと履歴(ファイル名/期間/行数/取込日時/状態+失敗理由・最新20件)。トークン=名前必須・平文は発行時1回表示・1人5本まで・失効は確認付き。無料枠=YouTube Data API units/D1書込/D1容量/R2容量/Workersリクエスト+テナント数、80%黄/95%赤。[バックエンド] GET /api/settings, POST /api/youtube/connect, GET /api/oauth/callback, GET /api/youtube/channel-candidates, POST /api/youtube/channel, POST /api/youtube/reconnect, DELETE /api/youtube/connection, PUT /api/youtube/captions-auto, GET/POST /api/imports, GET/POST/DELETE /api/skill-tokens, GET /api/usage, POST /api/tenant/delete。[DB] channels(UNIQUE tenant_id・UNIQUE channel_id・status)/oauth_pending(10分・暗号化)/oauth_tokens.granted_scopes/tenants.captions_auto/skill_tokens.name/imports(kind統合)/usage_counters/usage_snapshots/audit_log。[セキュリティ] 連携・解除・字幕・削除はオーナーのみ/force-sslはcaptions.downloadだけ/CF_ANALYTICS_TOKEN(Account Analytics Read)はWorkers Secrets/Origin検査/トークン発行のレート制限/監査ログ。[インフラ・運用] Cronは増やさない(無料枠の外部値は画面表示時に1時間キャッシュ)/runbook『チャンネルを変更する』を追加

> **訂正あり** — 直上の答は凍結された記録であり、後から次の訂正が入っている。
> 本文中の記述と食い違う場合は、訂正側が正である。
>
> - `2026-09-24T00:52:00Z` — 承認内容のうち2つの値は、その後の個別確認で置き換えた。(1) 字幕自動取得の『1日上限10本=2000units』→ qa-082 で『1日5本=1,000units』。(2) 無料枠バーの『80%黄/95%赤』→ qa-084 で『70%黄/90%赤』。現行の規範は qa-082/qa-084 の値で、qa-079 のその他の承認内容は変更なし。qa-081(別テナント連携の拒否)・qa-083(トークン1人5本)は qa-079 の値を個別に確認したもので変更なし。qa-085(force-ssl の検証を字幕トグル公開前に申請)は qa-079 に含まれない新しい論点。主根拠(qa_ref)を qa-079 のまま残すのは、10カテゴリにまたがる詳細設計の承認がこの一件で、個別確認の qa-081〜085 は qa_refs に追加して項目単位の根拠にしているため

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(詳細設計をプレビュー表示・推奨表示なし)。内容を見たうえでの承認。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:09:29Z)

#### 裏付け質疑: `qa-003`

**問**

分析の対象にするデータ元はどれか

**答**

YouTube Analytics, CSVの手動取込 (GA4・Search Consoleは選択せず)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり / 回答時刻: 2026-09-21T09:30:09Z)

#### 裏付け質疑: `qa-010`

**問**

スキルの実行結果はシステムに何を反映するか

**答**

HTMLレポート本体, 結論・要因の要約, 改善アクションの管理

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり / 回答時刻: 2026-09-21T09:30:09Z)

#### 裏付け質疑: `qa-014`

**問**

技術選定4点(保存先/認証/定期収集/デプロイ)をどれにするか

**答**

Cloudflare D1に一本化 / Googleログイン一本(本番公開・未検証) / Cloudflare Cron Triggers / GitHub Actions + wrangler

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(公式根拠付き比較) / 回答時刻: 2026-09-21T09:46:41Z)

#### 裏付け質疑: `qa-016`

**問**

AI分析(プロンプト実行結果・情報取得結果からの分析結果)をどの粒度の画面で扱うか

**答**

参照画像(FINAL-UI 12-ai.png相当)のように、プロンプトで分析した内容や情報取得した内容から分析結果を出せるようにしておいてください。これぐらいの粒度で画面も作成してほしい。画像を作成してください。→ AI分析画面を①依頼(対象期間・補足指示・使用データ確認・Claude Code用プロンプトをコピー)②実行状況(タスクID・ステータス・進捗)③レポート(一覧・版・結果JSON取込とエラー表示・要約/主な発見/次に取るべきアクション/根拠データ・版履歴と2版比較)の3区画で構成する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: ユーザー追加指示(チャット原文+参照画像) / 回答時刻: 2026-09-21T09:52:46Z)

#### 裏付け質疑: `qa-020`

**問**

データベース(D1)の設計案(11テーブル・全テーブルuser_id・日別指標は同日上書きで再収集しても重複しない)で確定するか

**答**

この設計で確定

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き・推奨以外の代替案併記) / 回答時刻: 2026-09-21T12:26:05Z)

#### 裏付け質疑: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

#### 裏付け質疑: `qa-035`

**問**

YouTube API Developer Policies III.E.4 は、分析指標以外のAPIデータ(コメント本文・タイトル・サムネイルURL・字幕)の保存期間をどう定めているか(completeness evaluator r2 の要確認指摘の裏取り)

**答**

III.E.4(Last updated 2026-09-14): 認可トークンは同意が有効な間は保存可。YouTube Analytics/Reporting API由来の指標と統計値は30日ごとに認可の有効性を確認すれば無期限に保存可。それ以外のAuthorized Data(タイトル・コメント本文など)は30暦日以内に削除または再取得が必要。Non-Authorized Dataは限られた量を30日まで。利用者の削除依頼は7暦日以内に対応。

- (根拠の性質: コード・設定・公式文書で検証できる観測事実 / 出所: 公式文書の確認(WebFetch https://developers.google.com/youtube/terms/developer-policies)。仕様への当てはめ方はエージェントが導出 / 回答時刻: 2026-09-21T13:01:57Z)

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

#### 裏付け質疑: `qa-026`

**問**

スクリーンショット(画像)はどう扱うか

**答**

画像もシステムに保存: R2(無料10GB)を追加し縮小画像を保存してレポート画面で見られるようにする(保存先の決定をD1のみ→D1+R2へ変更)。サムネイルはData APIのsnippet.thumbnails、場面画像は手元動画からffmpegで切り出しまたは利用者のスクショ

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き・推奨以外の代替案併記) / 回答時刻: 2026-09-21T12:35:35Z)

#### 裏付け質疑: `qa-042`

**問**

1つのテナントには誰が入れますか?

**答**

招待で複数人: 作成者がオーナー。編集者・閲覧者を招待できる(設定画面にメンバー欄)。提示した他の案: 本人1人だけ / 今は1人・後で拡張可

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

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

#### 裏付け質疑: `qa-041`

**問**

テナントごとのデータは、どのように分けて保存しますか?

**答**

行で分け、将来DB分割できる形に: 今は1つのD1で全行にtenant_idを持たせて分け、テナント→DBの対応表を持って特定テナントだけ別DBへ移せるようにする。提示した他の案: 1つのDBで行ごとに分ける(対応表なし) / テナントごとにDBを1つ(無料はD1が10個まで)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者の要望『ユーザーごとにテナントを作成できるように』を受けたAskUserQuestion 3択(推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-048`

**問**

YouTube Studio のCSVの各列は、YouTube Analytics API / Reporting API / Data API のどれで自動取得できるか。1日1回収集の無料枠内の構成は(利用者の要望『1日に1回取得』『CSVも自動でAPIから取得可能か』の裏取り)

**答**

公式ドキュメント(2026-09-21 13:43〜13:48Z 確認)による。視聴回数・総再生時間・平均視聴時間・平均再生率・登録者増減・高評価・コメント・共有・カード・トラフィックソース・視聴者属性・Shorts区別(creatorContentType)・視聴者維持率=Analytics API(reports.query)。インプレッション数・インプレッションCTR=Reporting API の channel_reach_basic_a1 のみ(2026-01-15提供開始・Analytics APIには無い)。終了画面=Reporting API のみ。ユニーク視聴者数=どのAPIでも取得不可(uniques は2016-10-31廃止)。Reporting API はジョブ作成から約48時間で日次CSVが出始め、作成前30日分の過去分を生成し、それより前は取得不可。通常レポートは60日・過去分は30日で取得不能になり、YouTubeがデータを直すと同じ期間の修正版が新しいIDで出る。Analytics の数値は通常48〜72時間の処理遅延があり、後から値が変わりうる。Analytics/Reporting API のクォータ数値は非公開(Cloud Consoleで確認)。Data API は10,000 units/日、captions.download は200 units かつ youtube.force-ssl と動画の編集権限が必要。Workers Free は1実行サブリクエスト50(D1呼出しも含む)・CPU 10ms・Cron Trigger 5本、D1 Free は書込10万行/日(索引更新も数える)。規約 III.E.4(https://developers.google.com/youtube/terms/developer-policies, 2026-09-14更新): 『Your API Clients must not (i) replace API Data with similar, independently calculated data, or (ii) access or use API Data to create new or derived data or metrics.』。例外はIII.Lの監査済み開発者のみ。YouTube利用規約(https://www.youtube.com/t/terms, 2023-06-01発効)は、検索エンジンと事前の書面許可を除き自動化された手段でのアクセスを禁じる。

- (根拠の性質: コード・設定・公式文書で検証できる観測事実 / 出所: バックグラウンド調査(公式ドキュメントのみ)と、保存済み開発者ポリシー本文・YouTube利用規約の原文確認をアシスタントがまとめた観察事実。利用者への質問ではない / 回答時刻: 2026-09-21T14:03:14Z)

#### 裏付け質疑: `qa-049`

**問**

API からの自動収集は、どの頻度にしますか?

**答**

毎日1回: すべての数値を毎日取得し、直近7日を取り直して修正も反映する。提示した他の案: 毎日+一部(視聴者属性・維持率)は週1回 / 週1回のまま

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者の提案『APIやCSVは1日に1回取得する形に』を受け、qa-048の調査結果を示したうえでのAskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:59:04Z)

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

#### 裏付け質疑: `qa-054`

**問**

API と CSV の両方に、同じ日・同じ動画・同じ指標の値があるときは、どう扱いますか?

**答**

両方保存し出典を表示: API 由来と CSV 由来を別々に保存し、画面では出典(API/CSV)のバッジを付けて表示する。提示した他の案: API の値を優先 / 後から取り込んだ方を優先

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 3択(推奨表示なし)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:59:04Z)

#### 裏付け質疑: `qa-062`

**問**

ログイン画面を docs/screens/01-login.png の通りにするにあたり、既存の確定仕様・実装との差分は何か

**答**

観測した差分: (1) 表記: 現行 LoginPage は見出し『YouTube分析』・説明『Google アカウントでログインします。』。画像はテキストロゴ『Channel Insight』・見出し『YouTubeの実績から、次の一手を。』・説明『Googleアカウントでログインすると、YouTube Analyticsの読み取り連携も同時に行います』。(2) 権限一覧: 画像は『YouTubeチャンネル情報の閲覧/YouTube Analyticsレポートの閲覧/メールアドレス』を各『読み取り専用』バッジ付きで表示。現行は無し。(3) スコープ: auth章は scope=openid email youtube.readonly yt-analytics.readonly・access_type=offline・YouTube連携はオーナーだけ と確定済みだが、実装 src/http/google-oauth.ts は『openid email』のみ。(4) 同意: 画像は『プライバシーポリシーと利用規約に同意します』(順序が現行と逆)。現行は ?consent=1 のクエリだけで、同意した規約の版と日時をサーバに記録していない。(5) 画像には『このアプリはGoogleの検証前です。確認画面で「詳細」→「移動」を選んでください』の注意、カード下の『Googleのプライバシーポリシー』リンク、フッターの信頼表示3点(OAuthは読み取り専用/データは利用者ごとに分離/無料枠で運用)とプライバシーポリシー・利用規約リンクがある。現行は無し。(6) 画像はティールの主ボタン・棒グラフ型ロゴマーク・薄いグラフ線の背景を描くが、共通デザイン正本 docs/screens/prompts/_shared.prompt.txt は主操作マゼンタ・ロゴマーク自作なし・装飾なし と定める。

- (根拠の性質: コード・設定・公式文書で検証できる観測事実 / 出所: 既存コード・仕様の読解 (web/pages/LoginPage.tsx, src/http/google-oauth.ts, src/http/auth-routes.ts, system-spec/auth.md, docs/screens/prompts/*.prompt.txt) と画像の目視)

#### 裏付け質疑: `qa-063`

**問**

画像と共通デザイン正本(主操作=マゼンタ・ロゴマーク自作なし・背景装飾なし)が食い違っています。どちらを正にしますか?

**答**

正本を優先 (レイアウトと文言は画像どおり、色・ロゴ・背景は現行正本に合わせる)。提示した他の案: 画像を正・全画面に波及[推奨] / 画像を正・ログイン画面だけ

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(推奨案明示)。回答時刻は未計測で、記録書込時刻 2026-09-24T00:05:04Z が上限値 / 回答時刻: 2026-09-24T00:04:42Z)

#### 裏付け質疑: `qa-064`

**問**

招待リンクから参加する編集者・閲覧者にも、ログイン時に YouTube/Analytics の読み取り権限を求めますか?(既存仕様では YouTube 連携はオーナーだけ)

**答**

招待時はメールだけ: 新規登録(オーナー)は画像どおり3権限。招待経由のログインは権限一覧を『メールアドレス』だけに切り替え、YouTube 権限を求めない。提示した他の案: 全員に3権限を求める

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(推奨案明示)。回答時刻は未計測で、記録書込時刻 2026-09-24T00:05:04Z が上限値 / 回答時刻: 2026-09-24T00:04:42Z)

#### 裏付け質疑: `qa-065`

**問**

Google の確認画面で利用者が YouTube の権限のチェックを外した場合(部分許可)、どうしますか?

**答**

ログインは通し連携を促す: ログイン・テナント作成は完了させ、ダッシュボードと設定に『YouTube 連携が未完了です・再連携』を出す。付与スコープはサーバで検証し保存する。提示した他の案: ログインを止める

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(推奨案明示)。回答時刻は未計測で、記録書込時刻 2026-09-24T00:05:04Z が上限値 / 回答時刻: 2026-09-24T00:04:42Z)

#### 裏付け質疑: `qa-070`

**問**

ログイン刷新の詳細仕様(アシスタントが qa-062〜qa-069 の骨格から具体化した DB・API・セキュリティ・UI・アクセシビリティ・E2E の内容。プレビューを提示)を仕様の規範節へ入れてよいか

**答**

このまま承認: プレビューの内容を auth/ui-ux/frontend/security/backend/database 各章の規範節(本章での適用・上流指針の反映)へ入れる。項目ごとの内容確認は行っていない一括承認であり、実装で食い違いが見つかれば個別に見直す。提示した他の案: 先に全文を見たい

> **訂正あり** — 直上の答は凍結された記録であり、後から次の訂正が入っている。
> 本文中の記述と食い違う場合は、訂正側が正である。
>
> - `2026-09-24T00:48:35Z` — 承認範囲の縮小: プレビュー中の試行回数制限(10分20回)・CSP の中身・規約改定時の再同意条件は推奨付きの一括承認だったため、本承認の範囲から外し、推奨なしの個別質問 qa-071(制限を設けない)・qa-072(自サイトとGoogle認証だけ許可)・qa-073(次回ログインで再同意)で確定し直した。login_rate_limits と RATE_LIMITED は qa-071 により仕様から削除。

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(推奨案明示)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:26:16Z)

#### 裏付け質疑: `qa-071`

**問**

ログイン開始(Google への遷移)の試行回数制限をどの値にするか(選択肢: 10分に20回/1分に5回/1時間に60回/制限を設けない。推奨は示していない)

**答**

『一番費用がかからない内容で、ユーザーに負荷もかからない内容で進めてほしい』(自由回答)。この2条件を両方満たす選択肢は『制限を設けない』だけ(D1 への書込0・正当な利用者が制限に当たらない)なので、アプリ側の試行回数制限は設けない。

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 推奨を付けない選択肢提示・1問ずつ。answered_at はトランスクリプトの tool_result 時刻 / 回答時刻: 2026-09-24T00:41:12Z)

#### 裏付け質疑: `qa-074`

**問**

設定画面をどう変えるか(利用者の追加指示)

**答**

docs/screens/05-settings.png の通りに設定画面を作る(YouTube連携カード: チャンネル名・登録者数・状態バッジ・次回収集・付与スコープ・字幕自動取得トグル・再連携・連携解除 / データ取込: CSV・字幕(SRT・VTT)・画像のタブとドロップ領域と取込履歴表 / Claude Code連携トークン: 名前・作成日・最終使用・失効と新規発行 / 無料枠の使用状況: YouTube Data API・D1書込・D1容量・R2画像・Workersリクエストのバー / データを削除)。画面に見えないバックエンド・設定・追加機能も定義する。YouTubeのどのアカウント(チャンネル)と紐付けるかの設定を追加する。ヘッダーとフッターは共通化し、共通化できる部分は全て共通化する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者のチャット原文による直接指示(画像添付 docs/screens/05-settings.png)。時刻はセッション内で最初に date -u で実測した値(指示時刻の上限値) / 回答時刻: 2026-09-24T00:06:45Z)

#### 裏付け質疑: `qa-075`

**問**

1つのテナントに紐付けるYouTubeチャンネルの数と、切り替え時の扱いはどうするか(Googleアカウントは複数のチャンネル/ブランドアカウントを持てる)

**答**

1テナント1チャンネル。OAuth後にチャンネル一覧(channels.list mine=true)から1つ選ぶ。別チャンネルへ変えるときは連携解除→旧データを7日以内削除→再連携。提示した他の案: 1テナント複数チャンネル / 1チャンネル・切替時は旧データ保持

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 選択肢提示(AI推奨表示あり)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:06:45Z)

#### 裏付け質疑: `qa-076`

**問**

画像の『字幕を自動取得する(youtube.force-ssl)』トグルは確定仕様(qa-058: force-sslは要求しない)と矛盾する。どうするか

**答**

画像通りトグルを実装する。既定OFF。ONにした人だけ追加同意(incremental authorization)でforce-sslを付与しcaptions.download(1本200units)を使う。OFFに戻すとforce-sslを含むトークンをrevokeし読み取り専用で再連携する(qa-058の『force-sslは要求しない』を置換)。提示した他の案: トグルは表示のみ(準備中) / トグルを置かない

> **訂正あり** — 直上の答は凍結された記録であり、後から次の訂正が入っている。
> 本文中の記述と食い違う場合は、訂正側が正である。
>
> - `2026-09-24T00:33:05Z` — 本文の『qa-058: force-sslは要求しない』は置換元の誤記。qa-058 は収集時刻(毎日 JST 3:00)の回答で force-ssl に触れていない。force-ssl の方針の出所は qa-025(D-transcript=hybrid)と design_applications.auth の『force-sslは追加同意時のみ要求する段階的認可』であり、qa-076 はそれを置換せず具体化したもの(トグル既定OFF・ON時だけ追加同意・OFFでrevoke)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 選択肢提示(AI推奨表示あり)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:06:45Z)

#### 裏付け質疑: `qa-077`

**問**

画像の『次回収集 9/27(日) 毎時』は旧仕様(週1回・日曜毎時)の文言で、確定仕様は『毎日JST 3:00』。どちらに合わせるか

**答**

現行仕様の毎日JST 3:00で表示する(例『次回収集 9/25(木) 3:00 毎日』)。画像の文言だけ差し替え、収集スケジュールは変えない。提示した他の案: 画像通り週1回・毎時に戻す

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 選択肢提示(AI推奨表示あり)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:06:45Z)

#### 裏付け質疑: `qa-078`

**問**

『無料枠の使用状況』はシステム全体の値。誰に表示し、どう計測するか

**答**

全員に表示し、テナント横断の個別情報は出さず合計だけを出す。YouTube Data API unitsとD1書込行数はアプリ内カウンタで計測し、D1容量・R2容量・Workersリクエスト数は読み取り専用トークンでCloudflare GraphQL Analytics APIから取得して1時間キャッシュする。提示した他の案: 運営者だけに表示 / 自前計測のみ

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 選択肢提示(AI推奨表示あり)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:06:45Z)

#### 裏付け質疑: `qa-081`

**問**

同じYouTubeチャンネルを別テナントが連携しようとした場合どうするか(qa-079一括承認からの項目分割)

**答**

拒否する。1チャンネルは1テナントにだけ連携でき、先に連携した側が連携解除するまで後から来た側はエラーにする(channels.channel_id の UNIQUE 制約とAPIの409で強制)。提示した他の案: 許可する(各テナントが別々に収集)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 個別選択(AI推奨表示あり・qa-079一括承認の項目分割の再質問)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:31:35Z)

#### 裏付け質疑: `qa-086`

**問**

要件定義書 U9 の I1 を『Googleでログインし、OAuth後に自分のYouTubeチャンネルを1つ選んで読取専用で連携する(1テナント1チャンネル。変更は連携解除→旧データを7日以内に削除→再連携)。字幕の自動取得を希望する人だけ force-ssl を追加で許可する』へ更新してよいか

**答**

この内容で更新する。提示した他の案: I1は変えない

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(AI推奨表示あり)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:33:05Z)

#### 裏付け質疑: `qa-082`

**問**

字幕自動取得(captions.download 1本200units)の1日の上限本数(qa-079一括承認からの項目分割)

**答**

1日5本(1,000units/日)。qa-079 承認内容の『1日上限10本=2000units』をこの値で置換する。上限を超えた新着動画は翌日以降の毎日収集へ持ち越す。提示した他の案: 1日10本(推奨)/1日20本

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 個別選択(AI推奨表示あり・qa-079一括承認の項目分割の再質問)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:31:35Z)

#### 裏付け質疑: `qa-084`

**問**

無料枠の使用状況バーの警告色の閾値(qa-079一括承認からの項目分割)

**答**

70%で黄・90%で赤。qa-079 承認内容の『80%黄/95%赤』をこの値で置換する。提示した他の案: 80%黄・95%赤(推奨)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 個別選択(AI推奨表示あり・qa-079一括承認の項目分割の再質問)。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T00:31:35Z)

#### 裏付け質疑: `qa-087`

**問**

YouTube連携(チャンネル紐付け)で使う Google Cloud の OAuth クライアントを、アプリ共通の1つにするか、テナントごとに利用者が自分の Google Cloud プロジェクトのものを持ち込むか(利用者ごとに API の使用先=プロジェクト・クォータ・同意画面が異なるため)

**答**

テナントごとに必須で持ち込む。オーナーが設定画面で自分の Google Cloud プロジェクトの OAuth クライアントID とクライアントシークレットを登録するまで『連携』ボタンは押せない。チャンネル連携・コールバック・トークン交換・更新・revoke・字幕の追加同意は、そのテナントのクライアントで行う。Googleログイン自体はテナントが決まる前なのでアプリ共通のクライアントのまま。シークレットは TOKEN_ENC_KEY で暗号化して保存し、画面・APIには返さない。登録の変更・削除は既存の連携トークンを無効にするため『要再連携』にする。これにより D-auth の『ログインとYouTube連携を1回の同意で完結』と、クォータ・100人上限をアプリ共通で数える前提(qa-021)は、YouTube連携についてはテナントごとのプロジェクト単位に置き換わる。提示した他の案: アプリ共通のクライアントのまま(推奨)/ 任意で持ち込み(未登録なら共通を使う)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 択一(AI推奨表示あり)。利用者の発話『テナントごとに各ユーザーごとで設定できるように…ユーザーごとによってこのAPI使う先が違う』を受けた質問。回答後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-24T07:28:46Z)

## To-Be / Delta

> 本章の**規範**。上位概念 (要件定義書 U3 ゴール / U4 目標 / U9 具体的やりたいこと) を本章の serves_goals で絞り込んだ射影であり、設計知識 card (非規範の参考資料) とは役割が異なる。As-Is (現行実装の姿) は spec-state.json の管轄外のため本節では断定せず、到達点と、その到達を判定する観測点だけを規範として置く。

### 到達すべき状態 (To-Be)

- **G1**: YouTube Analyticsの実績データ(API連携+CSV取込+字幕・画像ファイル)をテナントごとに継続的に収集・集計できる
- **G2**: Claude Code上で実行したreport-design-systemの分析結果(HTML・結論/要因の要約・改善アクション)がシステムへ反映され、直近5回の分析履歴を踏まえながら週次の5段階原因指標と下流の結果指標を分けて閲覧し、目標未達の最大候補を管理・効果比較できる
- **G4**: 他の利用者にも提供でき、利用者ごとに作られるテナントの単位でデータを分け、そのテナントのメンバー(オーナー/編集者/閲覧者)だけが権限の範囲でアクセスできる

### 受入条件 (Delta の判定点)

| 目標 | 到達点 | 達成の観測点 (measure) |
|---|---|---|
| O1 | 全テナントの定期収集(毎日1回JST 3:00。Analytics APIは直近7日を取り直し、インプレッション・CTRはReporting APIから取得)がCloudflare Cron Triggersで自動実行される | 28日連続で、毎日09:00 JST時点で当日の収集が終わっていないテナント0件 |
| O2 | Claude Codeからの1回のスキル実行でデータ取得→分析(数値・心理・週次ファネル)→システム反映まで完了する | 初期設定後、反映までの手作業ステップ0。判定可能な週は5原因指標のactual/target/target_gapと目標未達の改善候補1件を表示し、判定不能または全指標目標達成の週はその理由を表示する |
| O4 | テナント間のデータ越境と権限外の操作をなくす | 認可テストで他テナントのデータ(D1行・R2画像)取得成功0件、閲覧者の書込操作成功0件 |

### 本章がかなえる具体的やりたいこと (U9)

- **I1**: Googleでログインし、OAuth後に自分のYouTubeチャンネルを1つ選んで読取専用で連携する(1テナント1チャンネル。変更は連携解除→旧データを7日以内に削除→再連携)。字幕の自動取得を希望する人だけ force-ssl を追加で許可する(qa-075/qa-076/qa-085・qa-086で更新)
- **I2**: YouTube Studio CSV(表データ/グラフデータ/合計)と週次事業CSVを手動取込し、出典付きで保存する。YouTube派生指標M1〜M10はStudio CSV由来だけで計算する。事業CSVと同一週Studio CSVから導線誘導率=route_visits/views×100、問い合わせ→成約率=closed_deals/inquiries×100を計算し、週次5段階原因指標と結果指標をダッシュボードに分けて表示する
- **I3**: Cronで毎日1回、Analytics API(日別指標・動画別・流入元・視聴者属性・維持率)とReporting API(インプレッション・CTR)から取得し、出典(API)付きで保存する
- **I4**: Claude Codeで /yt-analyze を実行するとシステムからYouTubeデータ、週次事業ファネル、同一テナント・同一チャンネルの直近5回の分析履歴パックを取得し、report-design-systemで前回仮説の当否・施策効果・目標未達の最大候補・次の打ち手・下流結果を含む差分分析HTMLを作りシステムへアップロードする
- **I5**: 運営者はlaunchdで週次にI4を自動実行する。一般利用者は手動実行
- **I6**: 改善アクションを対象ファネル段付きで未着手/実施中/効果測定中/完了として管理し、次回レポートで対象原因指標と売上・成約数等の下流結果を前後比較する
- **I9**: 字幕・画像・コメント・維持曲線を取り込み、Claude Codeで人の考え・感情・行動を推定した心理分析レポートを作る
- **I10**: 初回ログインで自分のテナントが作られ、招待リンクでメンバーを追加してオーナー/編集者/閲覧者の権限で共有する

### 本章に効く確定意思決定

- **D-ai-engine**: AI分析の実行エンジンをどれにするか(Gemini API無料枠の扱いを含む)
  - 採択: Claude Code上のreport-design-systemスキル(利用者各自のPCで実行し結果をアップロード) (`claude-code-skill`)
  - 目的適合: 数値再現(analysis.mjs)+結論→要因→打ち手HTMLという既存資産をそのまま使えG2に直結
- **D-db**: データ・HTMLレポート・画像の保存先をどれにするか
  - 採択: D1(構造化データ・HTML)+R2(画像: サムネイル・場面画像・スクショ) (`d1-r2`)
  - 目的適合: 画像をレポート画面で見られるため心理分析(サムネ訴求・離脱場面)の根拠提示に適合しG1/G2/G4を満たす
- **D-auth**: Web画面のログインとYouTube連携の認証をどうするか
  - 採択: Google OAuth一本(同意画面を本番公開・未検証) (`google-oauth-published`)
  - 目的適合: 新規登録(オーナー)はログインとYouTube連携を1回の同意で完結し、部分許可でもログインは通して後から再連携できる(qa-065)。招待メンバーはメールだけを要求する(qa-064)。G1/G4に適合
- **D-cron**: YouTubeデータの定期収集をどこで動かすか
  - 採択: Cloudflare Cron Triggers (`cf-cron`)
  - 目的適合: D1と同じ基盤で全利用者分を収集しG1に適合
- **D-transcript**: 動画の文字起こし(字幕)をどう取得するか
  - 採択: 両方に対応(既定は手元取込、希望者だけ追加同意でAPI自動取得) (`hybrid`)
  - 目的適合: readonly利用者と自動化希望者の両方を満たす

### 週次売上ファネル追補（ユーザー追加要件）

- `business_funnel_weekly`: `tenant_id, channel_id, week_start, route_label, route_visits, inquiries, closed_deals, revenue_jpy, imported_at, imported_by`。`week_start` はJST月曜、`route_label` は省略時 `LINE`。主キーは `(tenant_id, channel_id, week_start)` とし、同じ週の再取込は同一キーを上書きする冪等upsertとして扱う。数値の空欄はnull、0は実測0として区別する。
- `funnel_targets`: `tenant_id, channel_id, metric_id, target_value, min_sample, effective_from`。主キーは `(tenant_id, channel_id, metric_id, effective_from)`。対象週以前で最新の設定を使う。`metric_id` は `impressions | ctr | weighted_retention_m1 | lead_route_rate | inquiry_close_rate` の閉列挙とする。
- `lead_route_rate = route_visits / views * 100`。`views` は同じ `tenant_id, channel_id, week_start` に属するStudio CSV由来の週次視聴回数だけを使う。`inquiry_close_rate = closed_deals / inquiries * 100`。
- `target_gap = (actual - target_value) / target_value`。`target_value > 0`かつ判定可能で、`target_gap < 0`の原因指標だけを候補にし、その中で最小のものを「最大の改善候補」とする。全指標が0以上なら「全指標目標達成」とし、候補を作らない。因果関係は表さない。
- `min_sample`と比較する`sample_count`は、`impressions=impressions`、`ctr=impressions`、`weighted_retention_m1=engaged_views`、`lead_route_rate=views`、`inquiry_close_rate=inquiries`とする。
- 選択週はJST月曜00:00から翌月曜00:00まで。翌月曜を迎えていない、またはStudio CSV・週次事業CSVのいずれかの最新取込が週末より前なら鮮度不足とする。過去の確定週に一律TTLは設けない。
- 分母0、入力欠損、`target_value <= 0`またはtarget未設定、`min_sample`未達、鮮度不足はnullのまま判定保留にし、理由コードをAPI・レポートへ渡す。売上・成約数・登録者数は結果指標であり、登録者数は参考表示とする。
- `inquiry_close_rate`は同一週集計の運用スナップショットで、問い合わせ発生週へ成約を帰属するコホート率ではない。APIはこの意味を`rate_basis=same_week_snapshot`として返す。
- 分析履歴パックは既存の`reports`、`findings`、`actions`を`tenant_id + channel_id`で絞り、完了済みレポートを新しい順に最大5版だけ射影する。履歴専用の重複テーブルを増やさず、返却した版番号を新規レポートの`history_versions_used`に保存する。
- MVPの外部事業データproviderは週次manual CSVのみ。YouTube API由来行から新しい率を計算せず、M1と`views`は既存どおりStudio CSV由来に限定する。

この追補により既存テーブルを削除・統合しない。次回dev-graph compileで正本digestと派生feature/taskを再同期する。

## 適用された設計知識

> 以下の deep knowledge card は設計判断を支援する**非規範の参考資料**であり、実装済み・検証済みの証拠ではない。カード内の `採否: applied` は設計採用を意味し、実装状態は意味しない。規範となる差分は本章の To-Be / Delta 節と参照先仕様で管理する。

### 本章での適用

[承認 qa-037/appr-005・一括承認] 骨格は各[利用者確定 qa-…]で利用者が選択肢から選んだ範囲。列名・エンドポイント名・集約と不変条件・テスト値・保持と削除のCronなどの詳細はアシスタントが骨格から詳しくしたもので、利用者は qa-037 の3択(このまま承認/未承認のまま進める/先に内容を見たい)から『このまま承認』を選び、一括で承認した。項目ごとの内容確認は行っていないため、実装で食い違いが見つかれば個別に見直す。承認範囲の明細は qa-038。[利用者確定 qa-014/qa-020] 保存先はD1(構造化データ)+R2(画像)(qa-026でD1のみから変更)。基本11テーブル: users / channels / oauth_tokens / daily_metrics(PK tenant_id,channel_id,date) / video_metrics / csv_imports / analysis_requests(A-0001形式, 待機中|実行中|完了|失敗) / reports(版管理, html≤2,000,000 bytes) / findings / actions(未着手|実施中|効果測定中|完了, 判定 効果あり|不明|効果なし) / skill_tokens。[qa-025/026/027/029の機能決定に伴う追加テーブル(列はAI設計)] video_period_metrics(表データ.csvの21列を期間付きで保存。空欄=null・0=実測0を区別) / video_daily_metrics(グラフデータ.csv) / channel_daily_metrics(合計.csv) / video_angles(切り口: つまずき解決型|是非・意見型|追加型, 確定者) / retention_points(video_id, elapsed_ratio, audience_watch_ratio, relative_retention) / transcripts(video_id, source srt|vtt|whisper|captions_api, start_ms, end_ms, text) / media_assets(video_id, kind thumbnail|scene|screenshot, at_ms, r2_key, width, height, bytes) / comments(comment_id, video_id, published_at, text, like_count) / comment_emotions(comment_id, emotion Plutchik8種, intent 質問|共感|反論|体験談, report_id) / psych_findings(report_id, layer 考え|感情|行動, claim, evidence_json, counter_hypothesis, confidence)。全業務テーブルにtenant_id(操作した人のuser_idも保持)。設計知識(DDD)の適用: 集約は『レポート版(reports+findings+psych_findings+comment_emotions)』と『改善アクション(actions)』の2つに分け、版は追記のみ(過去版を更新しない)を不変条件とする。actionsの状態遷移は 未着手→実施中→効果測定中→完了 の一方向のみ許し、完了時に判定(効果あり/不明/効果なし)とbaseline/resultを必須にする。video_anglesは利用者確定後に再分析で上書きしない。[qa-035] 指標以外のAPIデータを持つ行(videosのタイトル等・comments・APIで取った字幕)にfetched_atを持たせ、30日超の行を掃除できるようにする。レポート版にはコメント本文を持たず、comment_idで参照する。[利用者確定 qa-041〜qa-045・内容承認 qa-046/appr-007 マルチテナント] 追加テーブル: tenants(tenant_id, name, db_binding 既定'DB', created_by, created_at, deleted_at) / tenant_members(tenant_id, user_id, role owner|editor|viewer, joined_at, PK tenant_id,user_id) / tenant_invites(invite_id, tenant_id, email, role editor|viewer, token_hash SHA-256, expires_at 発行+7日, accepted_at, revoked_at, created_by)。既存の全業務テーブル(channels〜psych_findings・skill_tokens・oauth_tokens)にtenant_idを持たせ、主キーと索引の先頭をtenant_idにする(daily_metrics は PK tenant_id,channel_id,date)。user_idは『操作した人』の記録として残す(reports/actions/csv_importsの作成者)。R2キーは tenants/<tenant_id>/… で分ける。将来の分割: tenants.db_binding から参照先D1を決める解決関数を1か所だけに置く(既定は全テナント同じDB)。[利用者確定 qa-049〜qa-055・qa-058・調査 qa-048・内容承認 qa-056/appr-009・qa-059/appr-010 毎日収集] 出典で表を分ける(qa-054): API由来=daily_metrics(PK tenant_id,channel_id,date,content_type。content_typeはcreatorContentType)・video_metrics(PK tenant_id,video_id,date。単日指定の動画別クエリを毎日積み上げる)・traffic_source_daily(PK tenant_id,date,source_type)・audience_demographics(PK tenant_id,snapshot_date,age_group,gender)・video_reach_daily(PK tenant_id,video_id,date。video_thumbnail_impressions と video_thumbnail_impressions_ctr をAPIの値のまま保存し、CTRを自前計算しない・report_id と fetched_at を持つ)。CSV由来=既存の video_period_metrics / video_daily_metrics / channel_daily_metrics(csv_import_id を持つ)。同じ日・同じ指標でも上書きせず両方残す。派生指標M1〜M10はCSV由来の表だけから計算する(qa-053)。書込量の抑制: upsert前に値を比べ、変わった行だけ書く。索引は主キーのみ(索引の更新も書込行数に数えるため)。tenants に reporting_job_id と reporting_created_after、last_collected_date を追加。 [利用者確定 qa-062〜qa-069・qa-071〜qa-073・観測 qa-062/qa-067・内容承認 qa-070/appr-012 ログイン刷新。試行回数制限・CSP・規約改定時の再同意は qa-070 の承認範囲から外し、qa-071〜qa-073 の個別回答で確定] consent_records(id TEXT PK, user_id TEXT NOT NULL REFERENCES users, terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL, consented_at TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('login','reconsent')))。追記のみで更新しない。利用者の現在の同意は user_id ごとに consented_at が最大の行。索引は (user_id, consented_at) を1つだけ加える(ログインのたびに再同意の要否を引くため)。ログイン試行の回数を数えるテーブルは作らない(qa-071)。tenants に youtube_link_status TEXT NOT NULL DEFAULT 'none' CHECK(youtube_link_status IN ('none','partial','linked')) を追加。oauth_tokens.scope は付与された実スコープ(スペース区切り)を保存する(既存列の意味を『要求』ではなく『付与』と明確にする)。アカウント削除時は consent_records も削除する。[利用者確定 qa-074〜qa-078・qa-080〜qa-086・内容承認 qa-079/appr-013・I1更新 qa-086/appr-014 設定画面・チャンネル紐付け・共通レイアウト] channels(tenant_id UNIQUE・channel_id UNIQUE・title・thumbnail_url・subscriber_count(表示のみ)・status=正常/要再連携/未連携・connected_at)で1テナント1チャンネルを表す(qa-075)。channel_id の UNIQUE で同じチャンネルの別テナント連携を DB でも拒否する(qa-081)。oauth_pending(state・PKCE verifier・候補チャンネル一覧を暗号化・有効10分)で OAuth 後のチャンネル選択を保持し、確定時に削除する。oauth_tokens.granted_scopes に付与スコープを保存し、字幕トグルは tenants.captions_auto(既定0)に持つ(qa-076)。skill_tokens に name(必須)を追加し、発行はユーザーごとに5本まで(qa-083)。CSV・字幕・画像の取込履歴は imports(kind・file_name・period・rows・status・error・created_at)へ統合し、設定画面は最新20件を読む。無料枠は usage_counters(日付×種類の自前カウンタ: YouTube units・字幕取得本数)と usage_snapshots(Cloudflare GraphQL の取得値の1時間キャッシュ)に分ける(qa-078)。連携・解除・字幕切替・トークン発行/失効・削除は audit_log(tenant_id・user_id・action・at)に残す。チャンネル変更は連携解除で旧チャンネルの行を7日以内に削除してから新チャンネルを連携する(qa-075/qa-086)。

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 記録時刻: 2026-09-24T00:48:35Z)

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
| cloudflare-d1 | 2026-04-21 | Cloudflare (developers.cloudflare.com) | https://developers.cloudflare.com/d1/platform/pricing/ | 2026-09-21T09:50:54Z | 2026-09-21T09:50:54Z |
| cloudflare-r2 | 2026-08-07 | Cloudflare (developers.cloudflare.com) | https://developers.cloudflare.com/r2/pricing/ | 2026-09-21T12:40:23Z | 2026-09-21T12:40:23Z |
