# 実装要件: feat-login-redesign (ログイン画面刷新 Channel Insight)

- handoff target: `task-graph` (capability-build / task-graph build)
- graph snapshot: `.dev-graph/state/graph.json` revision 6 / `sha256:4a2214f0cc40b091c7ba5d276ce96d91044c5ee1dae6e17d451bcee102015143`
- package: `.dev-graph/published/feature-package-feat-login-redesign` / published digest `sha256:29168572259f12bd579bfd638d8873c2d090a586c249d7502922bbf951df0cf7`
- 本文書は実装コードを含まない。実装は下記 13 task spec を正本として task-graph build が行う。

## 1. 目的と範囲

feature node `feat-login-redesign` (confirmed / pass / readiness complete) を正本とする。

- 目的: ログイン画面を docs/screens/01-login.png の構成と文言どおりに刷新し、要求する権限・同意の記録・画面の防御を利用者に見える形で一致させて、初めての利用者が安心して Google ログインと YouTube 読取連携を始められるようにする
- 範囲 (in):
  - ログイン画面 UI/UX の刷新(web/pages/LoginPage.tsx): 画像どおりの中央カード構成と文言、共通デザイン正本の色(主操作マゼンタ)、Google ブランド規定の Light テーマ固定ボタン、未検証アプリ案内、Google のプライバシーポリシーリンク
  - 新規モードと招待モードの出し分け(招待はメールアドレス1行だけ・『○○のテナントに招待されています』表示)
  - 同意前はボタンを押せない状態と理由文、既知コードだけを日本語で出すエラー表示(CONSENT_OUTDATED 追加・未知コードは共通文言)
  - 共通コンポーネント ReadOnlyBadge / TrustFooter(ログインと規約2ページ) / YouTubeLinkBanner(ダッシュボード・設定の再連携案内)
  - 製品名『Channel Insight』を全画面のサイドバーロゴ・タブタイトル・規約2ページ・OAuth 同意画面のアプリ名に統一
  - GET /api/auth/config(権限一覧・規約の版・招待テナント名)と、表示ラベルを持つ唯一の定義 SCOPE_SETS・LEGAL_VERSIONS
  - OAuth callback の順序変更: 付与スコープの検証と保存、youtube_link_status(none/partial/linked)の更新、consent_records への追記、セッション確立
  - 部分許可時もログインを完了させ、オーナーだけが GET /api/auth/youtube/connect で YouTube 2スコープを再要求できる
  - 規約改定時は既存セッションを切らず、次回ログインで再同意を求める(source=reconsent)
  - D1 マイグレーション: consent_records(追記のみ・(user_id, consented_at) 索引1つ)と tenants.youtube_link_status の追加、アカウント削除時の consent_records 削除
  - SPA 本体の応答ヘッダ: 自サイトと Google 認証だけを許可する CSP・frame-ancestors 'none'・nosniff・Referrer-Policy・Permissions-Policy(_headers と API 共通 middleware)
  - プライバシーポリシーへの信頼表示3点(読み取り専用スコープ/テナント分離/無料枠運用と有料化の事前告知)の根拠記載
  - アクセシビリティとレスポンシブ(360px 横スクロールなし・タップ領域44pt 以上・見た目どおりの Tab 順・マゼンタのフォーカスリング)と Playwright 3サイズ E2E
- 範囲外 (out):
  - ログイン試行の回数制限とそのためのテーブル・Cron(qa-071 で設けないと確定)
  - Google OAuth の検証申請手続き(既存の『80人で検証申請』運用のまま)
  - テナント作成・招待・役割の仕組みそのもの(feat-platform-tenant-auth で実装済みの土台を使う)
  - YouTube データの収集処理(feat-youtube-daily-collection)
  - ダッシュボード・設定画面の本体機能(feat-web-screens-actions。本 feature は再連携バナーの差し込みだけを持つ)
  - レポート HTML の sandbox iframe 用ヘッダ(既存方針のまま)

## 2. 受入要件 (feature acceptance → task 写像)

| # | 受入要件 | 検証 task |
|---|---|---|
| A1 | ログイン画面が docs/screens/01-login.png と同じ並び・文言で表示され、Google ボタンは白地・枠#747775・標準Gロゴになっている | P01, P04, P06, P07 |
| A2 | 画面に出る権限一覧は GET /api/auth/config の応答だけから描かれ、/api/auth/login が要求する scope と一致する(新規3行・招待1行) | P02, P04, P05, P06 |
| A3 | 同意にチェックするまでボタンは押せず理由文が出る。同意してログインすると consent_records に現行の規約版で1行だけ追記される | P04, P05, P06, P07 |
| A4 | 規約の版がサーバの現行版と違う同意では /login?error=CONSENT_OUTDATED に戻り、再同意を求める文言が出る | P04, P05, P06 |
| A5 | YouTube 2スコープのどちらかを拒否してもログインとテナント作成は完了し、youtube_link_status=partial になって、ダッシュボードと設定に再連携バナー(オーナーだけボタン付き)が出る | P04, P05, P07 |
| A6 | GET /api/auth/youtube/connect をオーナー以外が呼ぶと 403 になる | P04, P06 |
| A7 | SPA 本体の応答に指定の CSP と frame-ancestors 'none' などのヘッダが付き、他サイトの iframe には表示されない | P04, P09 |
| A8 | 未知のエラーコードや Google の error_description は画面にもURLにも出ない | P04, P06, P09 |
| A9 | 360px 幅で横スクロールが出ず、キーボードだけで同意チェックからログインボタンまで操作できる(Playwright 390×844・820×1180・1440×900) | P04, P06, P09 |
| A10 | main への push で D1 マイグレーション(consent_records・youtube_link_status)と deploy が完了する | P13 |

番号単位の詳細な対応表(根拠 qa 番号・検証方法)は P01 の成果物 `docs/feat-login-redesign/requirements.md` で確定する(plan evaluator low 指摘)。

## 3. 実行 task (exact 13・前向き DAG)

P01 要件確定 → P02 構成設計 → P03 設計レビュー → P04 テスト先行 → P05 実装 → P06 テスト実行 → P07 受入 → P08 リファクタ/マイグレーション整理 → P09 セキュリティ・品質保証 → P10 最終レビュー → {P11 証跡, P12 運用手順} → P13 リリース。

各 task spec: `.dev-graph/published/feature-package-feat-login-redesign/task-specs/phase-01-requirements.md` 〜 `phase-13-release-deploy.md`、graph node 文書 `tasks/feat-login-redesign/SYS-LRD-P01.md` 〜 `SYS-LRD-P13.md`。

## 4. 着手条件 (feature 間依存)

`feat-login-redesign` は `feat-platform-tenant-auth` に依存する。依存先は現在 status=active (PR #2 は merge 済みだが graph 上の task は未完了) のため、P01 の着手は dev-graph scheduler が依存先 done を確認してから ready になる。依存は task へ複製しない(planner 契約)。

## 5. 出典 (system-spec lineage)

`system-spec/index.md`, `00-requirements-definition.md`, `auth.md`, `ui-ux.md`, `frontend.md`, `security.md`, `backend.md`, `database.md` (qa-062〜qa-073) — completeness evaluator r3 PASS (`eval-log/completeness-report-20260924-r3.json`)。architecture: `architecture/youtube-analytics-system.md`、spec: `specs/youtube-analytics-system.md`。画面正本: `docs/screens/01-login.png`。

## 6. Readiness matrix

| gate | 結果 | 証跡 |
|---|---|---|
| C11 validate-graph-schema | valid / readiness complete / violations 0 | `.dev-graph/state/graph.json` rev 6 |
| C02 saved state | spec・arch・feature 2件・task 13件 すべて confirmed / pass / complete、task の evaluated_digest = published digest | graph revision 6 |
| validate-system-plan (published) | pass、validated_digest = published digest、violations 0 | `eval-log/validation-published-feat-login-redesign.json` |
| plan evaluator C1..C4 | PASS (low 2件: 参照情報への architecture/spec 明示引用漏れ、番号単位対応表は P01 で作成) | `eval-log/sdp-feat-login-redesign-plan-findings.json` |

missing_sections: なし。
