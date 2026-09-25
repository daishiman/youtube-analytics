# SYS-AIA-P08 共通化の整理とマイグレーション整理

## Machine-readable registration fields

- task_id: SYS-AIA-P08
- phase_ref: P08
- feature_package_id: feature-package/feat-ai-analysis-screen
- parent_feature: feat-ai-analysis-screen
- owners: daishiman / tags: p08, data, ai-analysis-screen / related_nodes: feat-ai-analysis-screen
- workstream_kind: data
- build_target_kind: application-code
- depends_on: SYS-AIA-P07
- classification: confidence 0.95 / P08 phase slot への 1対1 写像 / tasks/feat-ai-analysis-screen/SYS-AIA-P08.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

実装で生じた重複・仮実装をリファクタリングし、追加マイグレーションを最終形へ整理したうえで、P06のテストが引き続き green であることを確認する。

## 背景

実装フェーズでは速度優先で重複コードやマイグレーションの仮置きが生じやすいため、リリース前に整理し保守性を確保する。

## 前提条件

- 先行 task: SYS-AIA-P07
- Required spec/architecture nodes: feat-ai-analysis-screen, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-ai-analysis-screen-20260924.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: 副。重複コードの整理
- Backend: N/A: 本 phase の成果物は Backend の変更を含まない
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: 主。追加マイグレーションの整理
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: 追加マイグレーションの整理は空DBへの適用順序を変えない範囲に限る。P05で採番したマイグレーション番号(計画時点の暫定番号は0008〜0010)は、依存 feature(feat-skill-analysis-reports, feat-web-screens-actions)側の番号帯と衝突していないかを本 task で再確認し、衝突があれば P05 の確定規則(origin/main と依存 feature ブランチの migrations/ を再走査し既存最大番号+1から連番で振り直す)に従って付け替える

## 成果物

- 整理後の web/, src/, migrations/(P05で確定したマイグレーション番号。計画時点の暫定番号は0008〜0010)
- マイグレーション番号の衝突検査: 実装着手後に付け替えが発生していないか origin/main と依存 feature ブランチの migrations/ 番号帯を突合し、重複があれば付け替えて eval-log/renumber-receipt-feat-ai-analysis-screen-実施日.json(形式は eval-log/renumber-receipt-feat-settings-channel-link-20260924.json に準じる)に記録する
- Consumed artifacts: P07 の受入結果
- Write scope: web/, src/, migrations/

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
- 検証: npx wrangler d1 migrations apply DB --local を空 DB で実行
- 受入: 振る舞い変更0件(P06 のテストが引き続き green)
- 受入: 空の D1 へ、その時点で確定しているマイグレーション番号(計画時点の暫定番号は0008〜0010)が依存 feature のマイグレーションに続く形で順に成功する
- 受入: 番号の重複検査を実行し、衝突がない、または衝突を付け替えて eval-log/renumber-receipt-feat-ai-analysis-screen-実施日.json に記録済みである

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 整理コミットを revert する

## Handoff

- 次の task: SYS-AIA-P09

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
