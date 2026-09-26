# SYS-AIA-P06 テスト実行と不具合修正

## Machine-readable registration fields

- task_id: SYS-AIA-P06
- phase_ref: P06
- feature_package_id: feature-package/feat-ai-analysis-screen
- parent_feature: feat-ai-analysis-screen
- owners: daishiman / tags: p06, quality, ai-analysis-screen / related_nodes: feat-ai-analysis-screen
- workstream_kind: quality
- build_target_kind: application-code
- depends_on: SYS-AIA-P05
- classification: confidence 0.95 / P06 phase slot への 1対1 写像 / tasks/feat-ai-analysis-screen/SYS-AIA-P06.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

P04で用意したテスト・E2Eを実行し、失敗を0件まで解消したうえで、状態遷移・二重登録防止・アーカイブ除外の不変条件が実データで成立することを確認する。

## 背景

実装直後は環境差やタイミング依存の不具合が残りやすいため、P04のテスト・E2Eを実行して実データで不変条件を検証し、修正を反映する。

## 前提条件

- 先行 task: SYS-AIA-P05
- Required spec/architecture nodes: feat-ai-analysis-screen, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-ai-analysis-screen-20260924.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: 副。画面側の不具合修正
- Backend: 副。API/DB側の不具合修正
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: N/A: 本 phase の成果物は Data の変更を含まない
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: 主。P04テスト・E2Eの実行と不具合修正
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: N/A: 本 phase の成果物はスキーマ互換性に影響しない

## 成果物

- tests/analysis/ 実行結果
- e2e/analysis.spec.ts 実行結果
- Consumed artifacts: P05 の実装成果物
- Write scope: tests/analysis/, e2e/analysis.spec.ts, src/, web/

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

- 検証: pnpm test -- --reporter=verbose
- 検証: pnpm exec playwright test e2e/analysis.spec.ts
- 受入: 失敗0件・スキップ0件(P04のポーリング開始/停止テスト・900px未満の表示切替テスト・qa-092の単独テストケースを含む)
- 受入: 同じ版の同じアクションの二重登録0件(qa-091)、アーカイブ済み版のanalysis_history混入0件(qa-090)、request_id未指定取込での完了済み依頼1件作成・created_via='import'の実データ成立(qa-092)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 修正コミットを revert する

## Handoff

- 次の task: SYS-AIA-P07

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
