---
acceptance: ["2026-08-22〜09-19 の実 Studio CSV で M1=16.97% になる", "空欄は null、0 は実測0として保存される", "同じ tenant+channel+week の週次事業CSV再取込で行が増えず上書きされる", "lead_route_rate と inquiry_close_rate が定義どおり計算され、分母0・欠損・targetが0以下または未設定・min_sample未達・週未確定・週末後の取込なしは判定保留になる", "min_sampleの母数がimpressions/impressions/engaged_views/views/inquiriesに固定される", "全原因指標が目標以上なら改善候補を作らない", "閲覧者の取込は 403 になる", "R2 画像キーが tenants/{tenant_id}/ で始まり公開URLを持たない", "M1〜M10 と週次診断のYouTube側入力に source=api の行が含まれない", "取込受付1件に対して解析結果が imports.import_id で追跡でき、解析の成功・失敗・行数・期間が同じ imports 履歴に反映される"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "confidence": 0.95, "candidate_path": "features/feat-csv-media-ingest.md"}, {"artifact_kind": "issue", "confidence": 0.2, "candidate_path": "issues/feat-csv-media-ingest.md"}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:local-targeted-projection-audit", "evidence_ref": "eval-log/dev-graph-targeted-resync-audit-20260924.json", "evaluated_digest": "9ba0dc91f8188dc2f9f1463afce3a7bc8cb81a4a80975f95c63dac35de4b6006"}
confirmation_status: "confirmed"
created_at: "2026-09-21T15:15:00Z"
depends_on: ["feat-platform-tenant-auth", "feat-settings-channel-link"]
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
scope_in: ["設定画面の POST /api/imports が Studio CSV・字幕・画像の原本受付と imports.import_id 発行の正本。POST /api/csv を残す場合も同じ受付処理を使い、Studio CSV 3種の csv_imports は imports.import_id に紐付く", "MVPで唯一の外部事業データproviderである週次manual CSVの取込(week_start[JST月曜], channel_id, route_label[既定LINE], route_visits, inquiries, closed_deals, revenue_jpy)", "判定規則(Shorts 判定・nullと実測0の区別・集計遅延・合計行の別保存)による正規化", "CSV 由来テーブル(video_period_metrics, video_daily_metrics, channel_daily_metrics, business_funnel_weekly)と funnel_targets(metric_id,target_value,min_sample,effective_from)", "tenant+channel+week単位の冪等upsert、lead_route_rate=route_visits/views*100、inquiry_close_rate=closed_deals/inquiries*100、target_gap=(actual-target)/target と判定保留規則", "metrics/ モジュールの純関数 M1〜M10 と固定値テスト(M1=16.97%)。YouTube側の派生計算はStudio CSV由来のみ", "字幕(SRT/VTT/Whisper)の transcripts 保存と画像の縮小・R2 保存(tenants/{tenant_id}/)・media_assets"]
scope_out: ["API 収集(feat-youtube-daily-collection)", "スキル経由のアップロード API(feat-skill-analysis-reports)", "取込画面の UI と imports 履歴 API(GET/POST /api/imports)(feat-settings-channel-link)"]
source_lineage: {"origin_kind": "generated", "source_plugin": "dev-graph", "source_path": "specs/youtube-analytics-system.md", "source_version": "1.0.0", "source_digest": "19954f1cfbacc93ead9eb481c6189a8ceffa3fbfad47013dd7545cf16881febd", "imported_at": "2026-09-21T15:15:00Z"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "CSV・字幕・画像の取込と派生指標"
tracker_binding: "beads"
updated_at: "2026-09-24T01:00:12Z"
---

# 目的

Studio CSVからYouTube派生指標を、週次事業CSVから売上ファネルの下流実績を取り込み、出典とnull/0を保った再現可能な分析入力を揃える(資するゴール: G1, G2)

## 到達状態

editor 以上が Studio CSV 3種・週次事業CSV・字幕・画像を取り込むと、出典別に正規化された表と R2 画像が保存され、YouTube派生指標と週次売上ファネルを再現できる

## スコープ

### 含む

- 設定画面の `POST /api/imports` が Studio CSV・字幕・画像の原本受付と `imports.import_id` 発行の正本。`POST /api/csv` を残す場合も同じ受付処理を呼び、別のアップロード経路を作らない。Studio CSV 3種の解析結果 `csv_imports` は `imports.import_id` に紐付ける
- MVPで唯一の外部事業データproviderである週次manual CSVの取込(`week_start`〔JST月曜〕, `channel_id`, `route_label`〔既定LINE〕, `route_visits`, `inquiries`, `closed_deals`, `revenue_jpy`)
- 判定規則(Shorts 判定・nullと実測0の区別・集計遅延・合計行の別保存)による正規化
- CSV 由来テーブル(video_period_metrics, video_daily_metrics, channel_daily_metrics, business_funnel_weekly)と funnel_targets(metric_id, target_value, min_sample, effective_from)
- tenant+channel+week単位の冪等upsert、`lead_route_rate=route_visits/views*100`、`inquiry_close_rate=closed_deals/inquiries*100`、`target_gap=(actual-target)/target` と判定保留規則
- metrics/ モジュールの純関数 M1〜M10 と固定値テスト(M1=16.97%)。YouTube側の派生計算はStudio CSV由来のみ
- 字幕(SRT/VTT/Whisper)の transcripts 保存と画像の縮小・R2 保存(tenants/{tenant_id}/)・media_assets

### 含まない

- API 収集(feat-youtube-daily-collection)
- スキル経由のアップロード API(feat-skill-analysis-reports)
- 取込画面の UI と imports 履歴 API(GET/POST /api/imports)(feat-settings-channel-link)

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
- 取込受付1件に対して解析結果が `imports.import_id` で追跡でき、解析の成功・失敗・行数・期間が同じ `imports` 履歴に反映される

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/backend.md, system-spec/database.md, system-spec/security.md, system-spec/maintenance-ops.md

## 機能間依存

- feat-platform-tenant-auth
- feat-settings-channel-link（原本受付と取込履歴の正本）

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-csv-media-ingest --feature-context features/feat-csv-media-ingest.context.json` で生成する。本ノードは task を持たない。

本追補はユーザー追加要件である。現行正本からの限定ローカル再投影と監査は [再同期記録](../eval-log/dev-graph-targeted-resync-receipt-20260924.json) に記録した。
