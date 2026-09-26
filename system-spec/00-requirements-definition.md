---
status: confirmed
category: requirements-definition
---

# 要件定義書 (上位概念)

> 本章は spec-state.json の requirements_foundation を正本とする、システム構築の憲法。
> 以降の各技術章は frontmatter の serves_goals でここ (ゴール) へトレース (anchor) する。
> 上位概念がブレなければ、仕様が整った後もブレない。

- 確定マーカー: `status: confirmed`

## U1 本質的目的 (essential_purpose)

YouTubeチャンネルの実績データと週次の事業CSVを、再現可能な数値分析とAI(Claude Code上のreport-design-systemスキル)による改善提案へ変換する。インプレッション、CTR、加重平均視聴率M1、導線誘導率(既定表示はLINE誘導率)、問い合わせ→成約率を原因指標、売上・成約数を結果指標、登録者数を参考の結果指標として分け、目標未達の最大候補と『次に何をすべきか』を根拠付きで判断・実行・効果検証できる状態を、費用0円で自分と他のクリエイターに提供する。改善候補は因果推論ではなく週次実績と設定目標の比較である。

## U2 背景 (background)

YouTube Studioでは数値は見られるが、伸びた/落ちた要因と次の打ち手を根拠付きで出すのに手間がかかる。Google AI Studio(Gemini API)が無料で使えるか・範囲が不明で、AI分析の手段と費用範囲を明確にしたい。一方で数値をコードで再現し結論→要因→打ち手のHTMLを作るClaude Codeスキル(report-design-system)という既存資産があり、これをシステムと接続したい。

## U3 ゴール (goals)

| ID | ゴール |
|---|---|
| G1 | YouTube Analyticsの実績データ(API連携+CSV取込+字幕・画像ファイル)をテナントごとに継続的に収集・集計できる |
| G2 | Claude Code上で実行したreport-design-systemの分析結果(HTML・結論/要因の要約・改善アクション)がシステムへ反映され、直近5回の分析履歴を踏まえながら週次の5段階原因指標と下流の結果指標を分けて閲覧し、目標未達の最大候補を管理・効果比較できる |
| G3 | Gemini API/YouTube API/Cloudflare/GitHub/Google Cloudの無料範囲と必要設定が公式根拠付きで明確になり、完全無料で構築・運用できる |
| G4 | 他の利用者にも提供でき、利用者ごとに作られるテナントの単位でデータを分け、そのテナントのメンバー(オーナー/編集者/閲覧者)だけが権限の範囲でアクセスできる |
| G5 | 画面はシンプルな少数構成で、改善アクションとレポートを迷わず管理できる |

## U4 目標 (objectives)

| ID | 目標 | 測定基準 |
|---|---|---|
| O1 | 全テナントの定期収集(毎日1回JST 3:00。Analytics APIは直近7日を取り直し、インプレッション・CTRはReporting APIから取得)がCloudflare Cron Triggersで自動実行される | 28日連続で、毎日09:00 JST時点で当日の収集が終わっていないテナント0件 |
| O2 | Claude Codeからの1回のスキル実行でデータ取得→分析(数値・心理・週次ファネル)→システム反映まで完了する | 初期設定後、反映までの手作業ステップ0。判定可能な週は5原因指標のactual/target/target_gapと目標未達の改善候補1件を表示し、判定不能または全指標目標達成の週はその理由を表示する |
| O3 | 運用費を0円に保つ | Cloudflare/Google Cloud/GitHubの月次請求額0円、無料枠使用率80%超でアラート |
| O4 | テナント間のデータ越境と権限外の操作をなくす | 認可テストで他テナントのデータ(D1行・R2画像)取得成功0件、閲覧者の書込操作成功0件 |
| O5 | 画面数を最小限に保つ | 主要画面6枚以内(ログイン含む・qa-030)+規約の静的ページ2枚。各画面で最初に見える情報ブロックは4つ以内 |

## U5 成功基準 (success_criteria)

- 自分のチャンネルで週次レポートが自動生成されシステムで閲覧できる
- 改善アクションを登録→実施→次回レポートで前後比較できる
- 第三者アカウントでYouTube連携→CSV取込→Claude Codeスキル実行→反映が手順書どおりに完了する
- 月次請求額0円
- Gemini APIの無料範囲・制約が出典付きで文書化されている
- 招待した閲覧者が同じテナントのダッシュボードを見られ、他テナントのデータには到達できない
- 同じ日のAPI由来とCSV由来の値が出典バッジ付きで並び、派生指標がCSV由来のデータだけから計算されている
- 週次の原因指標(インプレッション、CTR、M1、導線誘導率、問い合わせ→成約率)と結果指標(売上、成約数、登録者数は参考)が分離され、目標未達の最大候補、全指標目標達成、または判定保留理由が表示される
- 新しい分析が同一テナント・同一チャンネルの直近5回の結論・要因・改善アクション・効果比較を踏まえ、前回仮説の当否と施策効果の差分を示す

## U6 ステークホルダー (stakeholders)

- 運営者兼利用者(本人): 自分のチャンネルの売上ファネルで目標差が大きい段階と次の打ち手を毎週根拠付きで知りたい。PCでClaude Codeを定期実行できる
- 他のYouTubeクリエイター(一般利用者): 自分のチャンネルデータを連携し、自分のClaude Codeでスキルを実行して改善提案を得たい
- Google(API提供者): OAuth同意画面・API利用規約・クォータを遵守させる立場
- Anthropic Claude Code(各利用者の実行環境): 各利用者自身のプランで分析を実行

## U7 スコープ (scope)

- **対象 (in)**: Googleログイン、初回ログインでのテナント自動作成、1つのD1でtenant_idによる行分離(将来テナント単位で別DBへ移せる)、招待リンクでのメンバー追加とオーナー/編集者/閲覧者の3権限, YouTube Analytics API/YouTube Reporting API/YouTube Data APIの読取連携(OAuth)。字幕の自動取得は追加同意者のみforce-ssl, YouTube Studio CSV手動取込(表データ/グラフデータ/合計の3種)と週次事業CSV手動取込(MVPの外部事業データproviderはこれだけ)。事業CSVはweek_start(JST月曜), channel_id, route_label(既定LINE), route_visits, inquiries, closed_deals, revenue_jpyを持つ, Cloudflare Cron Triggersによる毎日1回(JST 3:00)の定期取得(Cloudflare Queuesでテナントごとに分けて実行)と、Reporting APIによるインプレッション・CTRの自動取得, 文字起こし(SRT/VTT/Whisper取込・希望者はcaptions.download)と画像(サムネイル・場面画像・スクショ)の取得とR2保存, コメント取得(commentThreads.list)と視聴維持曲線の取得, 人の考え・感情・行動を推定する心理分析(コメント感情・離脱場面・台本と話し方・サムネ/タイトル訴求・アナリティクス全般)をClaude Codeで実行しレポート化, CSV起点のダッシュボードと分析内容の定義(docs/analysis/dashboard-analysis-catalog.md), Claude Code用連携スキル(データ取得→report-design-system実行→結果反映), 個人アクセストークン発行と反映API, HTMLレポート保存・閲覧、結論/要因要約、改善アクション管理, 運営者用のローカル定期実行(launchd), Gemini API/AI Studio無料範囲の調査・比較記録, Cloudflare(Workers/D1/R2)/GitHub/Google Cloudの設定手順
- **対象外 (out)**: GA4・Search Console連携(今回データ元として選択されていない), アプリ内でのLLM呼び出し(Gemini含む。調査・比較記録のみ), 因果推論・予測・機械学習(スキルの対象外), 有料プラン前提の機能, 動画アップロード・メタデータ更新などYouTubeへの書込操作, 多数の画面・複雑な管理機能, APIデータからの派生指標の作成(規約III.E.4。III.Lの個別許可を得ていない), 画面の自動操作(Codexのコンピュータユース等)によるYouTube Studioからの取得(YouTube利用規約の自動アクセス禁止)

## U8 制約 (constraints)

- 費用: 完全無料(Cloudflare Free/Google Cloud無料/GitHub無料枠)。有料tierへの自動移行をしない
- 技術: Cloudflare Workers + D1 + R2(画像保存・qa-026)をAIDDキット標準として採用。秘密情報はwrangler secretのみ(INV-1)
- AI実行: Claude Codeは各利用者のPCで各自のプランを使う。システム側はLLMを呼ばない(心理分析もClaude Code側で行う)
- Google: ログインはアプリ共通のOAuthクライアント(openid/email/profile のみ・機密スコープなし)。YouTube連携は各テナントが自分のGoogle CloudプロジェクトのOAuthクライアントを登録して行い(qa-087)、同意画面の検証要否とAPIクォータ(10,000 units/日)はそのプロジェクト単位で数える(qa-097)
- 心理分析は推定であり、根拠データ・反証条件・確信度を必ず付ける。因果推論・予測・機械学習は行わない
- 規約: APIで取得したデータから派生指標を作らない(YouTube API Developer Policies III.E.4)。派生指標はCSV由来のデータだけで計算し、公式の値でない旨を画面に明示する
- 規模: Cloudflare Queues の無料枠(1万操作/日・安全予算8,000)と D1 無料枠(書込10万行/日)に収めるため、テナント数の上限を75とする(上限到達時は新規テナントを作らない。qa-110 で100から変更)

## U9 具体的にやりたいこと (concrete_intents)

| ID | やりたいこと | 資するゴール |
|---|---|---|
| I1 | Googleでログインし、OAuth後に自分のYouTubeチャンネルを1つ選んで読取専用で連携する(1テナント1チャンネル。変更は連携解除→旧データを7日以内に削除→再連携)。字幕の自動取得を希望する人だけ force-ssl を追加で許可する(qa-075/qa-076/qa-085・qa-086で更新) | G1, G4 |
| I2 | YouTube Studio CSV(表データ/グラフデータ/合計)と週次事業CSVを手動取込し、出典付きで保存する。YouTube派生指標M1〜M10はStudio CSV由来だけで計算する。事業CSVと同一週Studio CSVから導線誘導率=route_visits/views×100、問い合わせ→成約率=closed_deals/inquiries×100を計算し、週次5段階原因指標と結果指標をダッシュボードに分けて表示する | G1, G2 |
| I3 | Cronで毎日1回、Analytics API(日別指標・動画別・流入元・視聴者属性・維持率)とReporting API(インプレッション・CTR)から取得し、出典(API)付きで保存する | G1 |
| I4 | AI分析画面で依頼A-xxxxを作り、コピーしたプロンプトをClaude Codeに貼り付けて /yt-analyze を実行する。スキルはシステムからYouTubeデータ、週次事業ファネル、同一テナント・同一チャンネルの直近5回の分析履歴パックを取得し、report-design-systemで前回仮説の当否・施策効果・目標未達の最大候補・次の打ち手・下流結果を含む差分分析HTMLを作る。結果は自動送信、または画面へJSONを貼り付けて取り込む(qa-093・qa-097) | G2 |
| I5 | 運営者はlaunchdで週次にI4を自動実行する。自動実行ではスキルが個人トークンで依頼を作ってから分析する(qa-095)。一般利用者は画面から依頼して手動実行する | G2 |
| I6 | 改善アクションを対象ファネル段付きで未着手/実施中/効果測定中/完了として管理し、次回レポートで対象原因指標と売上・成約数等の下流結果を前後比較する | G2, G5 |
| I7 | Gemini API無料枠・YouTube API・Cloudflare・GitHubの無料範囲と設定手順を文書化する | G3 |
| I8 | 画面はログイン/ダッシュボード/動画/AI分析(レポート)/改善アクション/設定の6枚+規約の静的ページ2枚に絞る(qa-030) | G5 |
| I9 | 字幕・画像・コメント・維持曲線を取り込み、Claude Codeで人の考え・感情・行動を推定した心理分析レポートを作る | G1, G2 |
| I10 | 初回ログインで自分のテナントが作られ、招待リンクでメンバーを追加してオーナー/編集者/閲覧者の権限で共有する | G4 |

## 確定の接地根拠 (承認)

> 上の `status` を確定たらしめている利用者承認の実体。承認範囲がここに現れない項目は、本章の確定内容ではない。

### 承認: `appr-018`

qa-110: U8 制約の『テナント数の上限100』を Queue 予算に合わせて75へ更新することを利用者が承認(U1-U9 の他項目は appr-011/appr-014 のまま)(main 統合時の注記: main 側で U7 の Google 行・I4・I5 が appr-016 で改訂済み。本承認はそれに加えて U8 の上限だけを変える)

### 承認: `appr-016`

qa-097: 要件定義書 U7(Google 行)・I4・I5 の改訂案をプレビューで見たうえで利用者が承認

### 承認: `appr-014`

qa-086: U9 I1 を qa-075/qa-076/qa-085 に合わせて更新することを利用者が承認(U1-U9 の他項目は appr-011 のまま)

### 承認: `appr-011`

qa-060: 利用者の直接指示により、週次売上ファネルの5原因指標をダッシュボードと分析の主軸にし、登録者数を参考の結果指標へ分離した

### 承認: `appr-010`

qa-059: 収集を毎日JST 3:00の1回+Cloudflare Queues に変えた詳細設計(Cron1本に統合・Queues設定・再試行)と上位概念(O1・scope.in[3])の改訂を、プレビューで内容を見たうえで利用者が承認

### 承認: `appr-004`

qa-030: 上位概念I8/O5を『主要画面6枚(ログイン含む)+規約の静的ページ2枚』へ改訂することを利用者が選択

### 承認: `appr-001`

U1-U9要約をAskUserQuestionで提示しユーザーが承認(2026-09-21T09:34:28Z)

## 意思決定支援 (decisions)

| ID | 論点 | 状態 | 選択肢 (費用・適合・注意点) | AI推奨 | ユーザー決定 | 資するゴール |
|---|---|---|---|---|---|---|
| D-ai-engine | AI分析の実行エンジンをどれにするか(Gemini API無料枠の扱いを含む) | confirmed | claude-code-skill:Claude Code上のreport-design-systemスキル(利用者各自のPCで実行し結果をアップロード) / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '利用者各自の既存Claude Code契約内で追加費用0。システム側のLLM費用は0'} / free=システム側の従量課金なし(各自の契約範囲に依存) / fit=数値再現(analysis.mjs)+結論→要因→打ち手HTMLという既存資産をそのまま使えG2に直結 / pros=既存スキル資産を流用, システムにLLM費用・APIキーが不要 / cons=各利用者がClaude Codeを用意する必要 / risks=スキル仕様変更時に連携部の追従が必要 / lock-in=中(スキル形式に依存) / ops=中(スキル配布と更新手順) / evidence=https://docs.claude.com/en/docs/claude-code/overview<br>gemini-free:Workersから Gemini API Free tier(Flash/Flash-Lite)を呼ぶ / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '無料枠内0円。ただしレート上限はAI Studio表示のみで保証なし'} / free=RPM/TPM/RPDはプロジェクト単位・AI Studioで確認、太平洋時間0時リセット / fit=アプリ内で完結し自動化しやすい / pros=アプリ内で完結, 最新Flashに無料枠あり / cons=入力データが改善に利用される, 上限値非公開・非保証 / risks=他者データを送ると規約・信頼上の問題 / lock-in=中(Gemini API) / ops=低 / evidence=https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/rate-limits, https://ai.google.dev/gemini-api/terms<br>gemini-paid:Gemini API Paid tier(3.1 Flash-Lite等) / cost={'category': 'low-cost', 'amount': 1, 'currency': 'USD', 'billing_period': 'month', 'tco': '3.1 Flash-Liteで入力$0.25/出力$1.50 per 1M token。月数ドル程度の従量'} / free=無料枠なし(従量課金) / fit=アプリ内で完結しデータは改善に使われない / pros=データ取扱いが明確, 自動化しやすい / cons=完全無料方針に反する / risks=従量課金の膨張 / lock-in=中 / ops=低 / evidence=https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/terms | claude-code-skill — ユーザー指定のスキル資産をそのまま使え、完全無料方針と他者データの取扱いリスクを同時に満たすため。Geminiは無料で使えるが入力が改善に使われるため比較記録に留める (注意: Gemini無料枠の上限値はAI Studioでのみ確認でき保証されない, Claude Codeは利用者各自の契約が前提; confidence=high; checked=2026-09-21T09:40:00Z) | claude-code-skill @ 2026-09-21T09:30:09Z | G2, G3 |
| D-db | データ・HTMLレポート・画像の保存先をどれにするか | confirmed | d1-only:Cloudflare D1に一本化(HTMLもD1) / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': 'Free枠内0円。構築はmigrationのみ、撤退はSQLite dumpで容易'} / free=読取500万行/日・書込10万行/日・合計5GB、UTC0時リセット、1行上限約2MB / fit=実績・要約・アクション・HTMLを1か所で管理しG1/G2/G4に適合 / pros=サービス1つで管理が簡単, SQLで効果比較しやすい / cons=2MB超のHTMLは保存不可 / risks=無料枠超過時はクエリがエラー / lock-in=低(SQLite互換) / ops=低 / evidence=https://developers.cloudflare.com/d1/platform/pricing/, https://developers.cloudflare.com/d1/platform/limits/<br>d1-r2:D1(構造化データ・HTML)+R2(画像: サムネイル・場面画像・スクショ) / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': 'Free枠内0円(R2 Standard 10GB-month・Class A 100万/月・Class B 1,000万/月・egress無料)。保存先が2つになるが用途で明確に分かれる'} / free=D1: 読取500万行/日・書込10万行/日・5GB。R2: 10GB-month/月・Class A 100万/月・Class B 1,000万/月(Standardのみ) / fit=画像をレポート画面で見られるため心理分析(サムネ訴求・離脱場面)の根拠提示に適合しG1/G2/G4を満たす / pros=画像をシステム内で閲覧できる, D1の1行2MB上限に画像を載せずに済む / cons=保存先が2つ, 容量管理(古い場面画像の整理)が必要 / risks=10GB超過で課金対象になるため容量メーターと整理手順が必要 / lock-in=中(S3互換API) / ops=中 / evidence=https://developers.cloudflare.com/r2/pricing/, https://developers.cloudflare.com/d1/platform/pricing/<br>d1-kv:D1 + Workers KV(HTML本体はKV) / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': 'Free枠内0円。保存先が2つになり運用手順が増える'} / free=KV無料は1GB・書込1,000回/日 / fit=大きなHTMLに強い / pros=大容量HTMLに対応 / cons=保存先が2つ, 書込回数上限が小さい / risks=整合性ずれ / lock-in=中 / ops=中 / evidence=https://developers.cloudflare.com/d1/platform/pricing/, https://developers.cloudflare.com/kv/platform/pricing/ | d1-only — 画面数を増やさず管理しやすく、無料枠で十分なため (注意: HTMLは取込時に2MB上限を検査し超過は拒否, 画像を扱う場合はD1に載せず別ストアが必要(qa-026で利用者がR2追加を選択); confidence=high; checked=2026-09-21T09:40:00Z) | d1-r2 @ 2026-09-21T12:35:35Z | G1, G2, G4 |
| D-auth | Web画面のログインとYouTube連携の認証をどうするか | confirmed | google-oauth-published:Google OAuth一本(同意画面を本番公開・未検証) / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '0円。テナントごとにGoogle Cloudプロジェクトの準備工数(初回のみ)が発生'} / free=未検証公開は累計100ユーザーまで(警告画面あり)、refresh tokenはアカウント×クライアントで100本。YouTube連携分はテナントごとのプロジェクトで数える(qa-087) / fit=ログインはアプリ共通クライアントでメールだけを要求し(qa-064)、YouTube連携はテナントが登録した自分のGoogle CloudプロジェクトのOAuthクライアントで別の同意として行う(qa-087)。部分許可でもログインは通して後から再連携できる(qa-065)。G1/G4に適合 / pros=アプリ共通クライアントはログイン専用で機密スコープを持たない, 7日失効を回避, クォータと検証がテナントのプロジェクトに分かれる / cons=未検証の警告画面が出る / risks=テナントがGoogle Cloudの準備(8手順・qa-088)をしないと連携できない / lock-in=中(Google) / ops=低 / evidence=https://developers.google.com/identity/protocols/oauth2, https://support.google.com/cloud/answer/15549945, https://support.google.com/cloud/answer/13464323, https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification<br>cf-access-plus-oauth:Cloudflare Access + 別途Google OAuth / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '50人まで0円、以降$7/人/月'} / free=Access Free 50ユーザー / fit=入口保護が強い / pros=入口をゼロトラストで保護 / cons=ログイン2段・設定二重 / risks=設定不整合 / lock-in=中 / ops=中 / evidence=https://www.cloudflare.com/sase/products/access/, https://developers.google.com/identity/protocols/oauth2<br>google-oauth-testing:Google OAuthをテスト状態のまま / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '0円だが7日ごとの再連携工数'} / free=テストユーザー100人・refresh token7日失効 / fit=定期収集が7日で止まるためG1に不適 / pros=審査・公開不要 / cons=7日ごとに再連携 / risks=定期収集停止 / lock-in=中 / ops=高 / evidence=https://developers.google.com/identity/protocols/oauth2, https://support.google.com/cloud/answer/15549945 | google-oauth-published — YouTube連携にOAuthが必須。ログインはアプリ共通クライアントで最小構成にし、YouTube連携は各テナントのクライアントで行うことでクォータ・検証・100人上限をテナント単位に分け、公開状態で7日失効も避ける(qa-087) (注意: 未検証アプリの警告画面が出る(各テナントのプロジェクトごと), youtube.readonlyのsensitive区分はCloud Consoleで要確認, 検証申請とAPIクォータはテナントのGoogle Cloudプロジェクト単位。アプリ共通クライアントはログイン専用で機密スコープを持たないため、qa-021 の『80人超で検証申請』はアプリ共通クライアントには適用しない(qa-087), テナントのクライアント登録を変更・削除すると既存の連携トークンは無効になり『要再連携』になる(qa-087), 同意画面で利用者がYouTube権限のチェックを外せる(部分許可)。付与スコープをサーバで確認し、YouTube機能だけを止めて再連携を促す(qa-065), Sign in with Google ボタンは Google ブランド規定の Light/Dark/Neutral に限られ、デザイン正本の主操作色を使えない(qa-067), 字幕トグルON時だけ include_granted_scopes で youtube.force-ssl を追加し、OFFで revoke→readonly で再連携する(qa-076), force-ssl は sensitive scope。字幕トグルの一般公開前に検証を申請し(3〜5営業日・デモ動画・ドメイン確認・同一ドメインのプライバシーポリシー)、通るまでは運営者だけが使う(qa-085); confidence=medium; checked=2026-09-24T14:45:59Z) | google-oauth-published @ 2026-09-21T09:46:41Z | G1, G4 |
| D-cron | YouTubeデータの定期収集をどこで動かすか | confirmed | cf-cron:Cloudflare Cron Triggers / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '0円'} / free=Cron5個/アカウント、1回CPU10ms、サブリクエスト50/実行 / fit=D1と同じ基盤で全利用者分を収集しG1に適合 / pros=基盤が1つ, 待ち時間はCPU時間外 / cons=CPU10ms・サブリクエスト50の制約 / risks=利用者増でサブリクエスト上限 / lock-in=中 / ops=低 / evidence=https://developers.cloudflare.com/workers/platform/limits/, https://developers.google.com/youtube/v3/determine_quota_cost, https://developers.cloudflare.com/d1/platform/limits/, https://developers.google.com/youtube/reporting/v1/reports, https://developers.cloudflare.com/queues/platform/limits/<br>gh-actions-schedule:GitHub Actions schedule / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': 'privateで2,000分/月まで0円'} / free=2,000分/月 / fit=実装は容易 / pros=ログが見やすい / cons=他者トークンの扱い / risks=秘密情報の露出面増 / lock-in=中 / ops=中 / evidence=https://docs.github.com/en/billing/concepts/product-billing/github-actions | cf-cron — D1とトークンがWorkers内で完結し、他者データを外へ出さずに済む (注意: 1実行のサブリクエストは50件(1テナント約16件)。収集は毎日JST 3:00の1回(`0 18 * * *`、Cron TriggersはUTCで動く)で、Cronはテナントごとの通を Cloudflare Queues へ入れるだけにし、consumer(max_batch_size=1)が1通=1実行で1テナントを処理する(上限は qa-052 の100テナントを qa-110 で75テナントへ変更・qa-049/qa-058で確定。当初の `0 * * * 0` 週360人はqa-018), YouTube Data APIは10,000units/日, qa-033/qa-035 に伴い削除用Cron `0 18 * * *`(毎日JST3:00)を追加し計2本。30日を超えた指標以外のAPIデータ削除・失敗した削除の再試行・更新失敗30日超の利用者の指標削除を担う(Workers Free上限5本の範囲内)。qa-058 で収集も同じ `0 18 * * *` に統合し、Cron Triggerは計1本(削除処理も Queues の cleanup 通として実行), Reporting API(channel_reach_basic_a1)をテナント連携時にjobs.create。Analytics/Reportingのクォータ数値は非公開でCloud Consoleで確認(qa-048); confidence=high; checked=2026-09-21T14:20:00Z) | cf-cron @ 2026-09-21T09:46:41Z | G1, G3 |
| D-deploy | デプロイと秘密情報の管理をどうするか | confirmed | gh-actions-wrangler:GitHub Actions + wrangler(main push) / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': 'privateで2,000分/月まで0円'} / free=2,000分/月、Secretsはリポジトリ100個まで / fit=履歴と検証が自動化され保守しやすくG3に適合 / pros=デプロイ履歴, 自動検証 / cons=Free private ではEnvironments不可 / risks=APIトークン権限の過大設定 / lock-in=低 / ops=低 / evidence=https://docs.github.com/en/billing/concepts/product-billing/github-actions, https://docs.github.com/en/actions/reference/security/secrets, https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments<br>local-wrangler:手元からwrangler deploy / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '0円'} / free=なし / fit=最小構成 / pros=構成が単純 / cons=履歴・検証が人手頼み / risks=手順漏れ / lock-in=低 / ops=中 / evidence=https://developers.cloudflare.com/workers/wrangler/commands/ | gh-actions-wrangler — 保守運用を自動化し、秘密情報の置き場を明確に分けられる (注意: Environmentsは使えないためリポジトリSecretsで運用, CF APIトークンはWorkers/D1編集の最小権限; confidence=high; checked=2026-09-21T09:40:00Z) | gh-actions-wrangler @ 2026-09-21T09:46:41Z | G3 |
| D-transcript | 動画の文字起こし(字幕)をどう取得するか | confirmed | local-import:手元で取得して取込(YouTube Studioの字幕SRT/VTT、または手元動画をWhisperで文字起こし) / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '0円。API消費なし。利用者の手作業(字幕DL)かローカルWhisper実行が必要'} / free=API消費なし(Whisperはローカル実行・MIT License) / fit=readonlyスコープのままG1/G2を満たす / pros=スコープ追加なし, 0円 / cons=手作業が1手増える / risks=Whisperの誤認識 / lock-in=低 / ops=低 / evidence=https://github.com/openai/whisper, https://developers.google.com/youtube/v3/docs/captions/download<br>api-captions:captions.downloadで自動取得 / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '0円だが1本200 units(10,000 units/日の2%)'} / free=YouTube Data API 10,000 units/日。captions.downloadは200 units/回 / fit=自動化でO2に寄与 / pros=手作業なし / cons=強いスコープ, クォータ消費大 / risks=検証審査で説明負担が増える / lock-in=中 / ops=中 / evidence=https://developers.google.com/youtube/v3/docs/captions/download<br>hybrid:両方に対応(既定は手元取込、希望者だけ追加同意でAPI自動取得) / cost={'category': 'free', 'amount': 0, 'currency': 'USD', 'billing_period': 'month', 'tco': '0円。実装と許可管理(段階的認可)が複雑になる'} / free=追加同意者のcaptions.downloadのみ200 units/本 / fit=readonly利用者と自動化希望者の両方を満たす / pros=利用者が選べる / cons=実装量が増える / risks=同意状態の管理漏れ / lock-in=中 / ops=中 / evidence=https://developers.google.com/youtube/v3/docs/captions/download, https://github.com/openai/whisper | local-import — 読取専用スコープのまま0円で実現でき、未検証公開の同意画面の負担を増やさないため (注意: 自動化を望む利用者には手間が残る; confidence=medium; checked=2026-09-21T12:30:18Z) | hybrid @ 2026-09-21T12:35:35Z | G1, G2 |
