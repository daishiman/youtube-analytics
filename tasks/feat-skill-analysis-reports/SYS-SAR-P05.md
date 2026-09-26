---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-skill-analysis-reports/SYS-SAR-P05.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P05 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-skill-analysis-reports/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-25T00:09:44Z"
depends_on: ["SYS-SAR-P04"]
domain: "backend"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-skill-analysis-reports"
file_path: "tasks/feat-skill-analysis-reports/SYS-SAR-P05.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-SAR-P05"
implementation_readiness: {"checked_at": "2026-09-25T00:30:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-skill-analysis-reports"
phase_ref: "P05"
priority: null
project_id: "feature-package-feat-skill-analysis-reports"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-skill-analysis-reports"]
resource_scope: ["src/", "migrations/(追加する5本。ファイル名と番号は成果物節の確定規則で決め、計画時点の暫定番号は0011〜0015)", ".claude/skills/yt-analyze/", "ops/launchd/"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-25T00:09:44Z", "origin_kind": "system-dev-planner", "source_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "source_path": ".dev-graph/published/feature-package-feat-skill-analysis-reports/task-specs/phase-05-implementation.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p05", "backend", "skill-analysis-reports"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "Bearer認証・分析依頼/スキル連携API・DB新規テーブル・/yt-analyzeスキル・launchd週次実行の実装"
tracker_binding: "beads"
updated_at: "2026-09-25T00:09:44Z"
---

# SYS-SAR-P05 Bearer認証・分析依頼/スキル連携API・DB新規テーブル・/yt-analyzeスキル・launchd週次実行の実装

## Machine-readable registration fields

- task_id: SYS-SAR-P05
- phase_ref: P05
- feature_package_id: feature-package/feat-skill-analysis-reports
- parent_feature: feat-skill-analysis-reports
- owners: daishiman / tags: p05, backend, skill-analysis-reports / related_nodes: feat-skill-analysis-reports
- workstream_kind: backend
- build_target_kind: application-code
- depends_on: SYS-SAR-P04
- classification: confidence 0.95 / P05 phase slot への 1対1 写像 / tasks/feat-skill-analysis-reports/SYS-SAR-P05.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

P01〜P04で確定した要件・設計・テストに基づき、Bearer個人トークン検証ミドルウェア、GET/POST /api/analysis-requests(セッション+content.write専用の画面API)、GET /api/skill/export、PATCH /api/skill/requests/:id、POST /api/skill/reports(Idempotency-Key)、POST /api/skill/transcripts、POST /api/skill/media(以上のskillルートはいずれもrequest_id指定済みの実行経路専用)、新規テーブル、Claude Code用 /yt-analyze スキル(request_id無し起動時は個人トークンでPOST /api/skill/requestsを呼び依頼を作成してから続行する分岐を持つ。エンドポイント本体はAIAのSYS-AIA-P05が持つため、SARのsrc/には作らない。403/404時は非0終了)、launchd週次実行の設定(plist・runnerスクリプト。通常運用ではrequest_idを渡さず起動し、/yt-analyze自身が依頼作成分岐を実行する。dry-run/テスト用に既存request_idを明示指定するオプションも持つ)を実装し、P04のテストが通る状態にする。

## 背景

src/usecases/skill-tokens.ts の個人トークン発行/失効とskill_tokensテーブルは既存実装を再利用し、本taskはBearer検証ミドルウェアと分析依頼/スキル連携APIの新規実装、およびanalysis_requests/reports/findings/psych_findings/comment_emotions/transcripts/media_assets/actionsの新規テーブル作成を行う。GET/POST /api/analysis-requestsはセッション+content.write認証の画面向けAPIとして実装するが、Bearer個人トークンからは呼び出せない別経路である。goal-specのweekly_run_boundary_noteにより、/yt-analyzeはrequest_id無し起動時に個人トークンでPOST /api/skill/requestsをクライアントとして呼ぶ(このエンドポイント本体・サーバ側ルートはfeat-ai-analysis-screenのSYS-AIA-P05のsrc/が持ち、SARのsrc/には作らない)。週次集計・Studio CSV由来テーブル(daily_metrics/video_metrics等)はfeat-youtube-daily-collection・feat-csv-media-ingestが作る前提境界として、テストではfixture/スタブで代替する。

## 前提条件

- 先行 task: SYS-SAR-P04
- Required spec/architecture nodes: feat-skill-analysis-reports, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-skill-analysis-reports-20260925.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.14 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json
- マイグレーション適用前提: skill_tokens(migrations/0001_platform.sql)は既存のまま再利用する。daily_metrics/video_metrics等の週次集計・Studio CSV由来テーブルはfeat-youtube-daily-collection・feat-csv-media-ingestが作る前提境界であり、本taskではfixture/スタブで代替し新規作成しない

## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: 主。Bearer認証ミドルウェア・usecase/repository層の実装
- API: 副。/api/skill/* と /api/analysis-requests の実装
- Data: 副。新規テーブルのマイグレーション実装
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: 副。トークン検証・監査ログの実装
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: 副。/yt-analyze スキルのSKILL.md/promptsの記述
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: 新規マイグレーション5件(analysis_requests/reports+findings/actions/psych_findings+comment_emotions/transcripts+media_assets)は追加のみで既存テーブルを壊さない。skill_tokensは変更しない。マイグレーション暫定番号0011〜0015は依存 feature(feat-youtube-daily-collection、feat-csv-media-ingest)の計画後に確定する暫定番号。実装着手時に origin/main と依存 feature 作業ブランチの migrations/ を再走査し最大番号+1 から連番で採番し直し、renumber の記録を残す

## 成果物

- src/http/skill-routes.ts(/api/skill/export, /api/skill/reports, /api/skill/requests(PATCH のみ。POSTは含まない), /api/skill/transcripts, /api/skill/media。いずれもBearer個人トークン+request_id指定済みの実行経路専用)
- src/http/analysis-requests-routes.ts(GET/POST /api/analysis-requests。セッション+content.write専用の画面API。Bearer個人トークンのミドルウェアは適用しない)
- src/http/middleware.ts への skill Bearer 認証ミドルウェア追加
- src/usecases/skill-analysis.ts(export/report取込/idempotency/history投影/action効果比較。POST /api/skill/requestsのサーバ側usecase(依頼の新規作成)は含まない。それはAIAのSYS-AIA-P05が持つ)
- src/repositories/skill-analysis-repository.ts
- migrations/0011_analysis_requests.sql（計画時点の暫定番号）
- migrations/0012_reports_findings.sql（同上）
- migrations/0013_actions.sql（同上）
- migrations/0014_psych_findings_comment_emotions.sql（同上）
- migrations/0015_transcripts_media_assets.sql（同上）
- .claude/skills/yt-analyze/SKILL.md、.claude/skills/yt-analyze/prompts/(request_id無し起動時は個人トークンでPOST /api/skill/requestsを呼んで依頼を作成し、返ってきたrequest_idでexport→PATCH→init/brief/analysis/build→POST reportsまで続行する。エンドポイントが未提供(404)または403の場合は非0で終了し理由を表示する。request_idを明示指定した場合はその値で続行する)
- ops/launchd/com.youtube-analytics.weekly-analysis.plist(週次スケジュール定義)、ops/launchd/run-weekly-analysis.sh(個人トークンの取得元・ログ出力先・終了コード・失敗時ハンドリングを定義するrunner。通常運用ではrequest_idを渡さずに/yt-analyzeを起動する(依頼作成は/yt-analyze自身が行う)。dry-run/テスト用に既存request_idを明示指定するオプションを持つ)、ops/launchd/README.md
- マイグレーション番号の確定規則: 実装着手時に origin/main と依存 feature(feat-youtube-daily-collection, feat-csv-media-ingest)の作業ブランチの migrations/ を再走査し、現存最大番号+1 から5件を連番で採番し直す。重複が判明した場合は空き番号へ付け替え、eval-log/renumber-receipt-feat-skill-analysis-reports-実施日.json（形式は eval-log/renumber-receipt-feat-settings-channel-link-20260924.json に準じる）に記録する
- Consumed artifacts: docs/feat-skill-analysis-reports/test-design.md、tests/skill-analysis/、.claude/skills/report-design-system/(無改変で呼び出すだけ)
- Write scope: src/, migrations/(追加する5本。ファイル名と番号は成果物節の確定規則で決め、計画時点の暫定番号は0011〜0015), .claude/skills/yt-analyze/, ops/launchd/

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

- 検証: pnpm test
- 検証: npx wrangler d1 migrations apply DB --local
- 検証: node scripts/skill-analysis/run-yt-analyze-fixture.mjs tests/fixtures/skill-analysis-sample（request_id無し起動、スタブサーバ経由でPOST /api/skill/requestsを呼ぶ）
- 検証: node scripts/skill-analysis/run-yt-analyze-fixture.mjs tests/fixtures/skill-analysis-sample --request-id （fixtureで事前作成したrequest_id）
- 検証: plutil -lint ops/launchd/com.youtube-analytics.weekly-analysis.plist
- 受入: P04 のテストがすべて通る
- 受入: .claude/skills/report-design-system/ 配下に一切書き込みが発生していない(git diff --stat の対象に含まれない)
- 受入: .claude/skills/yt-analyze/ は .claude/skills/report-design-system を無改変のまま呼び出すだけで、YouTube向けの差分は /yt-analyze と brief.json・analysis.mjs 側だけにある
- 受入: ops/launchd/run-weekly-analysis.sh は通常運用時はrequest_idを渡さずに/yt-analyzeを起動し、/yt-analyzeが個人トークンでPOST /api/skill/requestsを呼んで依頼を作成する。GET/POST /api/analysis-requestsは呼び出さない
- 受入: SARのsrc/にPOST /api/skill/requestsのサーバ側ルート(エンドポイント本体)が存在しない

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 機能ブランチの revert とローカル D1 の再作成

## Handoff

- 次の task: SYS-SAR-P06

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
