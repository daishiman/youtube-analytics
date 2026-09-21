---
status: confirmed
category: auth
aggregate: 確定
spec_cells: [auth.web, auth.mobile, auth.tablet, auth.desktop-windows, auth.desktop-linux, auth.desktop-macos]
serves_goals: [G1, G4, G2]
---

# 認証(ログイン) (auth)

- カテゴリ集約状態: **確定**
- 章確定マーカー: `status: confirmed`

## カテゴリ別収集状態

| プラットフォーム | 状態 | 根拠 |
|---|---|---|
| Web (web) | 確定 | 確定質疑: qa-044。裏付け質疑 (`qa_refs`): `qa-004`, `qa-008`, `qa-014`, `qa-021`, `qa-025`, `qa-037`, `qa-038`, `qa-015`, `qa-041`, `qa-042`, `qa-043`, `qa-045`, `qa-046`, `qa-047`, `qa-048`, `qa-050`, `qa-055`, `qa-056`, `qa-059` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G1, G4 |
| モバイル (mobile) | 対象外 | 理由: mobile: 専用アプリのログインは作らず、スマホ・タブレットのブラウザでも同じGoogleログインを使う(qa-036で中立に再確認) |
| タブレット (tablet) | 対象外 | 理由: tablet: 専用アプリのログインは作らず、スマホ・タブレットのブラウザでも同じGoogleログインを使う(qa-036で中立に再確認) |
| デスクトップ (Windows) (desktop-windows) | 確定 | 確定質疑: qa-015。裏付け質疑 (`qa_refs`): `qa-021`, `qa-037`, `qa-038`, `qa-046`, `qa-056`, `qa-059` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G4, G2 |
| デスクトップ (Linux) (desktop-linux) | 確定 | 確定質疑: qa-015。裏付け質疑 (`qa_refs`): `qa-021`, `qa-037`, `qa-038`, `qa-046`, `qa-056`, `qa-059` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G4, G2 |
| デスクトップ (macOS) (desktop-macos) | 確定 | 確定質疑: qa-015。裏付け質疑 (`qa_refs`): `qa-021`, `qa-037`, `qa-038`, `qa-046`, `qa-056`, `qa-059` — 本章の「確定内容 (質疑録)」へ接地根拠として併記。資するゴール: G4, G2 |

## 対象外の承認範囲

> 本章の対象外セルが引用している承認の実体。状態表の「承認: <id>」だけでは、その承認が何をどこまで認めたものかを章から辿れない。

### 承認: `appr-002`

対象platformはweb(レスポンシブ)とClaude Code実行用desktop(macOS/Windows/Linux)。mobile/tabletのネイティブアプリは作らないことをユーザーが選択(2026-09-21T09:37:58Z)

## 上流指針 (doctrine anchors)

> 本章の設計判断が従う上流の正本 (1 concern 1 authority)。具体技術ではなく上流工程を導く規範であり、下位の技術選定は本節と矛盾してはならない。正本: `ref-system-design-knowledge/references/doctrine-anchor-registry.json`

| 設計 concern | 上流の正本 (authority) | 導く範囲 | 出典 | 最終確認 | 本章の確定セルへの反映 |
|---|---|---|---|---|---|
| authentication | OWASP ASVS + Secrets Management Cheat Sheet | 認証方式・セッション・資格情報/シークレット/API キーの取扱いの上流指針 | https://owasp.org/www-project-application-security-verification-standard/ | 2026-07-12 | [qa-021] OAuth PKCE+stateでCSRFを防ぎ、セッションはサーバ側保存のランダムIDのみCookieへ。スキル用トークンはハッシュ保存・失効可能・最終使用日時を記録。force-sslは追加同意時のみ要求する段階的認可とする。 |
| security | OWASP ASVS + Secrets Management Cheat Sheet | 脅威モデル・入力検証・暗号化・監査ログの上流指針 | https://owasp.org/www-project-application-security-verification-standard/ | 2026-07-12 | [qa-021/qa-022] 認可はセッション/トークン→user_idの導出を唯一の経路とし、リクエストパラメータのuser_idを信用しない。利用者80人超で検証申請に着手し、100人上限到達で新規連携が止まる事態を避ける。 |

> **未記入** の行は、上流の正本を掲げただけで本章の確定内容へ反映した箇所を示せていない。表への出現は反映の証拠ではない。

## 確定内容 (質疑録)

> 本章の各確定セルが何を根拠に確定したかの実体。`qa_ref` が主たる接地根拠、`qa_refs` がそれを支える裏付け質疑であり、いずれも qa_log (spec-state.json) の逐語である。ここに現れない主張は本章の確定内容ではない。

### Web (web)

- 資するゴール: G1, G4

#### 主たる接地根拠: `qa-044`

**問**

テナントへの招待は、どう届けますか?

**答**

招待リンクをコピーして渡す: 招待先Googleアカウントのメールを登録し、発行されたリンク(7日有効)を自分で送る。そのアドレスでログインした人だけが参加できる。追加費用0円。提示した他の案: システムからメール送信(外部送信サービスの契約が必要)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

#### 裏付け質疑: `qa-004`

**問**

この仕組みを使う人は誰か

**答**

他の人にも提供したい

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり / 回答時刻: 2026-09-21T09:30:09Z)

#### 裏付け質疑: `qa-008`

**問**

他の利用者はAI分析をどう使うか

**答**

各自がClaude Codeで実行

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり / 回答時刻: 2026-09-21T09:30:09Z)

#### 裏付け質疑: `qa-014`

**問**

技術選定4点(保存先/認証/定期収集/デプロイ)をどれにするか

**答**

Cloudflare D1に一本化 / Googleログイン一本(本番公開・未検証) / Cloudflare Cron Triggers / GitHub Actions + wrangler

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(公式根拠付き比較) / 回答時刻: 2026-09-21T09:46:41Z)

#### 裏付け質疑: `qa-021`

**問**

認証(auth)の詳細案(Google OAuth2+PKCE・scope readonly2種・offline・同意画面は本番公開未検証・セッションCookie30日・Claude Code用個人トークン(平文は1回表示・DBはハッシュ)・利用者80人超で検証申請)で確定するか

**答**

この内容で確定(代替案: セッション7日+トークン90日期限 は不採用)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き・推奨以外の代替案併記) / 回答時刻: 2026-09-21T12:29:59Z)

#### 裏付け質疑: `qa-025`

**問**

(ユーザー追加要望『文字起こしやスクリーンショットなどの情報も取得した上で分析解析できるように』を受けて)動画の文字起こし(字幕)をどう取得するか

**答**

両方に対応: 基本は手元取込(YouTube Studioの字幕SRT/VTT、または手元動画をWhisperで文字起こし。youtube.readonlyのまま・0円)、希望者だけ追加同意でcaptions.download(youtube.force-ssl・1本200 units)による自動取得

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き・推奨以外の代替案併記) / 起点はユーザー追加指示(チャット原文 2026-09-21T12:26:19Z) / 回答時刻: 2026-09-21T12:35:35Z)

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

#### 裏付け質疑: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

#### 裏付け質疑: `qa-041`

**問**

テナントごとのデータは、どのように分けて保存しますか?

**答**

行で分け、将来DB分割できる形に: 今は1つのD1で全行にtenant_idを持たせて分け、テナント→DBの対応表を持って特定テナントだけ別DBへ移せるようにする。提示した他の案: 1つのDBで行ごとに分ける(対応表なし) / テナントごとにDBを1つ(無料はD1が10個まで)

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: 利用者の要望『ユーザーごとにテナントを作成できるように』を受けたAskUserQuestion 3択(推奨表示なし)。回答直後の記録時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T13:42:00Z)

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

#### 裏付け質疑: `qa-059`

**問**

qa-058 に合わせた改訂(収集を毎日JST 3:00の Cron 1回+Cloudflare Queuesでテナントごとに実行、削除処理を同じCronに統合してCron Triggerは1本、再試行は Queues の max_retries=3・10分間隔、上位概念の O1 と scope.in[3] の文言)で確定してよいですか?

**答**

この内容で承認(改訂箇所をプレビュー表示)。提示した他の案: 修正してから承認

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion 2択(改訂箇所をプレビュー表示・推奨表示なし)。内容を見たうえでの承認。回答直後に date -u で実測した時刻(選択時刻の上限値) / 回答時刻: 2026-09-21T14:24:26Z)

### デスクトップ (Windows) (desktop-windows)

- 資するゴール: G4, G2

#### 主たる接地根拠: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

- 裏付け質疑 `qa-021` — 本章の上掲に既出

- 裏付け質疑 `qa-037` — 本章の上掲に既出

- 裏付け質疑 `qa-038` — 本章の上掲に既出

- 裏付け質疑 `qa-046` — 本章の上掲に既出

- 裏付け質疑 `qa-056` — 本章の上掲に既出

- 裏付け質疑 `qa-059` — 本章の上掲に既出

### デスクトップ (Linux) (desktop-linux)

- 資するゴール: G4, G2

#### 主たる接地根拠: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

- 裏付け質疑 `qa-021` — 本章の上掲に既出

- 裏付け質疑 `qa-037` — 本章の上掲に既出

- 裏付け質疑 `qa-038` — 本章の上掲に既出

- 裏付け質疑 `qa-046` — 本章の上掲に既出

- 裏付け質疑 `qa-056` — 本章の上掲に既出

- 裏付け質疑 `qa-059` — 本章の上掲に既出

### デスクトップ (macOS) (desktop-macos)

- 資するゴール: G4, G2

#### 主たる接地根拠: `qa-015`

**問**

カテゴリ別の技術仕様をこの内容で確定してよいか(Web: D1一本化/Google OAuth一本/画面5つ/refresh token AES-GCM暗号化+Workers Secrets/sandbox iframe+CSP/Workers+D1+Cron/Hono REST+スキル連携API/軽量SPA/GitHub Actions+wrangler。Claude Code側: export→report-design-system→upload、個人トークン、自分のMacのみlaunchd週1、DB/画面なし)

**答**

この内容で確定する

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 出所: AskUserQuestion / 選択肢提示あり(プレビュー付き) / 回答時刻: 2026-09-21T09:49:06Z)

- 裏付け質疑 `qa-021` — 本章の上掲に既出

- 裏付け質疑 `qa-037` — 本章の上掲に既出

- 裏付け質疑 `qa-038` — 本章の上掲に既出

- 裏付け質疑 `qa-046` — 本章の上掲に既出

- 裏付け質疑 `qa-056` — 本章の上掲に既出

- 裏付け質疑 `qa-059` — 本章の上掲に既出

## To-Be / Delta

> 本章の**規範**。上位概念 (要件定義書 U3 ゴール / U4 目標 / U9 具体的やりたいこと) を本章の serves_goals で絞り込んだ射影であり、設計知識 card (非規範の参考資料) とは役割が異なる。As-Is (現行実装の姿) は spec-state.json の管轄外のため本節では断定せず、到達点と、その到達を判定する観測点だけを規範として置く。

### 到達すべき状態 (To-Be)

- **G1**: YouTube Analyticsの実績データ(API連携+CSV取込+字幕・画像ファイル)をテナントごとに継続的に収集・集計できる
- **G4**: 他の利用者にも提供でき、利用者ごとに作られるテナントの単位でデータを分け、そのテナントのメンバー(オーナー/編集者/閲覧者)だけが権限の範囲でアクセスできる
- **G2**: Claude Code上で実行したreport-design-systemの分析結果(HTML・結論/要因の要約・改善アクション)がシステムへ反映され、閲覧・管理・効果比較できる

### 受入条件 (Delta の判定点)

| 目標 | 到達点 | 達成の観測点 (measure) |
|---|---|---|
| O1 | 全テナントの定期収集(毎日1回JST 3:00。Analytics APIは直近7日を取り直し、インプレッション・CTRはReporting APIから取得)がCloudflare Cron Triggersで自動実行される | 28日連続で、毎日09:00 JST時点で当日の収集が終わっていないテナント0件 |
| O2 | Claude Codeからの1回のスキル実行でデータ取得→分析(数値・心理)→システム反映まで完了する | 初期設定後、反映までの手作業ステップ0 |
| O4 | テナント間のデータ越境と権限外の操作をなくす | 認可テストで他テナントのデータ(D1行・R2画像)取得成功0件、閲覧者の書込操作成功0件 |

### 本章がかなえる具体的やりたいこと (U9)

- **I1**: Googleでログインし、YouTubeチャンネルを読取専用で連携する
- **I2**: YouTube Studioから書き出したCSV(表データ/グラフデータ/合計)を、API収集と並ぶ主な取得手段として取り込み、出典(CSV)付きで保存する。派生指標M1〜M10はCSV由来のデータだけで計算しダッシュボードに表示する
- **I3**: Cronで毎日1回、Analytics API(日別指標・動画別・流入元・視聴者属性・維持率)とReporting API(インプレッション・CTR)から取得し、出典(API)付きで保存する
- **I4**: Claude Codeで /yt-analyze を実行するとシステムからデータCSVを取得しreport-design-systemでHTMLを作りシステムへアップロードする
- **I5**: 運営者はlaunchdで週次にI4を自動実行する。一般利用者は手動実行
- **I6**: 改善アクションを未着手/実施中/効果測定中/完了で管理し、次回レポートで前後比較する
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

[承認 qa-037/appr-005・一括承認] 骨格は各[利用者確定 qa-…]で利用者が選択肢から選んだ範囲。列名・エンドポイント名・集約と不変条件・テスト値・保持と削除のCronなどの詳細はアシスタントが骨格から詳しくしたもので、利用者は qa-037 の3択(このまま承認/未承認のまま進める/先に内容を見たい)から『このまま承認』を選び、一括で承認した。項目ごとの内容確認は行っていないため、実装で食い違いが見つかれば個別に見直す。承認範囲の明細は qa-038。[利用者確定 qa-014/qa-021] Google OAuth 2.0 Authorization Code+PKCE(Workers実装)。scope=openid email youtube.readonly yt-analytics.readonly、access_type=offline。同意画面は外部・本番公開・未検証(累計100人上限)で、利用者が80人を超えた時点でOAuth検証申請に着手する(判断者=運営者)。セッションはランダム256bit IDをHttpOnly/Secure/SameSite=Lax Cookie・有効30日。Claude Code用個人トークン(Bearer)は平文を発行時1回だけ表示しD1にはSHA-256ハッシュ、持ち主のuser_idの行だけ読み書き可。[qa-025] 字幕のAPI自動取得を希望する利用者だけ、設定画面から追加同意(youtube.force-ssl・incremental authorization)を行い、同意の有無をoauth_tokens.scopeで判定する。既定はreadonlyのみ。[利用者確定 qa-041〜qa-045・内容承認 qa-046/appr-007 マルチテナント] 初回ログインで tenants と tenant_members(role=owner) を作る。セッションは user_id と選択中の tenant_id を持つ。招待の受理は、リンクのトークンのハッシュが一致・7日以内・未使用・未取消で、かつログインしたGoogleアカウントの確認済みメールが招待先と一致したときだけ。Claude Code用トークンは (tenant_id, user_id) ごとに発行し、使える操作は発行者の役割の範囲まで。YouTube連携(OAuth)はオーナーだけが行い、oauth_tokensはテナントに属する。[利用者確定 qa-049〜qa-055・qa-058・調査 qa-048・内容承認 qa-056/appr-009・qa-059/appr-010 毎日収集] OAuthスコープは変更しない(yt-analytics.readonly で Reporting API も使える)。YouTube連携の完了時に Reporting API の jobs.create(channel_reach_basic_a1)を1回だけ実行し、job_id を tenants に保存する。字幕の API ダウンロード(youtube.force-ssl)は今回も要求しない。

- (根拠の性質: 利用者が代替案を見たうえで明示選択した決定 / 記録時刻: 2026-09-21T14:10:14Z)

### Secure by Design — deep knowledge card

- 出典カード: `ref-system-design-knowledge/references/secure-by-design.md`

#### 目的

利用者の注意や運用後のpatchへ安全性を押し付けず、systemのdefault、architecture、development lifecycleに安全な結果を組み込み、被害可能性と復旧費を下げる。

#### 解決する問題

- 認証・認可・data protectionが後付けで、business flowと矛盾する。
- defaultが過大権限/公開状態で、利用者の完全な設定に安全性が依存する。
- 単一防御の突破で全面侵害になり、検知・封じ込め・復旧の証拠が無い。
- dependency、secret、build、releaseの供給chain riskが製品境界外として放置される。

#### 適用条件

- identity、個人/機密data、金銭、外部入力、admin操作、multi-tenant boundaryを扱う全system。
- compromise時の影響がgoal、法規、信頼、運用継続を損なう。
- vendor/serviceを使う場合も、共有責任とfailure/exit planを明示できる。

#### 非適用条件

- security自体が不要なsystemは原則ない。asset/threatが極小ならcontrolを軽量化できるが、根拠付きrisk acceptanceが必要。
- controlがthreatを減らさず、accessibility/availability/safetyを重大に損なう場合はそのcontrolを採用しない。代替・補償統制を設計する。
- checklist準拠だけでproject固有のtrust boundaryとabuse caseを置き換えない。

#### トレードオフ・失敗モード

- friction、latency、delivery費、運用負荷が増えるため、risk reductionと明示的に釣り合わせる。
- security theaterとしてcontrol数だけ増やし、owner、evidence、responseを持たない。
- fail closedを無差別適用してavailability/safety incidentを起こす。degraded modeとbreak-glass監査が必要。
- secretを隠しても過大権限や長期credentialを残す、暗号化してもkey lifecycleを設計しない等の局所最適。
- free tier製品を価格だけで選び、audit、export、retention、MFA、incident support不足を見落とす。

#### goalへの寄与

- stakeholderの安全・信頼・継続性をsuccess criteriaへ変換し、threat/control/evidenceをgoalへトレースする。
- security controlは「導入済み」ではなく、阻止/検知/復旧時間、権限範囲、data exposureで効果を測る。
- 予算0制約でも、secure default、最小data、短命credential、標準機能、open-source検査を優先し、残余riskを隠さない。

## 最新ドキュメント出典

| 対象 | バージョン | 公式発行元 | 出典URL | 取得 | 最新確認 |
|---|---|---|---|---|---|
| google-oauth2 | 2026-05-26 | Google (developers.google.com) | https://developers.google.com/identity/protocols/oauth2 | 2026-09-21T09:50:55Z | 2026-09-21T09:50:55Z |
