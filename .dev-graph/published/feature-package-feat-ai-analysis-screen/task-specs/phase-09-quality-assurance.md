# SYS-AIA-P09 セキュリティと品質の保証

## Machine-readable registration fields

- task_id: SYS-AIA-P09
- phase_ref: P09
- feature_package_id: feature-package/feat-ai-analysis-screen
- parent_feature: feat-ai-analysis-screen
- owners: daishiman / tags: p09, security, ai-analysis-screen / related_nodes: feat-ai-analysis-screen
- workstream_kind: security
- build_target_kind: application-code
- depends_on: SYS-AIA-P08
- classification: confidence 0.95 / P09 phase slot への 1対1 写像 / tasks/feat-ai-analysis-screen/SYS-AIA-P09.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

依存脆弱性・静的解析・秘匿情報漏えい・iframeサンドボックスなどのセキュリティ/品質観点を検査し、high以上の指摘0件の状態にする。

## 背景

機微情報(個人トークン・依頼プロンプト)の取り扱いとHTMLレポートのXSS境界(sandbox iframe)は、確定仕様で明示された制約であり、リリース前に機械的検査で担保する必要がある。

## 前提条件

- 先行 task: SYS-AIA-P08
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
- Security: 主。脆弱性・秘匿情報・iframeサンドボックスの検査
- Quality: 副。lint/型検査の実行
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: documentation
- Compatibility/migration/backfill: N/A: 本 phase の成果物はスキーマ互換性に影響しない

## 成果物

- docs/feat-ai-analysis-screen/qa-report.md
- Consumed artifacts: P08 の整理結果
- Write scope: docs/feat-ai-analysis-screen/qa-report.md

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

- 検証: pnpm lint
- 検証: npx tsc --noEmit
- 検証: pnpm audit --audit-level=high
- 受入: high 以上の脆弱性0件
- 受入: 個人トークン平文・依頼プロンプト内のトークン平文がリポジトリとログに現れない
- 受入: HTMLレポートの iframe に allow-scripts が付いていない

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: qa-report.md の是正事項を P05 へ差し戻す

## Handoff

- 次の task: SYS-AIA-P10

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
