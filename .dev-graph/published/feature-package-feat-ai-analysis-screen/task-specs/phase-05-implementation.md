# SYS-AIA-P05 AnalysisPage・分析/レポートAPI・DB拡張・表示語置換の実装

## Machine-readable registration fields

- task_id: SYS-AIA-P05
- phase_ref: P05
- feature_package_id: feature-package/feat-ai-analysis-screen
- parent_feature: feat-ai-analysis-screen
- owners: daishiman / tags: p05, frontend, ai-analysis-screen / related_nodes: feat-ai-analysis-screen
- workstream_kind: frontend
- build_target_kind: application-code
- depends_on: SYS-AIA-P04
- classification: confidence 0.95 / P05 phase slot への 1対1 写像 / tasks/feat-ai-analysis-screen/SYS-AIA-P05.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

AnalysisPage・共通部品(ProgressBar/DateRangePicker)・分析/レポートAPI・analysis_requests/report_archives/actions拡張・利用者向け表記統一を実装し、P04のテストが通る状態にする。

## 背景

P01〜P04で確定した要件・設計・テストに基づき、AnalysisPage/API/DBの実コードを作成する。基盤の分析依頼・レポートテーブルの存在を前提に、拡張列・アーカイブテーブル・アクション拡張を追加する。

## 前提条件

- 先行 task: SYS-AIA-P04
- Required spec/architecture nodes: feat-ai-analysis-screen, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-ai-analysis-screen-20260924.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json
- マイグレーション適用前提: 依存 feature(feat-skill-analysis-reports, feat-web-screens-actions)が作る analysis_requests / reports / actions の各テーブルが先に存在すること。本 task の3件は、それらを ALTER または参照する形で、依存 feature のマイグレーションより後ろの番号で適用する

## Workstream applicability

- Frontend: 主。AnalysisPage・共通部品・表記統一の実装
- Backend: 副。usecase/repository層の実装
- API: 副。画面用API・レポートAPI・スキル連携API差分の実装
- Data: 副。追加マイグレーションの実装
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: 副。権限境界・Origin検査・rate limit・監査ログの実装
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: 追加する3件のマイグレーションは追加のみで既存テーブルを壊さない。基盤feature が作成する分析依頼・レポートテーブルの存在を前提にALTER/新規テーブルを追加する。3件は依存 feature(feat-skill-analysis-reports, feat-web-screens-actions)が作る analysis_requests / reports / actions のテーブルが先に存在する前提のもとで、それらより後ろの番号で適用する

## 成果物

- web/pages/AnalysisPage.tsx
- web/components/(ProgressBar/DateRangePicker)
- src/http/ の分析関連ルート
- src/usecases/ の分析関連usecase
- migrations/0008_analysis_requests_extension.sql（計画時点の暫定番号。実装着手時に下記の確定規則で番号を確定する）
- migrations/0009_report_archives.sql（同上、計画時点の暫定番号）
- migrations/0010_actions_source_report.sql（同上、計画時点の暫定番号）
- マイグレーション番号の確定規則:
  - 実装着手時に origin/main の migrations/ と、依存 feature(feat-skill-analysis-reports, feat-web-screens-actions)の作業ブランチの migrations/ を確認し、それらの現存最大番号+1 から3件を連番で採番し直す
  - 着手前に番号の重複を検査する。rebase/merge によって他ブランチが同じ番号帯を先に採番していたことが判明した場合は、本 task のファイル名とマイグレーション内参照を空き番号へ付け替える
  - 付け替えを行った場合は、eval-log/renumber-receipt-feat-ai-analysis-screen-実施日.json（実施日は付け替えを行った日の YYYYMMDD。形式は eval-log/renumber-receipt-feat-settings-channel-link-20260924.json に準じる: receipt_kind/graph_node_id/beads_id/recorded_at/reason/mapping/not_rewritten）に記録する
- Consumed artifacts: docs/feat-ai-analysis-screen/test-design.md、先行 task の成果物
- Write scope: web/, src/, migrations/(追加する3本。ファイル名と番号は成果物節の確定規則で決め、計画時点の暫定番号は0008〜0010), public/privacy.html, public/terms.html

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

- 検証: pnpm test
- 検証: npx wrangler d1 migrations apply DB --local
- 検証: pnpm exec playwright test e2e/analysis.spec.ts
- 受入: P04 のテストがすべて通る
- 受入: ページ固有の色指定が既存 CSS 変数以外0件である(qa-080)
- 受入: 利用者に見える画面・APIエラー・規約2ページに『ワークスペース』『テナント』が0件で『チャンネル管理』に揃っている(qa-096)

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 機能ブランチの revert とローカル D1 の再作成

## Handoff

- 次の task: SYS-AIA-P06

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
