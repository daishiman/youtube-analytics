---
acceptance: ["ログイン画面が docs/screens/01-login.png と同じ並び・文言で表示され、Google ボタンは白地・枠#747775・標準Gロゴになっている", "画面に出る権限一覧は GET /api/auth/config の応答だけから描かれ、/api/auth/login が要求する scope と一致する(新規3行・招待1行)", "同意にチェックするまでボタンは押せず理由文が出る。同意してログインすると consent_records に現行の規約版で1行だけ追記される", "規約の版がサーバの現行版と違う同意では /login?error=CONSENT_OUTDATED に戻り、再同意を求める文言が出る", "YouTube 2スコープのどちらかを拒否してもログインとテナント作成は完了し、youtube_link_status=partial になって、ダッシュボードと設定に再連携バナー(オーナーだけボタン付き)が出る", "GET /api/auth/youtube/connect をオーナー以外が呼ぶと 403 になる", "SPA 本体の応答に指定の CSP と frame-ancestors 'none' などのヘッダが付き、他サイトの iframe には表示されない", "未知のエラーコードや Google の error_description は画面にもURLにも出ない", "360px 幅で横スクロールが出ず、キーボードだけで同意チェックからログインボタンまで操作できる(Playwright 390×844・820×1180・1440×900)", "main への push で D1 マイグレーション(consent_records・youtube_link_status)と deploy が完了する"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "candidate_path": "features/feat-login-redesign.md", "confidence": 0.95}, {"artifact_kind": "issue", "candidate_path": "issues/feat-login-redesign.md", "confidence": 0.2}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様(qa-062〜qa-073)から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:local-targeted-projection-audit", "evidence_ref": "eval-log/dev-graph-targeted-resync-audit-20260924.json", "evaluated_digest": "0cebb55575e920459406972afd4afa1c7fa289a9926d1967db06ec6a622b28a6"}
confirmation_status: "confirmed"
created_at: "2026-09-24T01:06:26Z"
depends_on: ["feat-platform-tenant-auth"]
domain: "youtube-analytics"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: null
file_path: "features/feat-login-redesign.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "ログイン画面が画像どおりの中央カード(製品名 Channel Insight・見出し・権限3行と読み取り専用バッジ・同意チェック・Google ブランド規定どおりのログインボタン・未検証アプリ案内・信頼表示フッター)で表示され、表示される権限と実際に要求するスコープが同じ定義から作られ、同意した規約の版が記録され、部分許可でもログインでき再連携へ案内され、CSP 等のヘッダで画面が守られた状態が main への push で自動デプロイされる"
graph_node_id: "feat-login-redesign"
implementation_readiness: {"checked_at": "2026-09-24T01:10:28Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "ログイン画面を docs/screens/01-login.png の構成と文言どおりに刷新し、要求する権限・同意の記録・画面の防御を利用者に見える形で一致させて、初めての利用者が安心して Google ログインと YouTube 読取連携を始められるようにする"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["ログイン画面 UI/UX の刷新(web/pages/LoginPage.tsx): 画像どおりの中央カード構成と文言、共通デザイン正本の色(主操作マゼンタ)、Google ブランド規定の Light テーマ固定ボタン、未検証アプリ案内、Google のプライバシーポリシーリンク", "新規モードと招待モードの出し分け(招待はメールアドレス1行だけ・『○○のテナントに招待されています』表示)", "同意前はボタンを押せない状態と理由文、既知コードだけを日本語で出すエラー表示(CONSENT_OUTDATED 追加・未知コードは共通文言)", "権限行の読み取り専用バッジは行内で描画する。共通コンポーネントは TrustFooter(React製ログイン画面) / YouTubeLinkBanner(ダッシュボード・設定の再連携案内)。静的な規約2ページは public/legal.css を共有する", "製品名『Channel Insight』をログイン画面のテキスト・ログイン後のサイドバーテキスト・タブタイトル・規約2ページ・OAuth 同意画面のアプリ名に統一", "GET /api/auth/config(権限一覧・規約の版・招待テナント名)と、表示ラベルを持つ唯一の定義 SCOPE_SETS・LEGAL_VERSIONS", "OAuth callback の順序変更: 付与スコープの検証と保存、youtube_link_status(none/partial/linked)の更新、consent_records への追記、セッション確立", "部分許可時もログインを完了させ、オーナーだけが GET /api/auth/youtube/connect で YouTube 2スコープを再要求できる", "規約改定時は既存セッションを切らず、次回ログインで再同意を求める(source=reconsent)", "D1 マイグレーション: consent_records(追記のみ・(user_id, consented_at) 索引1つ)と tenants.youtube_link_status の追加、アカウント削除時の consent_records 削除", "SPA 本体の応答ヘッダ: 自サイトと Google 認証だけを許可する CSP・frame-ancestors 'none'・nosniff・Referrer-Policy・Permissions-Policy(_headers と API 共通 middleware)", "プライバシーポリシーへの信頼表示3点(読み取り専用スコープ/テナント分離/無料枠運用と有料化の事前告知)の根拠記載", "アクセシビリティとレスポンシブ(360px 横スクロールなし・タップ領域44pt 以上・見た目どおりの Tab 順・マゼンタのフォーカスリング)と Playwright 3サイズ E2E"]
scope_out: ["ログイン試行の回数制限とそのためのテーブル・Cron(qa-071 で設けないと確定)", "Google OAuth の検証申請手続き(既存の『80人で検証申請』運用のまま)", "テナント作成・招待・役割の仕組みそのもの(feat-platform-tenant-auth で実装済みの土台を使う)", "YouTube データの収集処理(feat-youtube-daily-collection)", "ダッシュボード・設定画面の本体機能(feat-web-screens-actions。本 feature は再連携バナーの差し込みだけを持つ)", "レポート HTML の sandbox iframe 用ヘッダ(既存方針のまま)"]
source_lineage: {"imported_at": "2026-09-24T01:10:28Z", "origin_kind": "generated", "source_digest": "d6de25985e32386005cf3cf107fd78762db92774d4fe19ba562de59ab7807466", "source_path": "specs/youtube-analytics-system.md", "source_plugin": "dev-graph", "source_version": "1.0.0"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics", "login"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "ログイン画面刷新(Channel Insight)"
tracker_binding: "beads"
updated_at: "2026-09-24T01:10:28Z"
---

# 目的

ログイン画面を docs/screens/01-login.png の構成と文言どおりに刷新し、要求する権限・同意の記録・画面の防御を利用者に見える形で一致させて、初めての利用者が安心して Google ログインと YouTube 読取連携を始められるようにする(資するゴール: G1, G3, G4, G5)

## 到達状態

ログイン画面が画像どおりの中央カード(製品名 Channel Insight・見出し・権限3行と読み取り専用バッジ・同意チェック・Google ブランド規定どおりのログインボタン・未検証アプリ案内・信頼表示フッター)で表示され、表示される権限と実際に要求するスコープが同じ定義から作られ、同意した規約の版が記録され、部分許可でもログインでき再連携へ案内され、CSP 等のヘッダで画面が守られた状態が main への push で自動デプロイされる

## スコープ

### 含む

- ログイン画面 UI/UX の刷新(web/pages/LoginPage.tsx): 画像どおりの中央カード構成と文言、共通デザイン正本の色(主操作マゼンタ)、Google ブランド規定の Light テーマ固定ボタン、未検証アプリ案内、Google のプライバシーポリシーリンク
- 新規モードと招待モードの出し分け(招待はメールアドレス1行だけ・『○○のテナントに招待されています』表示)
- 同意前はボタンを押せない状態と理由文、既知コードだけを日本語で出すエラー表示(CONSENT_OUTDATED 追加・未知コードは共通文言)
- 権限行の読み取り専用バッジは行内で描画する。共通コンポーネントは TrustFooter(React製ログイン画面) / YouTubeLinkBanner(ダッシュボード・設定の再連携案内)。静的な規約2ページは public/legal.css を共有する
- 製品名『Channel Insight』をログイン画面のテキスト・ログイン後のサイドバーテキスト・タブタイトル・規約2ページ・OAuth 同意画面のアプリ名に統一
- GET /api/auth/config(権限一覧・規約の版・招待テナント名)と、表示ラベルを持つ唯一の定義 SCOPE_SETS・LEGAL_VERSIONS
- OAuth callback の順序変更: 付与スコープの検証と保存、youtube_link_status(none/partial/linked)の更新、consent_records への追記、セッション確立
- 部分許可時もログインを完了させ、オーナーだけが GET /api/auth/youtube/connect で YouTube 2スコープを再要求できる
- 規約改定時は既存セッションを切らず、次回ログインで再同意を求める(source=reconsent)
- D1 マイグレーション: consent_records(追記のみ・(user_id, consented_at) 索引1つ)と tenants.youtube_link_status の追加、アカウント削除時の consent_records 削除
- SPA 本体の応答ヘッダ: 自サイトと Google 認証だけを許可する CSP・frame-ancestors 'none'・nosniff・Referrer-Policy・Permissions-Policy(_headers と API 共通 middleware)
- プライバシーポリシーへの信頼表示3点(読み取り専用スコープ/テナント分離/無料枠運用と有料化の事前告知)の根拠記載
- アクセシビリティとレスポンシブ(360px 横スクロールなし・タップ領域44pt 以上・見た目どおりの Tab 順・マゼンタのフォーカスリング)と Playwright 3サイズ E2E

### 含まない

- ログイン試行の回数制限とそのためのテーブル・Cron(qa-071 で設けないと確定)
- Google OAuth の検証申請手続き(既存の『80人で検証申請』運用のまま)
- テナント作成・招待・役割の仕組みそのもの(feat-platform-tenant-auth で実装済みの土台を使う)
- YouTube データの収集処理(feat-youtube-daily-collection)
- ダッシュボード・設定画面の本体機能(feat-web-screens-actions。本 feature は再連携バナーの差し込みだけを持つ)
- レポート HTML の sandbox iframe 用ヘッダ(既存方針のまま)

## 受入

- ログイン画面が docs/screens/01-login.png と同じ並び・文言で表示され、Google ボタンは白地・枠#747775・標準Gロゴになっている
- 画面に出る権限一覧は GET /api/auth/config の応答だけから描かれ、/api/auth/login が要求する scope と一致する(新規3行・招待1行)
- 同意にチェックするまでボタンは押せず理由文が出る。同意してログインすると consent_records に現行の規約版で1行だけ追記される
- 規約の版がサーバの現行版と違う同意では /login?error=CONSENT_OUTDATED に戻り、再同意を求める文言が出る
- YouTube 2スコープのどちらかを拒否してもログインとテナント作成は完了し、youtube_link_status=partial になって、ダッシュボードと設定に再連携バナー(オーナーだけボタン付き)が出る
- GET /api/auth/youtube/connect をオーナー以外が呼ぶと 403 になる
- SPA 本体の応答に指定の CSP と frame-ancestors 'none' などのヘッダが付き、他サイトの iframe には表示されない
- 未知のエラーコードや Google の error_description は画面にもURLにも出ない
- 360px 幅で横スクロールが出ず、キーボードだけで同意チェックからログインボタンまで操作できる(Playwright 390×844・820×1180・1440×900)
- main への push で D1 マイグレーション(consent_records・youtube_link_status)と deploy が完了する

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/auth.md, system-spec/ui-ux.md, system-spec/frontend.md, system-spec/security.md, system-spec/backend.md, system-spec/database.md(qa-062〜qa-073)
- 画面正本: docs/screens/01-login.png

## 機能間依存

- feat-platform-tenant-auth(Google ログイン・テナント・招待・規約ページの土台。P01 着手はこの feature の done が条件)

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-login-redesign --feature-context features/feat-login-redesign.context.json` で生成する。本ノードは task を持たない。
