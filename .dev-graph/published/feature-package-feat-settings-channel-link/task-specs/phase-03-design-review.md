# SYS-SCL-P03 OAuth 追加権限・越境防止・トークン管理の設計レビュー

## Machine-readable registration fields

- task_id: SYS-SCL-P03
- phase_ref: P03
- feature_package_id: feature-package/feat-settings-channel-link
- parent_feature: feat-settings-channel-link
- owners: daishiman / tags: p03, security, settings-channel-link / related_nodes: feat-settings-channel-link
- workstream_kind: security
- build_target_kind: application-code
- depends_on: SYS-SCL-P02
- classification: confidence 0.95 / P03 phase slot への 1対1 写像 / tasks/feat-settings-channel-link/SYS-SCL-P03.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

incremental authorization(include_granted_scopes)と revoke、oauth_pending の10分期限と暗号化、別テナント連携済みチャンネルの409、オーナー限定の書込・Origin 検査・レート制限、トークン平文1回表示、force-ssl 機能フラグ(運営者テナントのオーナーのみ)を脅威の観点でレビューする。

## 背景

feat-settings-channel-link は、設定画面(docs/screens/05-settings.png)を画像どおりに実装し、1テナント1チャンネルの YouTube 紐付けと共通レイアウト AppShell を全画面へ提供する feature である。根拠は確定仕様 system-spec の qa-062〜qa-074(ui-ux/frontend/backend/auth/security/database/maintenance-ops 章)にあり、配色は web/styles.css の既存 CSS 変数だけを使う(qa-068)。

## 前提条件

- 先行 task: SYS-SCL-P02
- Required spec/architecture nodes: feat-settings-channel-link, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(completeness evaluator PASS: eval-log/completeness-findings-20260924-r3.json)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: N/A: 本 phase の成果物は Backend の変更を含まない
- API: 副。OAuth 追加権限・越境防止・トークン管理の設計レビューのうち API に関わる部分
- Data: N/A: 本 phase の成果物は Data の変更を含まない
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: 主。incremental authorization(include_granted_scopes)と revoke、oauth_pending の10分期限と暗号化、別テナント連携済みチャンネルの409、オーナー限定の書込・Origin 検査・レート制限、トークン平文1回表示、force-ssl 機能フラグ(運営者テナントのオーナーのみ)を脅威の観点でレビューする。
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: documentation
- Compatibility/migration/backfill: N/A: 本 phase はスキーマを変更しない

## 成果物

- docs/feat-settings-channel-link/design-review.md(脅威×対策×判定表)
- Consumed artifacts: features/feat-settings-channel-link.context.json, 先行 task の成果物
- Write scope: docs/feat-settings-channel-link/design-review.md

## Tracker publication and completion

- Tracker binding intent: beads(prefix yta)
- Publication mode: local_only
- Project aliases / labels / milestone: N/A: GitHub 投影を行わない
- PR completion policy: linked_pr_merged_all(linked PR が default branch へ merge されたとき完了)

## Branch and worktree execution

- 1 task 1 branch。branch 名と worktree lease は dev-graph scheduler が割り当てる

## スコープ外

- 日次収集ジョブ本体と refresh token の暗号化保存・更新(feat-youtube-daily-collection)
- CSV/字幕/画像の解析・正規化・保存処理(feat-csv-media-ingest)
- 個人トークンの検証とスキル連携 API(feat-skill-analysis-reports)
- テナント・メンバー・招待のサーバ処理(feat-platform-tenant-auth)
- データ削除・cleanup の実行処理(feat-retention-ops)
- ダッシュボード/動画/AI分析/改善アクション画面の中身(feat-web-screens-actions)
- 1テナントで複数チャンネルを同時に紐付けること
- 画像の配色の採用と新しい色トークンの追加

## Verification and evidence

- 検証: レビュー表の全行に判定と根拠がある
- 受入: high の是正事項が0件、または P05 の実装範囲へ取り込み済みである

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: design-review.md を直前版へ戻す

## Handoff

- 次の task: SYS-SCL-P04

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
- docs/screens/05-settings.png
- features/feat-settings-channel-link.context.json
