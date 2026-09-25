# SYS-SAR-P03 テナント境界・トークン失効・二重送信防止・非因果出力の設計レビュー

## Machine-readable registration fields

- task_id: SYS-SAR-P03
- phase_ref: P03
- feature_package_id: feature-package/feat-skill-analysis-reports
- parent_feature: feat-skill-analysis-reports
- owners: daishiman / tags: p03, security, skill-analysis-reports / related_nodes: feat-skill-analysis-reports
- workstream_kind: security
- build_target_kind: application-code
- depends_on: SYS-SAR-P02
- classification: confidence 0.95 / P03 phase slot への 1対1 写像 / tasks/feat-skill-analysis-reports/SYS-SAR-P03.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

他テナントのトークンによるexport拒否・失効トークン拒否・Idempotency-Keyによる二重送信防止・過去版の追記専用不変条件・非因果的出力(target_gap最小候補/全指標達成/候補なし)という不可視要件が設計に漏れなく反映されていることをレビューで確認し、是正が必要な項目を0件にする。

## 背景

tenant境界・トークン失効・二重送信防止・因果断定回避は画面を持たないAPI/スキル連携featureであっても見落とすと本番で他テナントのデータ越境や版の重複が発生するため、P02の設計をQ&Aと突き合わせて是正する。

## 前提条件

- 先行 task: SYS-SAR-P02
- Required spec/architecture nodes: feat-skill-analysis-reports, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(readiness report: eval-log/plan-readiness-feat-skill-analysis-reports-20260925.json, completeness_verdict PASS)
- Source pin: system-spec-harness v0.1.14 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json


## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: N/A: 本 phase の成果物は Backend の変更を含まない
- API: 副。403/404/409の応答契約レビュー
- Data: N/A: 本 phase の成果物は Data の変更を含まない
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: 主。テナント境界・トークン失効・二重送信防止・監査ログのレビュー
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: documentation
- Compatibility/migration/backfill: N/A: 本 phase の成果物は スキーマ互換性 の変更を含まない

## 成果物

- docs/feat-skill-analysis-reports/design-review.md
- Consumed artifacts: docs/feat-skill-analysis-reports/architecture.md
- Write scope: docs/feat-skill-analysis-reports/design-review.md

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

- 検証: design-review.md のレビュー表の全行に判定と根拠がある
- 受入: 他テナントの個人トークンでGET /api/skill/exportを呼んだ場合に403または404になる設計をレビューで確認している(TenantScopedRepositoryがtenant_id無しのクエリを組めない設計方針)
- 受入: 失効済み(revoked_at IS NOT NULL)の個人トークンによる全 /api/skill/* 呼出しが401になる設計をレビューしている
- 受入: POST /api/skill/reports の同一Idempotency-Keyでの二重送信が新規版を作らず既存版を返す設計をレビューしている
- 受入: reports/findings/psych_findings/comment_emotions へのUPDATE文がusecase層のどこにも存在しない設計(追記専用)をレビューしている
- 受入: target_gapが負の原因指標の中で最小値のみを改善候補とし、全指標のtarget_gapが0以上なら候補なしとする非因果的な出力ロジックの設計をレビューしている。因果を示唆する語(原因/引き起こす等)を出力テンプレートから排除する設計になっている
- 受入: 各操作(export/依頼作成/レポート取込/トークン検証失敗)のaudit_log記録の設計に high の是正事項が0件、またはP05の実装範囲へ取り込み済みである
- 受入: Bearer個人トークンでGET/POST /api/analysis-requests(セッション+content.write専用)を呼び出せる経路、およびSARのsrc/がPOST /api/skill/requestsのサーバ側ルート(エンドポイント本体)を実装する経路が設計上どこにも存在しないことをレビューで確認している。.claude/skills/yt-analyze/ がクライアントとしてPOST /api/skill/requestsを呼び出すこと自体は除外対象ではなく、この呼出しが正しくAIAのエンドポイントへ向かう設計になっていることをレビューしている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: design-review.md を直前版へ戻す

## Handoff

- 次の task: SYS-SAR-P04

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
