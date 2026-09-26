# SYS-AIA-P01 AI分析画面の要件を実装単位へ確定

## Machine-readable registration fields

- task_id: SYS-AIA-P01
- phase_ref: P01
- feature_package_id: feature-package/feat-ai-analysis-screen
- parent_feature: feat-ai-analysis-screen
- owners: daishiman / tags: p01, documentation, ai-analysis-screen / related_nodes: feat-ai-analysis-screen
- workstream_kind: documentation
- build_target_kind: application-code
- depends_on: なし(feature起点)
- classification: confidence 0.95 / P01 phase slot への 1対1 写像 / tasks/feat-ai-analysis-screen/SYS-AIA-P01.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

features/feat-ai-analysis-screen.md の scope_in 14項目・acceptance 13項目・screen_mock_grounding の可視/不可視要件を、P02以降が参照できる根拠付きの実装単位一覧(docs/feat-ai-analysis-screen/requirements.md)として確定した状態にする。

## 背景

feat-ai-analysis-screen は G1・G2・G4に資する機能であり、画面モック(docs配下)と要件定義・backend・ui-ux各章の質疑応答がその確定仕様である。画面には現れない取消・409・429・監査ログ・アーカイブ除外・二重登録防止などの制約は仕様文書側にのみ存在するため、実装着手前にそれらを一覧化して見落としを防ぐ必要がある。

## 前提条件

- 先行 task: なし(feature起点)
- Required spec/architecture nodes: feat-ai-analysis-screen, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-ai-analysis-screen-20260924.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
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
- Compatibility/migration/backfill: N/A: 本 phase の成果物はスキーマ互換性に影響しない

## 成果物

- docs/feat-ai-analysis-screen/requirements.md
- Consumed artifacts: features/feat-ai-analysis-screen.context.json、画面モック、分析カタログドキュメント
- Write scope: docs/feat-ai-analysis-screen/requirements.md

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- Publication mode: local_only
- Project aliases / labels / milestone: N/A: GitHub 投影を行わない
- PR completion policy: linked_pr_merged_all(linked PR が default branch へ merge されたとき完了)

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- 個人トークンの検証・スキル連携のエクスポート/レポート取込本体と履歴射影本体・週次自動実行の設定(基盤feature)
- 改善アクション画面と改善アクション集約の状態遷移・詳細API(改善アクションfeature)
- 共通レイアウトと既存共通部品の作成・設定画面の機能(共通レイアウトfeature)
- テナント別 OAuth クライアントの実装設計の見直し
- アプリ内 LLM 呼出し・因果推論・Web からの Claude Code 実行の停止(取消は以後の送信拒否だけ)
- 画像の配色の採用と新しい色トークンの追加、全文検索索引の作成

## Verification and evidence

- 検証: requirements.md の対応表の行数が scope_in14件+acceptance13件=27件と一致することを目視確認する
- 検証: requirements.md 内の qa-番号参照がすべて system-spec/00-requirements-definition.md・backend.md・ui-ux.md に実在することを grep で確認する
- 受入: features/feat-ai-analysis-screen.md の scope_in 14項目と acceptance 13項目のすべてに、requirements.md 上で根拠章・区画/API・検証方法が1対1で対応している
- 受入: qa-089〜qa-097・appr-015・appr-016 の裏付け質疑がそれぞれどの受入項目の根拠かを requirements.md の対応表に明記している
- 受入: docs/analysis/dashboard-analysis-catalog.md §6 の JSON 形(brief/results/history_review/psych_findings/ideas/actions/report_html)を取込先の正本として requirements.md に固定している

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: requirements.md を直前版へ戻す

## Handoff

- 次の task: SYS-AIA-P02

## 参照情報

- system-spec/index.md
- system-spec/00-requirements-definition.md
- system-spec/ui-ux.md
- system-spec/frontend.md
- system-spec/backend.md
- system-spec/auth.md
- system-spec/security.md
- system-spec/database.md
- system-spec/maintenance-ops.md
- architecture/youtube-analytics-system.md
- specs/youtube-analytics-system.md
- docs/analysis/dashboard-analysis-catalog.md
- docs/screens/03-ai-analysis.png
- features/feat-ai-analysis-screen.context.json
