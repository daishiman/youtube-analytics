# SYS-SAR-P12 運用手順『launchd週次実行の監視と障害対応』とドキュメント

## Machine-readable registration fields

- task_id: SYS-SAR-P12
- phase_ref: P12
- feature_package_id: feature-package/feat-skill-analysis-reports
- parent_feature: feat-skill-analysis-reports
- owners: daishiman / tags: p12, operations, skill-analysis-reports / related_nodes: feat-skill-analysis-reports
- workstream_kind: operations
- build_target_kind: application-code
- depends_on: SYS-SAR-P10
- classification: confidence 0.95 / P12 phase slot への 1対1 写像 / tasks/feat-skill-analysis-reports/SYS-SAR-P12.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

launchd週次実行の失敗時調査・個人トークン失効時の対応・レポート取込失敗の再試行など運用時に必要な手順をrunbookとして整備し、README等の関連ドキュメントを更新する。runbookには、launchd runnerが通常運用ではrequest_idを渡さずに/yt-analyzeを起動し、/yt-analyze自身が個人トークンでPOST /api/skill/requestsを呼んで依頼を作成すること、および本番launchctl bootstrap有効化はfeat-ai-analysis-screenがPOST /api/skill/requestsのエンドポイント本体を出荷した後の運用前提条件であることを明記する。

## 背景

launchd週次実行・個人トークン失効・取込失敗は運用中に問い合わせが発生しやすい領域であり、対応手順を事前に文書化しておく必要がある。本featureのlaunchd設定と/yt-analyzeはrequest_id無し起動時の依頼作成クライアント処理まで含むが、そのクライアントが呼び出すPOST /api/skill/requestsのサーバ側エンドポイント本体はfeat-ai-analysis-screenの差分であるため、本番でこの呼び出しが機能するにはAIA側の実装出荷が前提になる。この運用前提をrunbookに明記しないと本番有効化の判断を誤る。

## 前提条件

- 先行 task: SYS-SAR-P10
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
- Documentation: 副。README等の更新
- Operations: 主。launchd週次実行の監視・障害対応runbook整備

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: documentation
- Compatibility/migration/backfill: N/A: 本 phase の成果物は スキーマ互換性 の変更を含まない

## 成果物

- docs/feat-skill-analysis-reports/runbook.md
- README.md の更新
- Consumed artifacts: P10 の final-review.md、ops/launchd/README.md
- Write scope: docs/feat-skill-analysis-reports/runbook.md, README.md

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

- 検証: runbook の手順をローカル環境で1回通す(launchd job の手動起動含む)
- 検証: plutil -lint ops/launchd/com.youtube-analytics.weekly-analysis.plist を実行し、構文と週次スケジュール値(StartCalendarInterval等)が意図通りであることを確認する
- 受入: 初見の担当者が runbook だけでlaunchd週次実行の失敗調査・個人トークン失効時の対応・レポート取込失敗の再試行を行える
- 受入: runbookに、launchd runnerは通常運用時はrequest_idを渡さずに/yt-analyzeを起動し、/yt-analyzeが個人トークンでPOST /api/skill/requestsを呼んで依頼を作成すること(dry-run/テスト用にrequest_idを明示指定するオプションもある)が明記されている
- 受入: runbookに、本番launchctl bootstrap有効化はfeat-ai-analysis-screenがPOST /api/skill/requestsのエンドポイント本体(SYS-AIA-P05のsrc/)を出荷した後の運用前提条件であること(task依存関係やDAG上のdepends_onではなく、運用手順上の前提として)が明記されている
- 受入: runbookに、POST /api/skill/requestsが403(content.write喪失等)または404(未出荷)を返す場合の障害対応手順(エラーメッセージの確認・AIA側出荷状況の確認)が記載されている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: ドキュメントを直前版へ戻す

## Handoff

- 次の task: SYS-SAR-P13

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
