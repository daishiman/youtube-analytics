# SYS-SAR-P01 個人トークン認証・分析依頼・スキル連携API・履歴・レポート版・launchd週次実行の要件を実装単位へ確定

## Machine-readable registration fields

- task_id: SYS-SAR-P01
- phase_ref: P01
- feature_package_id: feature-package/feat-skill-analysis-reports
- parent_feature: feat-skill-analysis-reports
- owners: daishiman / tags: p01, documentation, skill-analysis-reports / related_nodes: feat-skill-analysis-reports
- workstream_kind: documentation
- build_target_kind: application-code
- depends_on: なし(feature起点)
- classification: confidence 0.95 / P01 phase slot への 1対1 写像 / tasks/feat-skill-analysis-reports/SYS-SAR-P01.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

features/feat-skill-analysis-reports.md の scope_in 11項目・acceptance 12項目・invisible_requirements_grounding 16項目(特にI5/qa-095の週次実行契約)を、P02以降が参照できる根拠付きの実装単位一覧(docs/feat-skill-analysis-reports/requirements.md)として確定した状態にする。requirements.mdには、I5/qa-095の各要素(依頼の自動作成・実行中で作成・request_id必須のexport)ごとに、担当する側(SARのクライアント=.claude/skills/yt-analyze/ か AIAのエンドポイント本体=SYS-AIA-P05のsrc/)を1行ずつ対応させた表を含める。

## 背景

本featureはLLMをアプリ内で呼ばず、各利用者のClaude Code上のreport-design-systemスキルの計算結果を版管理レポートとして取り込む。goal-spec の weekly_run_boundary_note により、launchd週次実行(I5/qa-095)は次のように分担する: SARは .claude/skills/yt-analyze/ を排他的write_scopeとして持ち、request_id無し起動時に個人トークンでPOST /api/skill/requestsを呼んで依頼を作成してからexport以降へ進むクライアント側分岐を実装する。POST /api/skill/requestsのエンドポイント本体(個人トークン検証・created_via='skill'・content.write喪失時403)はfeat-ai-analysis-screen(SYS-AIA-P05のsrc/)が持つ。個人トークン発行・依頼取消・進捗段階は他feature(feat-settings-channel-link, feat-ai-analysis-screen)が所有し、週次集計・Studio CSV由来テーブルは前提として存在する境界であるため、着手前にこれらの境界とacceptance12項目の根拠を一覧化して見落としを防ぐ必要がある。「/api/analysis-requests」(セッション+content.write)と「/api/skill/*」(Bearer個人トークン)は認証方式が異なり、Bearer個人トークンで/api/analysis-requestsを呼び出す経路は存在しないことを本featureの境界として明記する。

## 前提条件

- 先行 task: なし(feature起点)
- Required spec/architecture nodes: feat-skill-analysis-reports, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-skill-analysis-reports-20260925.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.14 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json


## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: N/A: 本 phase の成果物は Backend の変更を含まない
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: N/A: 本 phase の成果物は Data の変更を含まない
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: 主。feature定義と確定仕様のQ&Aを対応表として requirements.md にまとめる
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: documentation
- Compatibility/migration/backfill: N/A: 本 phase の成果物は スキーマ互換性 の変更を含まない

## 成果物

- docs/feat-skill-analysis-reports/requirements.md
- Consumed artifacts: features/feat-skill-analysis-reports.context.json、system-spec各章、docs/analysis/dashboard-analysis-catalog.md、.claude/skills/report-design-system/SKILL.md
- Write scope: docs/feat-skill-analysis-reports/requirements.md

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

- 検証: requirements.md の対応表の行数が scope_in11件+acceptance12件=23件と一致することを目視確認する
- 検証: requirements.md 内の qa-番号参照(qa-021・qa-025〜029・qa-035・qa-037・qa-053・qa-054・qa-060・qa-083・qa-089〜097・appr-015・appr-016)がすべて system-spec/*.md に実在することを grep で確認する
- 受入: features/feat-skill-analysis-reports.md の scope_in 11項目と acceptance 12項目のすべてに、requirements.md 上で根拠章・区画/API・検証方法が1対1で対応している
- 受入: 個人トークン発行/失効(feat-settings-channel-link)・POST /api/skill/requestsのエンドポイント本体/依頼取消/進捗段階(feat-ai-analysis-screen)・週次集計/Studio CSV由来テーブル(feat-youtube-daily-collection, feat-csv-media-ingest)を、この feature が実装しない前提境界として requirements.md に明記している
- 受入: docs/analysis/dashboard-analysis-catalog.md §6 の JSON 形(brief/results/history_review/psych_findings/ideas/actions/report_html)を取込先の正本として requirements.md に固定している
- 受入: requirements.md に、I5/qa-095の要素(依頼の自動作成・実行中で作成・request_id必須のexport)ごとに担当側(SARのクライアント=.claude/skills/yt-analyze/ か AIAのエンドポイント本体=SYS-AIA-P05のsrc/)を1行ずつ対応させた表があり、SARが/yt-analyzeのrequest_id無し起動分岐(個人トークンでPOST /api/skill/requestsを呼ぶクライアント処理)を実装することが明記されている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: requirements.md を直前版へ戻す

## Handoff

- 次の task: SYS-SAR-P02

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
