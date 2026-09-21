---
acceptance: ["2026-08-22〜09-19 の実 Studio CSV で M1=16.97% になる", "空欄は null、0 は実測0として保存される", "同じ tenant+channel+week の週次事業CSV再取込で行が増えず上書きされる", "lead_route_rate と inquiry_close_rate が定義どおり計算され、分母0・欠損・targetが0以下または未設定・min_sample未達・週未確定・週末後の取込なしは判定保留になる", "min_sampleの母数がimpressions/impressions/engaged_views/views/inquiriesに固定される", "全原因指標が目標以上なら改善候補を作らない", "閲覧者の取込は 403 になる", "R2 画像キーが tenants/{tenant_id}/ で始まり公開URLを持たない", "M1〜M10 と週次診断のYouTube側入力に source=api の行が含まれない"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "confidence": 0.95, "candidate_path": "features/feat-csv-media-ingest.md"}, {"artifact_kind": "issue", "confidence": 0.2, "candidate_path": "issues/feat-csv-media-ingest.md"}]
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
file_path: "features/feat-csv-media-ingest.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "editor 以上が Studio CSV 3種・週次事業CSV・字幕・画像を取り込むと、出典別に正規化された表と R2 画像が保存され、YouTube派生指標と週次売上ファネルを再現できる"
graph_node_id: "feat-csv-media-ingest"
implementation_readiness: {"status": "complete", "missing_sections": [], "checked_at": "2026-09-21T15:15:00Z"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "Studio CSVからYouTube派生指標を、週次事業CSVから売上ファネルの下流実績を取り込み、出典とnull/0を保った再現可能な分析入力を揃える"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["POST /api/csv による表データ/グラフデータ/合計の3種 Studio CSV 取込と csv_imports 記録", "MVPで唯一の外部事業データproviderである週次manual CSVの取込(week_start[JST月曜], channel_id, route_label[既定LINE], route_visits, inquiries, closed_deals, revenue_jpy)", "判定規則(Shorts 判定・nullと実測0の区別・集計遅延・合計行の別保存)による正規化", "CSV 由来テーブル(video_period_metrics, video_daily_metrics, channel_daily_metrics, business_funnel_weekly)と funnel_targets(metric_id,target_value,min_sample,effective_from)", "tenant+channel+week単位の冪等upsert、lead_route_rate=route_visits/views*100、inquiry_close_rate=closed_deals/inquiries*100、target_gap=(actual-target)/target と判定保留規則", "metrics/ モジュールの純関数 M1〜M10 と固定値テスト(M1=16.97%)。YouTube側の派生計算はStudio CSV由来のみ", "字幕(SRT/VTT/Whisper)の transcripts 保存と画像の縮小・R2 保存(tenants/{tenant_id}/)・media_assets"]
scope_out: ["API 収集(feat-youtube-daily-collection)", "スキル経由のアップロード API(feat-skill-analysis-reports)", "取込画面の UI(feat-web-screens-actions)"]
source_lineage: {"origin_kind": "generated", "source_plugin": "dev-graph", "source_path": "specs/youtube-analytics-system.md", "source_version": "1.0.0", "source_digest": "cd7db6eaf6be63b19ffc8bdd66d03c986abcc5473426f7762afc7dac9df8c486", "imported_at": "2026-09-21T15:15:00Z"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "CSV・字幕・画像の取込と派生指標"
tracker_binding: "beads"
updated_at: "2026-09-21T15:15:00Z"
---

# 目的

Studio CSVからYouTube派生指標を、週次事業CSVから売上ファネルの下流実績を取り込み、出典とnull/0を保った再現可能な分析入力を揃える(資するゴール: G1, G2)

## 到達状態

editor 以上が Studio CSV 3種・週次事業CSV・字幕・画像を取り込むと、出典別に正規化された表と R2 画像が保存され、YouTube派生指標と週次売上ファネルを再現できる

## スコープ

### 含む

- POST /api/csv による表データ/グラフデータ/合計の3種 Studio CSV 取込と csv_imports 記録
- MVPで唯一の外部事業データproviderである週次manual CSVの取込(`week_start`〔JST月曜〕, `channel_id`, `route_label`〔既定LINE〕, `route_visits`, `inquiries`, `closed_deals`, `revenue_jpy`)
- 判定規則(Shorts 判定・nullと実測0の区別・集計遅延・合計行の別保存)による正規化
- CSV 由来テーブル(video_period_metrics, video_daily_metrics, channel_daily_metrics, business_funnel_weekly)と funnel_targets(metric_id, target_value, min_sample, effective_from)
- tenant+channel+week単位の冪等upsert、`lead_route_rate=route_visits/views*100`、`inquiry_close_rate=closed_deals/inquiries*100`、`target_gap=(actual-target)/target` と判定保留規則
- metrics/ モジュールの純関数 M1〜M10 と固定値テスト(M1=16.97%)。YouTube側の派生計算はStudio CSV由来のみ
- 字幕(SRT/VTT/Whisper)の transcripts 保存と画像の縮小・R2 保存(tenants/{tenant_id}/)・media_assets

### 含まない

- API 収集(feat-youtube-daily-collection)
- スキル経由のアップロード API(feat-skill-analysis-reports)
- 取込画面の UI(feat-web-screens-actions)

## 受入

- 2026-08-22〜09-19 の実 Studio CSV で M1=16.97% になる
- 空欄は null、0 は実測0として保存される
- 同じ tenant+channel+week の週次事業CSV再取込で行が増えず上書きされる
- lead_route_rate と inquiry_close_rate が定義どおり計算され、分母0・欠損・targetが0以下または未設定・min_sample未達・週未確定・週末後の取込なしは判定保留になる
- min_sampleの母数がimpressions / impressions / engaged_views / views / inquiriesに固定される
- 全原因指標が目標以上なら改善候補を作らない
- 閲覧者の取込は 403 になる
- R2 画像キーが tenants/{tenant_id}/ で始まり公開URLを持たない
- M1〜M10 と週次診断のYouTube側入力に source=api の行が含まれない

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/backend.md, system-spec/database.md, system-spec/security.md, system-spec/maintenance-ops.md

## 機能間依存

- feat-platform-tenant-auth

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-csv-media-ingest --feature-context features/feat-csv-media-ingest.context.json` で生成する。本ノードは task を持たない。

本追補はユーザー追加要件である。`source_lineage.source_digest` は手作業で変更せず、次回dev-graph compileで正本から再同期する。
