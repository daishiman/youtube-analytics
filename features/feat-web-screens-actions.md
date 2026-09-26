---
acceptance: ["ダッシュボード以外の5画面が共通土台(ルーティング・下部タブ・出典バッジ・M1〜M10 開示文)の上で表示され、ダッシュボード本体は feat-dashboard-redesign の受入で検証される", "登録者数は参考の結果指標として表示され、動画画面に動画ごとの詳細実績(維持曲線・心理・コメント)がある", "390×844 / 820×1180 / 1440×900 で設定画面を除く5画面の主要操作 E2E が通る", "原因指標にactual/target/target_gapまたは判定保留理由が表示され、改善候補を因果断定しない", "M1 区画に開示文が常に出る", "同じ日の API と CSV の値が両方のバッジ付きで並ぶ", "閲覧者には書込ボタンが出ず、APIも 403 を返す", "改善アクションの逆方向遷移が拒否され、対象ファネル段と下流結果を前後比較できる"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "confidence": 0.95, "candidate_path": "features/feat-web-screens-actions.md"}, {"artifact_kind": "issue", "confidence": 0.2, "candidate_path": "issues/feat-web-screens-actions.md"}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:dev-graph-integrity-auditor", "evidence_ref": "eval-log/dev-graph-decompose-audit-20260924-r2.json", "evaluated_digest": "5c3104c48ffc4054a64f720fe7ecb9af21e7a204418cfd0d078db9283d30d4e7"}
confirmation_status: "confirmed"
created_at: "2026-09-21T15:15:00Z"
depends_on: ["feat-youtube-daily-collection", "feat-csv-media-ingest", "feat-skill-analysis-reports", "feat-settings-channel-link"]
domain: "youtube-analytics"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: null
file_path: "features/feat-web-screens-actions.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "スマホ・タブレット・PCで週次売上ファネルの改善候補と次アクションを最初に把握し、対象ファネル段と下流結果を次回レポートで前後比較できる"
graph_node_id: "feat-web-screens-actions"
implementation_readiness: {"checked_at": "2026-09-24T10:16:21Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "登録者数などの結果だけでなく、売上に至る週次5段ファネルの目標差から改善候補を選び、アクションと下流結果を追えるようにする"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["React+Vite+React Router の SPA(ログイン/ダッシュボード/動画/AI分析/改善アクション)と ECharts によるグラフ。共通レイアウトと設定画面は feat-settings-channel-link の AppShell・共通部品を使う", "SPA の共通土台(ルーティング・サイドバー/下部タブ・出典バッジと M1〜M10 開示文の共通コンポーネント・ECharts 共通ラッパ)。ダッシュボード画面本体は feat-dashboard-redesign へ移管(qa-099〜108)", "原因指標のactual/target/target_gap・判定保留理由・非因果の説明、出典バッジと M1〜M10 開示文の共通コンポーネント", "動画別実績を置く動画画面(維持曲線・心理・コメント・場面画像と文字起こし)と切り口の確定", "actions 集約(対象ファネル段・一方向遷移・完了時の判定と baseline/result・同じ原因指標と下流結果の比較)と GET/PATCH /api/actions/:id", "幅900px未満の下部タブ・カード化と Playwright 3サイズ E2E"]
scope_out: ["収集・取込・スキル連携のサーバ処理(各 feature)", "データ削除と無料枠メーターのサーバ処理(feat-retention-ops)", "専用アプリ", "ダッシュボード画面の本体・GET /api/dashboard・GET /api/dashboard/funnel・サムネイル配信(feat-dashboard-redesign へ移管)", "設定画面・共通レイアウト(AppShell/Header/Footer)・共通部品・テナント切替(feat-settings-channel-link)", "AI分析画面の3区画・取消/再実行・JSON取込・アーカイブ・選択アクション登録・レポート詳細と版比較(feat-ai-analysis-screen)"]
source_lineage: {"origin_kind": "generated", "source_plugin": "dev-graph", "source_path": "specs/youtube-analytics-system.md", "source_version": "1.0.0", "source_digest": "dc931acd91cef9dd74da3b457eea4442d702c2337c4dc3c12bf9ce5cc3bcf698", "imported_at": "2026-09-24T10:16:21Z"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "6画面のWeb UIと改善アクション管理"
tracker_binding: "beads"
updated_at: "2026-09-26T04:56:33Z"
---

# 目的

登録者数などの結果だけでなく、売上に至る週次5段ファネルの目標差から改善候補を選び、アクションと下流結果を追えるようにする(資するゴール: G2, G5)

## 到達状態

スマホ・タブレット・PCで週次売上ファネルの改善候補と次アクションを最初に把握し、対象ファネル段と下流結果を次回レポートで前後比較できる

## スコープ

### 含む

- React+Vite+React Router の SPA(ログイン/ダッシュボード/動画/AI分析/改善アクション)と ECharts によるグラフ。共通レイアウトと設定画面は feat-settings-channel-link の AppShell・共通部品を使う
- SPA の共通土台(ルーティング・サイドバー/下部タブ・出典バッジと M1〜M10 開示文の共通コンポーネント・ECharts 共通ラッパ)。ダッシュボード画面本体は feat-dashboard-redesign へ移管(qa-099〜108)
- 原因指標のactual/target/target_gap・判定保留理由・非因果の説明、出典バッジと M1〜M10 開示文の共通コンポーネント
- 動画別実績を置く動画画面(維持曲線・心理・コメント・場面画像と文字起こし)と切り口の確定
- actions 集約(対象ファネル段・一方向遷移・完了時の判定と baseline/result・同じ原因指標と下流結果の比較)と GET/PATCH /api/actions/:id
- 幅900px未満の下部タブ・カード化と Playwright 3サイズ E2E

### 含まない

- 収集・取込・スキル連携のサーバ処理(各 feature)
- データ削除と無料枠メーターのサーバ処理(feat-retention-ops)
- 専用アプリ
- ダッシュボード画面の本体・GET /api/dashboard・GET /api/dashboard/funnel・サムネイル配信(feat-dashboard-redesign へ移管)
- 設定画面・共通レイアウト(AppShell/Header/Footer)・共通部品・テナント切替(feat-settings-channel-link)
- AI分析画面の3区画・取消/再実行・JSON取込・アーカイブ・選択アクション登録・レポート詳細と版比較(feat-ai-analysis-screen)

## 受入

- 390×844 / 820×1180 / 1440×900 で設定画面を除く5画面の主要操作 E2E が通る
- ダッシュボード以外の5画面が共通土台(ルーティング・下部タブ・出典バッジ・M1〜M10 開示文)の上で表示され、ダッシュボード本体は feat-dashboard-redesign の受入で検証される
- 登録者数は参考の結果指標として表示され、動画画面に動画ごとの詳細実績(維持曲線・心理・コメント)がある
- 原因指標にactual/target/target_gapまたは判定保留理由が表示され、改善候補を因果断定しない
- M1 区画に開示文が常に出る
- 同じ日の API と CSV の値が両方のバッジ付きで並ぶ
- 閲覧者には書込ボタンが出ず、APIも 403 を返す
- 改善アクションの逆方向遷移が拒否され、対象ファネル段と下流結果を前後比較できる

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/ui-ux.md, system-spec/frontend.md, system-spec/backend.md

## 機能間依存

- feat-youtube-daily-collection
- feat-csv-media-ingest
- feat-skill-analysis-reports
- feat-settings-channel-link

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-web-screens-actions --feature-context features/feat-web-screens-actions.context.json` で生成する。本ノードは task を持たない。

本追補はユーザー追加要件である。現行正本からの限定ローカル再投影と監査は [再同期記録](../eval-log/dev-graph-targeted-resync-receipt-20260924.json) に記録した。
