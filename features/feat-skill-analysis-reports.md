---
acceptance: ["/yt-analyze 1回で依頼→書き出し→HTML と JSON の反映まで手作業0で完了する", "分析結果に週次5段ファネル・下流結果・目標未達が最大の改善候補、全指標目標達成、または判定保留理由があり、因果を断定しない", "同一tenant+channelの完了済み直近5版だけを履歴に使い、前回仮説の当否・施策効果・参照版番号を新規版へ保存する", "履歴0件は初回分析として成功し、別tenant/channelの履歴は混ざらない", "改善アクションの効果比較に対象ファネル段と下流結果が含まれる", "同じ Idempotency-Key の二重送信で版が増えない", "過去の版は更新されない", "他テナントのトークンでは export できない", "export の各行が source(api|studio_csv|business_csv)を持つ"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "confidence": 0.95, "candidate_path": "features/feat-skill-analysis-reports.md"}, {"artifact_kind": "issue", "confidence": 0.2, "candidate_path": "issues/feat-skill-analysis-reports.md"}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:dev-graph-integrity-auditor", "evidence_ref": "eval-log/dev-graph-decompose-audit-20260921.json", "evaluated_digest": "93222146ee6089f0c1ef0c6fcc62e9250c03338dfe9e49a328952d6fef7749b9"}
confirmation_status: "confirmed"
created_at: "2026-09-21T15:15:00Z"
depends_on: ["feat-youtube-daily-collection", "feat-csv-media-ingest"]
domain: "youtube-analytics"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: null
file_path: "features/feat-skill-analysis-reports.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "Claude Code で /yt-analyze を1回実行すると、週次5段ファネル・下流結果・直近5版の分析履歴を書き出し、前回仮説と施策効果を踏まえた改善候補を因果断定せず示すHTMLと結果JSONが新しい版として反映される"
graph_node_id: "feat-skill-analysis-reports"
implementation_readiness: {"status": "complete", "missing_sections": [], "checked_at": "2026-09-21T15:15:00Z"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "システム内で LLM を呼ばずに、各利用者の Claude Code 上で売上ファネルの目標差・下流結果・直近5版からの差分を分析し、その結果を版管理されたレポートとして取り込めるようにする"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["(tenant_id,user_id)単位の個人トークン発行(平文1回表示・SHA-256 保存)と失効", "analysis_requests(待機中→実行中→完了|失敗)と GET/POST /api/analysis-requests", "GET /api/skill/export(行ごとの source 付与、M1〜M10 と週次診断のYouTube側入力はStudio CSV由来のみ、週次事業実績・目標・判定保留理由を含む)", "同一tenant+channelの完了済み直近5版を結論・要因・対象ファネル段・action・baseline/result・下流結果・版番号に絞ったanalysis_historyとしてexport", "5つの原因指標と結果指標を問う分析、負のtarget_gap最小を改善候補とし、全指標0以上なら候補なしと示す非因果的な出力", "PATCH /api/skill/requests/:id, POST /api/skill/reports(Idempotency-Key)、transcripts/media のスキル経由アップロード", "レポート版集約(reports, findings, psych_findings, comment_emotions)の追記のみの保存と版比較、history_versions_usedの保存", "改善アクションの対象ファネル段と同じ原因指標・下流結果による効果比較", "Claude Code 用 /yt-analyze スキルと運営者 Mac の launchd 週次実行"]
scope_out: ["レポート閲覧画面と改善アクション画面(feat-web-screens-actions)", "アプリ内 LLM 呼出し", "因果推論・予測", "トークン管理画面・トークン名・1人5本上限・GET/POST/DELETE /api/skill-tokens(feat-settings-channel-link)"]
source_lineage: {"origin_kind": "generated", "source_plugin": "dev-graph", "source_path": "specs/youtube-analytics-system.md", "source_version": "1.0.0", "source_digest": "cd7db6eaf6be63b19ffc8bdd66d03c986abcc5473426f7762afc7dac9df8c486", "imported_at": "2026-09-21T15:15:00Z"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "Claude Code連携とAI分析レポート"
tracker_binding: "beads"
updated_at: "2026-09-24T01:00:12Z"
---

# 目的

システム内で LLM を呼ばずに、各利用者の Claude Code 上で売上ファネルの目標差・下流結果・直近5版からの差分を分析し、その結果を版管理されたレポートとして取り込めるようにする(資するゴール: G2)

## 到達状態

Claude Code で /yt-analyze を1回実行すると、週次5段ファネル・下流結果・直近5版の分析履歴を書き出し、前回仮説と施策効果を踏まえた改善候補を因果断定せず示すHTMLと結果JSONが新しい版として反映される

## スコープ

### 含む

- (tenant_id,user_id)単位の個人トークン発行(平文1回表示・SHA-256 保存)と失効
- analysis_requests(待機中→実行中→完了|失敗)と GET/POST /api/analysis-requests
- GET /api/skill/export(行ごとの source 付与、M1〜M10 と週次診断のYouTube側入力はStudio CSV由来のみ、週次事業実績・目標・判定保留理由を含む)
- 同一tenant+channelの完了済み直近5版を結論・要因・対象ファネル段・action・baseline/result・下流結果・版番号に絞ったanalysis_historyとしてexport
- 5つの原因指標と結果指標を問う分析、負のtarget_gap最小を改善候補とし、全指標0以上なら候補なしと示す非因果的な出力
- PATCH /api/skill/requests/:id, POST /api/skill/reports(Idempotency-Key)、transcripts/media のスキル経由アップロード
- レポート版集約(reports, findings, psych_findings, comment_emotions)の追記のみの保存と版比較、history_versions_usedの保存
- 改善アクションの対象ファネル段と同じ原因指標・下流結果による効果比較
- Claude Code 用 /yt-analyze スキルと運営者 Mac の launchd 週次実行

### 含まない

- レポート閲覧画面と改善アクション画面(feat-web-screens-actions)
- アプリ内 LLM 呼出し
- 因果推論・予測
- トークン管理画面・トークン名・1人5本上限・GET/POST/DELETE /api/skill-tokens(feat-settings-channel-link)

## 受入

- /yt-analyze 1回で依頼→書き出し→HTML と JSON の反映まで手作業0で完了する
- 分析結果に週次5段ファネル・下流結果・目標未達が最大の改善候補、全指標目標達成、または判定保留理由があり、因果を断定しない
- 同一tenant+channelの完了済み直近5版だけを履歴に使い、前回仮説の当否・施策効果・参照版番号を新規版へ保存する
- 履歴0件は初回分析として成功し、別tenant/channelの履歴は混ざらない
- 改善アクションの効果比較に対象ファネル段と下流結果が含まれる
- 同じ Idempotency-Key の二重送信で版が増えない
- 過去の版は更新されない
- 他テナントのトークンでは export できない
- export の各行が source(api|studio_csv|business_csv)を持つ

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/backend.md, system-spec/security.md, system-spec/database.md, system-spec/maintenance-ops.md

## 機能間依存

- feat-youtube-daily-collection
- feat-csv-media-ingest

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-skill-analysis-reports --feature-context features/feat-skill-analysis-reports.context.json` で生成する。本ノードは task を持たない。

本追補はユーザー追加要件である。`source_lineage.source_digest` は手作業で変更せず、次回dev-graph compileで正本から再同期する。
