---
acceptance: ["390×844 / 820×1180 / 1440×900 で設定画面を除く5画面の主要操作 E2E が通る", "ダッシュボード先頭4ブロックが結果サマリー/週次5段ファネル/目標未達が最大の改善候補または全指標目標達成/12週推移+データ品質の順である", "登録者数は参考の結果指標で、動画別実績は動画画面または詳細にある", "原因指標にactual/target/target_gapまたは判定保留理由が表示され、改善候補を因果断定しない", "M1 区画に開示文が常に出る", "同じ日の API と CSV の値が両方のバッジ付きで並ぶ", "閲覧者には書込ボタンが出ず、APIも 403 を返す", "改善アクションの逆方向遷移が拒否され、対象ファネル段と下流結果を前後比較できる"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "confidence": 0.95, "candidate_path": "features/feat-web-screens-actions.md"}, {"artifact_kind": "issue", "confidence": 0.2, "candidate_path": "issues/feat-web-screens-actions.md"}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:local-targeted-projection-audit", "evidence_ref": "eval-log/dev-graph-targeted-resync-audit-20260924.json", "evaluated_digest": "e45ab702cc3060bb0b8778b7cb68a25dd64abddda00166dfc815bc32fa6a641c"}
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
implementation_readiness: {"status": "complete", "missing_sections": [], "checked_at": "2026-09-21T15:15:00Z"}
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
scope_in: ["React+Vite+React Router の SPA(ログイン/ダッシュボード/動画/AI分析/改善アクション)と ECharts によるグラフ。共通レイアウトと設定画面は feat-settings-channel-link の AppShell・共通部品を使う", "ダッシュボード先頭4ブロック: 結果サマリー(売上・成約数・登録者数は参考)、週次5段ファネル、目標未達が最大の改善候補+次アクション(または全指標目標達成)、12週推移+データ品質", "原因指標のactual/target/target_gap・判定保留理由・非因果の説明、出典バッジと M1〜M10 開示文の共通コンポーネント", "動画別実績を置く動画画面(維持曲線・心理・コメント・場面画像と文字起こし)と切り口の確定", "actions 集約(対象ファネル段・一方向遷移・完了時の判定と baseline/result・同じ原因指標と下流結果の比較)と GET/PATCH /api/actions/:id", "幅900px未満の下部タブ・カード化と Playwright 3サイズ E2E"]
scope_out: ["収集・取込・スキル連携のサーバ処理(各 feature)", "データ削除と無料枠メーターのサーバ処理(feat-retention-ops)", "専用アプリ", "設定画面・共通レイアウト(AppShell/Header/Footer)・共通部品・テナント切替(feat-settings-channel-link)", "AI分析画面の3区画・取消/再実行・JSON取込・アーカイブ・選択アクション登録・レポート詳細と版比較(feat-ai-analysis-screen)"]
source_lineage: {"origin_kind": "generated", "source_plugin": "dev-graph", "source_path": "specs/youtube-analytics-system.md", "source_version": "1.0.0", "source_digest": "19954f1cfbacc93ead9eb481c6189a8ceffa3fbfad47013dd7545cf16881febd", "imported_at": "2026-09-21T15:15:00Z"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "6画面のWeb UIと改善アクション管理"
tracker_binding: "beads"
updated_at: "2026-09-24T15:12:01Z"
---

# 目的

登録者数などの結果だけでなく、売上に至る週次5段ファネルの目標差から改善候補を選び、アクションと下流結果を追えるようにする(資するゴール: G2, G5)

## 到達状態

スマホ・タブレット・PCで週次売上ファネルの改善候補と次アクションを最初に把握し、対象ファネル段と下流結果を次回レポートで前後比較できる

## スコープ

### 含む

- React+Vite+React Router の SPA(ログイン/ダッシュボード/動画/AI分析/改善アクション)と ECharts によるグラフ。共通レイアウトと設定画面は feat-settings-channel-link の AppShell・共通部品を使う
- ダッシュボード先頭4ブロック: 結果サマリー(売上・成約数・登録者数は参考)、週次5段ファネル、目標未達が最大の改善候補+次アクション(または全指標目標達成)、12週推移+データ品質
- 原因指標のactual/target/target_gap・判定保留理由・非因果の説明、出典バッジと M1〜M10 開示文の共通コンポーネント
- 動画別実績を置く動画画面(維持曲線・心理・コメント・場面画像と文字起こし)と切り口の確定
- actions 集約(対象ファネル段・一方向遷移・完了時の判定と baseline/result・同じ原因指標と下流結果の比較)と GET/PATCH /api/actions/:id
- 幅900px未満の下部タブ・カード化と Playwright 3サイズ E2E

### 含まない

- 収集・取込・スキル連携のサーバ処理(各 feature)
- データ削除と無料枠メーターのサーバ処理(feat-retention-ops)
- 専用アプリ
- 設定画面・共通レイアウト(AppShell/Header/Footer)・共通部品・テナント切替(feat-settings-channel-link)
- AI分析画面の3区画・取消/再実行・JSON取込・アーカイブ・選択アクション登録・レポート詳細と版比較(feat-ai-analysis-screen)

## 受入

- 390×844 / 820×1180 / 1440×900 で設定画面を除く5画面の主要操作 E2E が通る
- ダッシュボード先頭4ブロックが結果サマリー/週次5段ファネル/目標未達が最大の改善候補または全指標目標達成/12週推移+データ品質の順である
- 登録者数は参考の結果指標で、動画別実績は動画画面または詳細にある
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
