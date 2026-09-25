---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-skill-analysis-reports/SYS-SAR-P02.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P02 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-skill-analysis-reports/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-25T00:09:44Z"
depends_on: ["SYS-SAR-P01"]
domain: "api"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-skill-analysis-reports"
file_path: "tasks/feat-skill-analysis-reports/SYS-SAR-P02.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-SAR-P02"
implementation_readiness: {"checked_at": "2026-09-25T00:30:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-skill-analysis-reports"
phase_ref: "P02"
priority: null
project_id: "feature-package-feat-skill-analysis-reports"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-skill-analysis-reports"]
resource_scope: ["docs/feat-skill-analysis-reports/architecture.md"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-25T00:09:44Z", "origin_kind": "system-dev-planner", "source_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "source_path": ".dev-graph/published/feature-package-feat-skill-analysis-reports/task-specs/phase-02-architecture.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p02", "api", "skill-analysis-reports"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "個人トークンBearer認証・分析依頼・スキル連携API・DBスキーマの設計"
tracker_binding: "beads"
updated_at: "2026-09-25T00:09:44Z"
---

# SYS-SAR-P02 個人トークンBearer認証・分析依頼・スキル連携API・DBスキーマの設計

## Machine-readable registration fields

- task_id: SYS-SAR-P02
- phase_ref: P02
- feature_package_id: feature-package/feat-skill-analysis-reports
- parent_feature: feat-skill-analysis-reports
- owners: daishiman / tags: p02, api, skill-analysis-reports / related_nodes: feat-skill-analysis-reports
- workstream_kind: api
- build_target_kind: application-code
- depends_on: SYS-SAR-P01
- classification: confidence 0.95 / P02 phase slot への 1対1 写像 / tasks/feat-skill-analysis-reports/SYS-SAR-P02.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

/api/skill/* のBearer個人トークン認証ミドルウェア(GET /api/skill/export、PATCH /api/skill/requests/:id、POST /api/skill/reports(Idempotency-Key)、POST /api/skill/transcripts、POST /api/skill/media。いずれもSARのsrc/が実装するサーバ側ルートで、request_id指定済みのスキル実行経路専用)、セッション+content.write(owner/editor)認証のGET/POST /api/analysis-requests(画面駆動の依頼作成・一覧専用。Bearer個人トークンでは呼び出せない)、analysis_requests/reports/findings/psych_findings/comment_emotions/transcripts/media_assets/actions の新規テーブル設計、および.claude/skills/yt-analyze/がクライアントとして呼び出すPOST /api/skill/requests(サーバ側エンドポイント本体はAIAのSYS-AIA-P05が持つため、本taskではbackend.mdの契約に基づくリクエスト/レスポンス形だけを設計に固定する)の呼び出し契約を、docs/feat-skill-analysis-reports/architecture.md に確定させる。

## 背景

src/usecases/skill-tokens.ts と migrations/0001_platform.sql に個人トークンの発行・失効・skill_tokensテーブルは既に実装済みであり、本featureはこれを再利用してBearer検証ミドルウェアだけを新設する。migrations/0001〜0007を再走査した結果、analysis_requests/reports/findings/actions等の基本テーブルはまだ1件も作られていないため、本featureが暫定番号0011番台でCREATE TABLEする。

## 前提条件

- 先行 task: SYS-SAR-P01
- Required spec/architecture nodes: feat-skill-analysis-reports, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-skill-analysis-reports-20260925.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.14 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json
- 既存実装の前提: src/usecases/skill-tokens.ts(発行/失効/SHA-256保存, TOKEN_LIMIT=5)・migrations/0001_platform.sql の skill_tokens テーブルは変更せず再利用する

## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: 副。usecase/repository層の責務分割設計
- API: 主。/api/skill/* と /api/analysis-requests のエンドポイント設計
- Data: 副。analysis_requests/reports/findings/psych_findings/comment_emotions/transcripts/media_assets/actions のテーブル設計
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: 副。Bearer個人トークン検証・tenant_id/user_id束縛・失効トークン拒否の設計
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: documentation
- Compatibility/migration/backfill: N/A: 本 phase の成果物は スキーマ互換性 の変更を含まない

## 成果物

- docs/feat-skill-analysis-reports/architecture.md
- Consumed artifacts: docs/feat-skill-analysis-reports/requirements.md、src/usecases/skill-tokens.ts、migrations/0001_platform.sql
- Write scope: docs/feat-skill-analysis-reports/architecture.md

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- Publication mode: local_only
- Project aliases / labels / milestone: N/A: GitHub 投影を行わない
- PR completion policy: linked_pr_merged_all(linked PR が default branch へ merge されたとき完了)

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- レポート閲覧画面と改善アクション画面(feat-web-screens-actions)
- アプリ内 LLM 呼出し
- 因果推論・予測
- トークン管理画面・トークン名・1人5本上限・GET/POST/DELETE /api/skill-tokens(feat-settings-channel-link)
- AI分析画面向けの依頼取消・再実行・進捗段階・POST /api/skill/requestsのエンドポイント本体(個人トークン検証・created_via='skill'付与・content.write喪失時403の判定はAIAのsrc/。本featureはこのエンドポイントをクライアントとして呼ぶ/yt-analyzeのrequest_id無し起動分岐だけを持つ)・アーカイブ版の履歴除外・画面からのJSON取込(feat-ai-analysis-screen)
- report-design-system スキル本体の改変(更新は .claude/report-design-system.ORIGIN.md の手順で取込元から丸ごと差し替える)と、同スキル対象外の重回帰・機械学習・生存分析
- feat-youtube-daily-collection・feat-csv-media-ingest が提供する週次集計・Studio CSV・事業実績・目標のテーブル/APIの新規作成(前提として存在する境界として扱う)

## Verification and evidence

- 検証: architecture.md の API 一覧が scope_in のスキル連携API・分析依頼APIと過不足なく一致することを確認する
- 受入: /api/skill/* すべてがBearer個人トークン(SHA-256一致・tenant_id+user_id束縛・失効拒否)を必須とする設計になっている
- 受入: GET /api/skill/export の応答が行ごとにsource(api|studio_csv|business_csv)を持ち、M1〜M10と週次診断のYouTube側入力はstudio_csv由来行からのみ計算する設計になっている
- 受入: analysis_history は同一tenant_id+channel_idの完了済みレポートを新しい順に最大5件返し、履歴0件でも初回分析として正常処理する設計になっている
- 受入: analysis_requests テーブルは待機中→実行中→完了|失敗の一方向遷移のみを持ち、取消状態・created_via列は含まない(feat-ai-analysis-screen側の差分としてscope_outに明記済み)
- 受入: reports/findings/psych_findings/comment_emotions は追記専用(UPDATE禁止)の不変条件を持ち、history_versions_used列を持つ設計になっている
- 受入: POST /api/skill/reports の Idempotency-Key が request_id+版番号から導出され、同一キーの二重送信で版が増えない設計になっている
- 受入: 新規テーブル(analysis_requests/reports/findings/psych_findings/comment_emotions/transcripts/media_assets/actions)のマイグレーション暫定番号が0011番台から始まり、依存 feature(feat-youtube-daily-collection、feat-csv-media-ingest)の計画後に確定する暫定番号。実装着手時に origin/main と依存 feature 作業ブランチの migrations/ を再走査し最大番号+1 から連番で採番し直し、renumber の記録を残すという確定規則が明記されている
- 受入: /api/skill/* (Bearer個人トークン、request_id指定済みの実行経路専用、SARのsrc/が実装)と /api/analysis-requests (セッション+content.write、画面駆動の依頼作成・一覧専用)の認証方式の違いが設計に明記され、Bearer個人トークンで /api/analysis-requests を呼び出す経路、および SARのsrc/がPOST /api/skill/requestsのサーバ側ルート(エンドポイント本体)を実装する設計のいずれも含まれていない
- 受入: .claude/skills/yt-analyze/ がクライアントとして個人トークンでPOST /api/skill/requestsを呼び出す際のリクエスト/レスポンス契約(201とrequest_id、403/404の応答)がbackend.mdの定義と一致する形で設計に固定されている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: architecture.md を直前版へ戻す

## Handoff

- 次の task: SYS-SAR-P03

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/backend.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- architecture/youtube-analytics-system.md
- specs/youtube-analytics-system.md
- docs/analysis/dashboard-analysis-catalog.md
- .claude/skills/report-design-system/SKILL.md
- .claude/report-design-system.ORIGIN.md
- features/feat-skill-analysis-reports.context.json
