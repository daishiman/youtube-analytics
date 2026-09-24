# SYS-SCL-P05 共通レイアウト・設定画面・チャンネル紐付け API の実装

## Machine-readable registration fields

- task_id: SYS-SCL-P05
- phase_ref: P05
- feature_package_id: feature-package/feat-settings-channel-link
- parent_feature: feat-settings-channel-link
- owners: daishiman / tags: p05, frontend, settings-channel-link / related_nodes: feat-settings-channel-link
- workstream_kind: frontend
- build_target_kind: application-code
- depends_on: SYS-SCL-P04
- classification: confidence 0.95 / P05 phase slot への 1対1 写像 / tasks/feat-settings-channel-link/SYS-SCL-P05.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

web/components/ に AppShell と共通部品8種を実装して全画面(ログイン・静的ページ含む)へ適用し、設定画面6区画を画像どおりに組む。src/ に settings・youtube 紐付け・captions-auto・imports・skill-tokens・usage の usecase とルート、migrations/0003_settings_channel_link.sql、audit_log 記録を実装する。

## 背景

feat-settings-channel-link は、設定画面(docs/screens/05-settings.png)を画像どおりに実装し、1テナント1チャンネルの YouTube 紐付けと共通レイアウト AppShell を全画面へ提供する feature である。根拠は確定仕様 system-spec の qa-062〜qa-074(ui-ux/frontend/backend/auth/security/database/maintenance-ops 章)にあり、配色は web/styles.css の既存 CSS 変数だけを使う(qa-068)。

## 前提条件

- 先行 task: SYS-SCL-P04
- Required spec/architecture nodes: feat-settings-channel-link, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(completeness evaluator PASS: eval-log/completeness-findings-20260924-r3.json)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: 主。web/components/ に AppShell と共通部品8種を実装して全画面(ログイン・静的ページ含む)へ適用し、設定画面6区画を画像どおりに組む。src/ に settings・youtube 紐付け・captions-auto・imports・skill-tokens・usage の usecase とルート、migrations/0003_settings_channel_link.sql、audit_log 記録を実装する。
- Backend: 副。共通レイアウト・設定画面・チャンネル紐付け API の実装のうち Backend に関わる部分
- API: 副。共通レイアウト・設定画面・チャンネル紐付け API の実装のうち API に関わる部分
- Data: 副。共通レイアウト・設定画面・チャンネル紐付け API の実装のうち Data に関わる部分
- Infrastructure: N/A: 本 phase の成果物は Infrastructure の変更を含まない
- Security: 副。共通レイアウト・設定画面・チャンネル紐付け API の実装のうち Security に関わる部分
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: N/A: 本 phase の成果物は Operations の変更を含まない

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: migrations/0003_settings_channel_link.sql は追加のみで既存テーブルを壊さない。既存テナントの channels 行は未連携として扱う

## 成果物

- web/components/(AppShell・PageHeader・SectionCard・StatusBadge・DataTable・UsageBar・DropZone・ConfirmDialog・Toast)
- web/pages/SettingsPage.tsx
- src/ 配下の usecase・ルート・repository
- migrations/0003_settings_channel_link.sql
- Consumed artifacts: features/feat-settings-channel-link.context.json, 先行 task の成果物
- Write scope: web/, src/, migrations/0003_settings_channel_link.sql, public/privacy.html, public/terms.html

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

- 検証: pnpm test
- 検証: npx wrangler d1 migrations apply DB --local
- 受入: P04 のテストがすべて通る
- 受入: ページ固有の色指定が既存 CSS 変数以外0件である

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 機能ブランチの revert とローカル D1 の再作成

## Handoff

- 次の task: SYS-SCL-P06

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
