# SYS-SCL-P13 CI/CD とリリース

## Machine-readable registration fields

- task_id: SYS-SCL-P13
- phase_ref: P13
- feature_package_id: feature-package/feat-settings-channel-link
- parent_feature: feat-settings-channel-link
- owners: daishiman / tags: p13, infrastructure, settings-channel-link / related_nodes: feat-settings-channel-link
- workstream_kind: infrastructure
- build_target_kind: application-code
- depends_on: SYS-SCL-P11, SYS-SCL-P12
- classification: confidence 0.95 / P13 phase slot への 1対1 写像 / tasks/feat-settings-channel-link/SYS-SCL-P13.md
- tracker_binding_intent: beads
- github_publication: local_only / project_aliases なし / labels なし / milestone なし
- pr_completion_policy: linked_pr_merged_all
- branch_policy: one-task-one-branch / worktree lease 必須 / default-branch reconciliation / assignment_owner=dev-graph-scheduler

## 目的

CI に設定画面の E2E を加え、CF_ANALYTICS_TOKEN と機能フラグを wrangler の Secrets/vars に登録し、main への push で 0003 マイグレーションと deploy を完了させる。

## 背景

feat-settings-channel-link は、設定画面(docs/screens/05-settings.png)を画像どおりに実装し、1テナント1チャンネルの YouTube 紐付けと共通レイアウト AppShell を全画面へ提供する feature である。根拠は確定仕様 system-spec の qa-062〜qa-074(ui-ux/frontend/backend/auth/security/database/maintenance-ops 章)にあり、配色は web/styles.css の既存 CSS 変数だけを使う(qa-068)。

## 前提条件

- 先行 task: SYS-SCL-P11, SYS-SCL-P12
- Required spec/architecture nodes: feat-settings-channel-link, arch-youtube-analytics-system
- Entry gate: implementation_readiness=complete(completeness evaluator PASS: eval-log/completeness-findings-20260924-r3.json)
- Source pin: system-spec-harness v0.1.0 / run-system-spec-compile / assign-system-spec-completeness-evaluator
- Repository context: github:daishiman/youtube-analytics / explicit-cli / .dev-graph/config.json

## Workstream applicability

- Frontend: N/A: 本 phase の成果物は Frontend の変更を含まない
- Backend: N/A: 本 phase の成果物は Backend の変更を含まない
- API: N/A: 本 phase の成果物は API の変更を含まない
- Data: N/A: 本 phase の成果物は Data の変更を含まない
- Infrastructure: 主。CI に設定画面の E2E を加え、CF_ANALYTICS_TOKEN と機能フラグを wrangler の Secrets/vars に登録し、main への push で 0003 マイグレーションと deploy を完了させる。
- Security: N/A: 本 phase の成果物は Security の変更を含まない
- Quality: N/A: 本 phase の成果物は Quality の変更を含まない
- Documentation: N/A: 本 phase の成果物は Documentation の変更を含まない
- Operations: 副。CI/CD とリリースのうち Operations に関わる部分

## Architecture and deploy unit

- Architecture decisions: arch-youtube-analytics-system
- Deploy unit/environment: application
- Compatibility/migration/backfill: N/A: 本 phase はスキーマを変更しない

## 成果物

- .github/workflows/ci.yml と deploy.yml の更新
- wrangler.toml の vars 追加
- Consumed artifacts: features/feat-settings-channel-link.context.json, 先行 task の成果物
- Write scope: .github/workflows/, wrangler.toml

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

- 検証: Actions の実行ログで migrations apply と deploy の成功を確認
- 受入: main への push で 0003 マイグレーションと deploy が完了する
- 受入: PR で lint/test/E2E が必須チェックになっている

## Rollout and rollback

- Rollout: 機能ブランチを PR で main へ merge
- Rollback: 直前の Workers バージョンへ wrangler rollback し、マイグレーションは前方修正で戻す

## Handoff

- 次の task: なし(feature 完了。dev-graph が feature を完了へ投影する)

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
