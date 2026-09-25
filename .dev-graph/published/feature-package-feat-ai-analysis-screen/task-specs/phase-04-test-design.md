# SYS-AIA-P04 受入テスト・状態遷移テスト・3サイズE2Eの設計

## Machine-readable registration fields

- task_id: SYS-AIA-P04
- phase_ref: P04
- feature_package_id: feature-package/feat-ai-analysis-screen
- parent_feature: feat-ai-analysis-screen
- owners: daishiman / tags: p04, quality, ai-analysis-screen / related_nodes: feat-ai-analysis-screen
- workstream_kind: quality
- build_target_kind: application-code
- depends_on: SYS-AIA-P03
- classification: confidence 0.95 / P04 phase slot への 1対1 写像 / tasks/feat-ai-analysis-screen/SYS-AIA-P04.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

受入13項目・状態遷移(待機中→実行中→完了|失敗|取消)・409/429/422・アクション二重登録防止・3サイズ表示を検証するテストコードとE2Eシナリオを、実装前に失敗する形で用意する。

## 背景

state machineや409/429/422のような裏側の制約はUIの見た目だけでは検証できないため、実装前にテストとして固定し、実装がその制約を満たすかどうかを機械的に判定できるようにする。

## 前提条件

- 先行 task: SYS-AIA-P03
- Required spec/architecture nodes: feat-ai-analysis-screen, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-ai-analysis-screen-20260924.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: 副。E2Eシナリオが辿るAnalysisPage操作の設計
- Backend: N/A: 本 phase の成果物は Backend の変更を含まない
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: N/A: 本 phase の成果物は Data の変更を含まない
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: 主。受入・状態遷移・409/429/422・二重登録防止・3サイズE2Eのテスト設計
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: N/A: 本 phase の成果物はスキーマ互換性に影響しない

## 成果物

- tests/analysis/
- e2e/analysis.spec.ts
- docs/feat-ai-analysis-screen/test-design.md
- Consumed artifacts: docs/feat-ai-analysis-screen/design-review.md
- Write scope: tests/analysis/, e2e/analysis.spec.ts, docs/feat-ai-analysis-screen/test-design.md

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

- 検証: pnpm test でテストが列挙され、実装前は失敗する
- 受入: 受入13項目それぞれに少なくとも1つのテストケースがある
- 受入: analysis_requests の一方向遷移・終端不変・409 REQUEST_CANCELED・429・422 INVALID_REPORT_JSON・UNIQUE(tenant_id,source_report_id,source_key)二重登録防止の各テストケースが揃っている(qa-089〜qa-091)
- 受入: qa-092(取込先の request_id 未指定時の挙動)を独立したテストケースとして検証する。request_id 指定時はその依頼が完了になること、未指定時は完了済み依頼が1件作られ created_via='import' になることの両方をそれぞれ検証する
- 受入: ポーリングの開始・停止を個別のテストケースとして検証する。待機中・実行中の行が0件なら停止すること、document.visibilityState=hidden の間は停止すること、visible に戻ると再開すること、取得間隔が10秒であることをそれぞれ検証する
- 受入: 幅900px未満の表示切替を個別のテストケースとして検証する。2カラムが縦に積まれること、表がカードになること、下部バーが下部タブの上に固定されることを、それぞれ390×844と820×1180の両サイズで検証する
- 受入: Playwright の390×844/820×1180/1440×900の3サイズで依頼→コピー→取込→登録→比較→アーカイブのE2Eシナリオが定義されている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: tests/analysis/ と e2e/analysis.spec.ts の追加分を削除する

## Handoff

- 次の task: SYS-AIA-P05

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
