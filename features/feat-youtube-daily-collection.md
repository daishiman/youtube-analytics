---
acceptance: ["Cron 1回で対象テナント数+1通が collect-queue に入る", "1テナントの収集が1回の consumer 実行でサブリクエスト50件以内に収まる", "3回再試行しても失敗したテナントは collection_status=failed になり、翌日の実行で直近7日が埋まる", "保存した行は全て source=api と tenant_id を持つ", "API 由来の値から新しい指標を計算するコードが無い"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "confidence": 0.95, "candidate_path": "features/feat-youtube-daily-collection.md"}, {"artifact_kind": "issue", "confidence": 0.2, "candidate_path": "issues/feat-youtube-daily-collection.md"}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:dev-graph-integrity-auditor", "evidence_ref": "eval-log/dev-graph-decompose-audit-20260921.json", "evaluated_digest": "93222146ee6089f0c1ef0c6fcc62e9250c03338dfe9e49a328952d6fef7749b9"}
confirmation_status: "confirmed"
created_at: "2026-09-21T15:15:00Z"
depends_on: ["feat-platform-tenant-auth"]
domain: "youtube-analytics"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: null
file_path: "features/feat-youtube-daily-collection.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "owner が YouTube を読取専用で連携すると、毎日 JST 3:00 の Cron が Queues 経由で全テナントを1テナント1実行で収集し、API 由来の表へ出典 api 付きで保存される"
graph_node_id: "feat-youtube-daily-collection"
implementation_readiness: {"status": "complete", "missing_sections": [], "checked_at": "2026-09-21T15:15:00Z"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "YouTube Analytics/Reporting/Data API の公式値をテナントごとに毎日自動で集め、分析とダッシュボードが常に最新の実績を使えるようにする"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["owner による YouTube 読取連携(youtube.readonly yt-analytics.readonly, offline)と refresh token の AES-256-GCM 暗号化保存・連携解除の revoke(連携の入口と1チャンネル選択は feat-settings-channel-link)", "連携完了時の Reporting API jobs.create(channel_reach_basic_a1)と job_id 保存", "Cron `0 18 * * *` から collect-queue へ tenant ごとの collect 通と cleanup 1通を sendBatch", "consumer(max_batch_size=1)の collectTenantDaily: Analytics D-7〜D-1 再取得・動画別 D-3 単日・流入元・属性・維持率", "Reporting reports.list の差分取得と修正版の置換、Data API の動画一覧差分", "msg.retry(max_retries=3・600秒)と最終失敗時の collection_status=failed", "API 由来テーブル(daily_metrics, video_metrics, retention_points, comments ほか)への保存と fetched_at"]
scope_out: ["CSV 取込と派生指標(feat-csv-media-ingest)", "cleanup 通の処理内容(feat-retention-ops)", "収集結果の画面表示(feat-web-screens-actions)", "チャンネル候補の選択・変更フロー、字幕トグルと captions.download(youtube.force-ssl)の追加同意・1日5本の字幕取得(feat-settings-channel-link)"]
source_lineage: {"origin_kind": "generated", "source_plugin": "dev-graph", "source_path": "specs/youtube-analytics-system.md", "source_version": "1.0.0", "source_digest": "cd7db6eaf6be63b19ffc8bdd66d03c986abcc5473426f7762afc7dac9df8c486", "imported_at": "2026-09-21T15:15:00Z"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "YouTube連携と毎日収集"
tracker_binding: "beads"
updated_at: "2026-09-24T01:00:12Z"
---

# 目的

YouTube Analytics/Reporting/Data API の公式値をテナントごとに毎日自動で集め、分析とダッシュボードが常に最新の実績を使えるようにする(資するゴール: G1, G3)

## 到達状態

owner が YouTube を読取専用で連携すると、毎日 JST 3:00 の Cron が Queues 経由で全テナントを1テナント1実行で収集し、API 由来の表へ出典 api 付きで保存される

## スコープ

### 含む

- owner による YouTube 読取連携(youtube.readonly yt-analytics.readonly, offline)と refresh token の AES-256-GCM 暗号化保存・連携解除の revoke(連携の入口と1チャンネル選択は feat-settings-channel-link)
- 連携完了時の Reporting API jobs.create(channel_reach_basic_a1)と job_id 保存
- Cron `0 18 * * *` から collect-queue へ tenant ごとの collect 通と cleanup 1通を sendBatch
- consumer(max_batch_size=1)の collectTenantDaily: Analytics D-7〜D-1 再取得・動画別 D-3 単日・流入元・属性・維持率
- Reporting reports.list の差分取得と修正版の置換、Data API の動画一覧差分
- msg.retry(max_retries=3・600秒)と最終失敗時の collection_status=failed
- API 由来テーブル(daily_metrics, video_metrics, retention_points, comments ほか)への保存と fetched_at

### 含まない

- CSV 取込と派生指標(feat-csv-media-ingest)
- cleanup 通の処理内容(feat-retention-ops)
- 収集結果の画面表示(feat-web-screens-actions)
- チャンネル候補の選択・変更フロー、字幕トグルと captions.download(youtube.force-ssl)の追加同意・1日5本の字幕取得(feat-settings-channel-link)

## 受入

- Cron 1回で対象テナント数+1通が collect-queue に入る
- 1テナントの収集が1回の consumer 実行でサブリクエスト50件以内に収まる
- 3回再試行しても失敗したテナントは collection_status=failed になり、翌日の実行で直近7日が埋まる
- 保存した行は全て source=api と tenant_id を持つ
- API 由来の値から新しい指標を計算するコードが無い

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/infrastructure.md, system-spec/backend.md, system-spec/auth.md, system-spec/database.md

## 機能間依存

- feat-platform-tenant-auth

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-youtube-daily-collection --feature-context features/feat-youtube-daily-collection.context.json` で生成する。本ノードは task を持たない。
