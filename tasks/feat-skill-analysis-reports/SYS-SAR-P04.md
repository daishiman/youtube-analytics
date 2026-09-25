---
acceptance: []
architecture_refs: []
artifact_kind: "task"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "task", "candidate_path": "tasks/feat-skill-analysis-reports/SYS-SAR-P04.md", "confidence": 0.95}]
classification_confidence: 0.95
classification_reason: "P04 phase slot への 1対1 写像"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "linked_pr_merged_all", "reconciled_at": null, "source": null, "status": "in_progress"}
confirmation_evidence: {"evaluated_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "evaluator": "system-dev-plan-evaluator", "evidence_ref": ".dev-graph/published/feature-package-feat-skill-analysis-reports/plan-findings.json"}
confirmation_status: "confirmed"
created_at: "2026-09-25T00:09:44Z"
depends_on: ["SYS-SAR-P03"]
domain: "quality"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: "feature-package/feat-skill-analysis-reports"
file_path: "tasks/feat-skill-analysis-reports/SYS-SAR-P04.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: null
graph_node_id: "SYS-SAR-P04"
implementation_readiness: {"checked_at": "2026-09-25T00:30:00Z", "missing_sections": [], "status": "complete"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: "feat-skill-analysis-reports"
phase_ref: "P04"
priority: null
project_id: "feature-package-feat-skill-analysis-reports"
pull_request_linkages: []
purpose: null
related_nodes: ["feat-skill-analysis-reports"]
resource_scope: ["tests/skill-analysis/", "tests/fixtures/skill-analysis-sample/", "scripts/skill-analysis/", "docs/feat-skill-analysis-reports/test-design.md"]
scope_in: []
scope_out: []
source_lineage: {"imported_at": "2026-09-25T00:09:44Z", "origin_kind": "system-dev-planner", "source_digest": "819fd838968d7f4a28f27b5ca133ed1a22d992549cd029677062b253c4372906", "source_path": ".dev-graph/published/feature-package-feat-skill-analysis-reports/task-specs/phase-04-test-design.md", "source_plugin": "system-dev-planner", "source_version": "0.1.0"}
start_date: null
status: "active"
tags: ["p04", "quality", "skill-analysis-reports"]
target_date: null
template_id: "task"
template_version: "1.0.0"
title: "受入12項目・履歴境界・再現性・因果断定検知のテスト設計"
tracker_binding: "beads"
updated_at: "2026-09-25T00:09:44Z"
---

# SYS-SAR-P04 受入12項目・履歴境界・再現性・因果断定検知のテスト設計

## Machine-readable registration fields

- task_id: SYS-SAR-P04
- phase_ref: P04
- feature_package_id: feature-package/feat-skill-analysis-reports
- parent_feature: feat-skill-analysis-reports
- owners: daishiman / tags: p04, quality, skill-analysis-reports / related_nodes: feat-skill-analysis-reports
- workstream_kind: quality
- build_target_kind: application-code
- depends_on: SYS-SAR-P03
- classification: confidence 0.95 / P04 phase slot への 1対1 写像 / tasks/feat-skill-analysis-reports/SYS-SAR-P04.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

acceptance 12項目それぞれを検証するテストコード・fixture・比較スクリプトを、実装前に失敗する形で用意する。

## 背景

Idempotency-Key二重送信防止・履歴tenant/channel境界・analysis.mjs再現性一致・因果断定文0件・report-design-system無改変diffのような裏側の制約は画面や型だけでは検証できないため、実装前にテストと比較スクリプトとして固定し、実装がその制約を満たすかを機械的に判定できるようにする。

## 前提条件

- 先行 task: SYS-SAR-P03
- Required spec/architecture nodes: feat-skill-analysis-reports, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-skill-analysis-reports-20260925.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.14 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json


## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: 副。テストが辿るusecase呼出しの設計
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: 副。fixtureデータ(複数tenant/channelのreports/findings/analysis_requests)の設計
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: 主。受入12項目・履歴境界・再現性・因果断定検知のテスト設計
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: N/A: 本 phase の成果物は スキーマ互換性 の変更を含まない

## 成果物

- tests/skill-analysis/
- tests/fixtures/skill-analysis-sample/(report-design-system report.mjs initで作るprofile.json/brief.json/analysis.mjsの雛形とexport fixture)
- tests/skill-analysis/fixtures/skill-requests-stub-server.mjs(backend.mdの契約通りにPOST /api/skill/requestsの201+request_id、403、404を返すスタブサーバ。AIAのエンドポイント本体が無くてもSAR側のクライアント分岐をテストできるようにする)
- scripts/skill-analysis/run-yt-analyze-fixture.mjs(--request-id 引数省略時は個人トークンでPOST /api/skill/requestsを呼ぶrequest_id無し起動分岐を実行し、指定時はその既存request_idで続行する)
- scripts/skill-analysis/verify-analysis-reproducibility.mjs
- scripts/skill-analysis/check-no-causal-language.mjs
- scripts/skill-analysis/check-rds-unmodified.mjs(.claude/report-design-system.ORIGIN.md の「取込元」行またはRDS_ORIGIN環境変数から取込元パスを解決してdiff -rする。取込元が参照できない場合はgit logの取込コミット以降の変更有無とgit diff --exit-codeで判定する)
- docs/feat-skill-analysis-reports/test-design.md
- Consumed artifacts: docs/feat-skill-analysis-reports/design-review.md
- Write scope: tests/skill-analysis/, tests/fixtures/skill-analysis-sample/, scripts/skill-analysis/, docs/feat-skill-analysis-reports/test-design.md

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

- 検証: pnpm test でテストが列挙され、実装前は失敗する
- 受入: acceptance 12項目それぞれに少なくとも1つのテストケースまたは検証スクリプトがある
- 受入: run-yt-analyze-fixture.mjs のテストは、request_id明示ありのドライラン(--request-id 引数)と、request_id無し起動でskill-requests-stub-serverを介してPOST /api/skill/requestsを呼ぶドライランの両方をカバーする
- 受入: skill-requests-stub-serverが403または404を返す場合にrunnerが非0で終了し理由メッセージを表示することを検証するテストケースがある

以下は acceptance 12項目とP06で実行・P07で判定する検証方法の対応表(test-design.mdへ転記する正本)。

| # | 受入項目 | 検証方法 |
| --- | --- | --- |
| 1 | /yt-analyze 1回で依頼→書き出し→HTML と JSON の反映まで手作業0で完了する | tests/skill-analysis/e2e-yt-analyze.test.ts で、(a)request_id明示ありの経路(既存analysis_requests行をtest fixtureで事前作成して渡す)と、(b)request_id無し起動の経路(個人トークンでPOST /api/skill/requestsを呼び依頼を作成してから続行する。エンドポイント本体はAIA(SYS-AIA-P05)が持つため、テストではbackend.mdの契約通りに201とrequest_idを返すスタブサーバ tests/skill-analysis/fixtures/skill-requests-stub-server.mjs を使う)の両方について、fixture出力(GET /api/skill/export相当)からreport.mjs init→brief.json/analysis.mjs記入→report.mjs build→POST /api/skill/reportsまでを1本のドライバ scripts/skill-analysis/run-yt-analyze-fixture.mjs で自動実行し、手動操作なしで版が1件増えることを確認する。あわせてスタブが403または404を返す場合にrunnerが非0で終了し理由を表示することを確認する。コマンド: node scripts/skill-analysis/run-yt-analyze-fixture.mjs tests/fixtures/skill-analysis-sample、および node scripts/skill-analysis/run-yt-analyze-fixture.mjs tests/fixtures/skill-analysis-sample --request-id （fixtureで事前作成したrequest_id） |
| 2 | 分析結果に週次5段ファネル・下流結果・目標未達が最大の改善候補、全指標目標達成、または判定保留理由があり、因果を断定しない | tests/skill-analysis/analysis-output.test.ts で、results JSON に5原因指標(actual/target/target_gap)・結果指標・下流結果が含まれ、target_gapが全て0以上ならcandidateがnull、負の最小値が1件ならその指標がcandidateになることをfixture複数パターンで検証する。コマンド: pnpm test tests/skill-analysis/analysis-output.test.ts |
| 3 | 同一tenant+channelの完了済み直近5版だけを履歴に使い、前回仮説の当否・施策効果・参照版番号を新規版へ保存する | tests/skill-analysis/history.test.ts で、直近5版のanalysis_historyから前回仮説当否・施策効果・参照版番号(history_versions_used)が新規版へ保存されることを検証する。コマンド: pnpm test tests/skill-analysis/history.test.ts |
| 4 | 履歴0件は初回分析として成功し、別tenant/channelの履歴は混ざらない | tests/skill-analysis/history-boundary.test.ts で、履歴0件時に初回分析として201が返ること、別tenant/別channelのfixtureレポートがanalysis_historyに混入しないことを検証する。コマンド: pnpm test tests/skill-analysis/history-boundary.test.ts |
| 5 | 改善アクションの効果比較に対象ファネル段と下流結果が含まれる | tests/skill-analysis/action-effect.test.ts で、改善アクション効果比較APIの応答に対象ファネル段・同じ原因指標・下流結果が含まれることを検証する。コマンド: pnpm test tests/skill-analysis/action-effect.test.ts |
| 6 | 同じ Idempotency-Key の二重送信で版が増えない | tests/skill-analysis/idempotency.test.ts で、同じIdempotency-KeyでPOST /api/skill/reportsを2回送信し、reportsの版数が1つしか増えないことを検証する。コマンド: pnpm test tests/skill-analysis/idempotency.test.ts |
| 7 | 過去の版は更新されない | tests/skill-analysis/append-only.test.ts で、過去版へのUPDATE操作がusecase層に存在しないこと、DBスキーマ上updated_atを更新するUPDATE文が過去版に対して実行されないことをコードパスの静的検査とDBアサーションの両方で検証する。コマンド: pnpm test tests/skill-analysis/append-only.test.ts |
| 8 | 他テナントのトークンでは export できない | tests/skill-analysis/tenant-isolation.test.ts で、他テナントの個人トークンでGET /api/skill/exportを呼ぶと403または404になることを検証する。コマンド: pnpm test tests/skill-analysis/tenant-isolation.test.ts |
| 9 | export の各行が source(api\|studio_csv\|business_csv)を持つ | tests/skill-analysis/export-source.test.ts で、GET /api/skill/exportの各行にsource(api\|studio_csv\|business_csv)が付与され、M1〜M10がstudio_csv由来の行からのみ計算されることを検証する。コマンド: pnpm test tests/skill-analysis/export-source.test.ts |
| 10 | /yt-analyze の report_html は .claude/skills/report-design-system の report.mjs build 合格物で、結果JSONの数値・target_gap・仮説判定は同じ分析フォルダの analysis.mjs を再実行した値と一致する | scripts/skill-analysis/verify-analysis-reproducibility.mjs で、同じ分析フォルダに対しanalysis.mjsを再実行し、直前にPOST /api/skill/reportsへ送った結果JSONの数値・target_gap・仮説判定と再計算値が完全一致することを比較する。コマンド: node scripts/skill-analysis/verify-analysis-reproducibility.mjs tests/fixtures/skill-analysis-sample --compare-with （直前にPOSTした報告済みresult.json）。判定基準: 数値差分0 |
| 11 | 各要因が統計的事実と解釈を分けて持ち、仮説は反証条件と採用/棄却/判定保留の判定を持つ。相関や前後関係だけで原因を断定する文が0件 | .claude/skills/report-design-system/scripts/check-report.mjs の CAUSAL_HEDGE 検出とエラーコードE21(結論/要因見出し/仮説claimでの因果断定)・E08(統計的事実欄への解釈混入)を使い、生成レポートに対して0件であることを確認する。追加で scripts/skill-analysis/check-no-causal-language.mjs で禁止表現リスト(『原因は』『〜のせいで』『〜によって引き起こされ』等の断定表現)を走査する。コマンド: node .claude/skills/report-design-system/scripts/check-report.mjs tests/fixtures/skill-analysis-sample && node scripts/skill-analysis/check-no-causal-language.mjs tests/fixtures/skill-analysis-sample。判定基準: 検出0件 |
| 12 | report-design-system は取込元と diff -r で一致する無改変のままで、YouTube 向けの差分は /yt-analyze と brief.json・analysis.mjs 側だけにある | scripts/skill-analysis/check-rds-unmodified.mjs を実行し、report-design-system が取込元から無改変であることを確認する。取込元パスは .claude/report-design-system.ORIGIN.md の「取込元」行から読み取るか、環境変数 RDS_ORIGIN での上書きを優先する。取込元パスが参照できない環境(CI等)では、取込元との diff -r の代わりに、取込コミットのSHAからHEADまでの git log で .claude/skills/report-design-system に触れたコミットが0件であること、かつ git diff --exit-code -- .claude/skills/report-design-system が変更なしであることの2条件で判定する。コマンド: node scripts/skill-analysis/check-rds-unmodified.mjs。判定基準: 取込元がある場合はdiff出力0行、ない場合は上記2条件がいずれも真 |

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: tests/skill-analysis/, tests/fixtures/skill-analysis-sample/, scripts/skill-analysis/ の追加分を削除する

## Handoff

- 次の task: SYS-SAR-P05

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
