# 2026-09-24 ログイン画面刷新の引き渡し記録

- branch: `devgraph/feat-login-redesign`（base: `main`）
- dev-graph node: `feat-login-redesign`（package `feature-package/feat-login-redesign`）
- Beads: epic `yta-0sg`、task `yta-0sg.1`〜`yta-0sg.13`
- 仕様反映の受領書: `eval-log/spec-reflection-receipt-20260924.json`
- 証跡: `evidence/feat-login-redesign/index.json`

## 何を入れたか

| 区分 | 場所 | 内容 |
|---|---|---|
| 仕様 | `system-spec/` `specs/` `architecture/` | qa-062〜qa-073（ログイン刷新）を正規フローで正本へ反映 |
| 分解・計画 | `features/feat-login-redesign.*` `tasks/feat-login-redesign/` `.dev-graph/` | macro feature と exact-13 package、Beads への投影 |
| 実装 | `src/` `web/` `public/` `migrations/0003_*` | ログイン画面、権限一覧、同意記録、YouTube 連携状態、再連携、共通セキュリティヘッダ |
| テスト | `tests/login/` `tests/platform/` `e2e/` | 単体・結合 124 件、E2E 69 件（3 画面サイズ） |
| 文書 | `docs/feat-login-redesign/` `docs/setup/` `docs/screens/README.md` `README.md` | 要件・設計・テスト設計・受入・QA・最終レビュー・運用手順 |
| 証跡 | `evidence/feat-login-redesign/` `eval-log/` | テストログ、画面の撮影、監査、再同期 gate の digest 更新 |

## task と Beads の対応

| task | Beads | 内容 | 状態 |
|---|---|---|---|
| SYS-LRD-P01 | yta-0sg.1 | ログイン刷新の要件を実装単位へ確定 | 実施済み |
| SYS-LRD-P02 | yta-0sg.2 | スコープ定義・同意記録・連携状態の構成設計 | 実施済み |
| SYS-LRD-P03 | yta-0sg.3 | OAuth・同意・ヘッダの設計レビュー | 実施済み |
| SYS-LRD-P04 | yta-0sg.4 | 受入テストと E2E の設計 | 実施済み |
| SYS-LRD-P05 | yta-0sg.5 | ログイン画面・API・DB・ヘッダの実装 | 実施済み |
| SYS-LRD-P06 | yta-0sg.6 | テスト実行と不具合修正 | 実施済み |
| SYS-LRD-P07 | yta-0sg.7 | 受入確認 | ローカル済み。preview の実 Google 確認は merge 後 |
| SYS-LRD-P08 | yta-0sg.8 | リファクタリングとマイグレーション整理 | 実施済み |
| SYS-LRD-P09 | yta-0sg.9 | セキュリティと品質の保証 | 実施済み |
| SYS-LRD-P10 | yta-0sg.10 | 最終レビュー | 実施済み |
| SYS-LRD-P11 | yta-0sg.11 | 証跡の集約 | 実施済み |
| SYS-LRD-P12 | yta-0sg.12 | 運用手順とドキュメント | 実施済み |
| SYS-LRD-P13 | yta-0sg.13 | リリースとデプロイ | merge 後に `deploy.yml` が実行 |

task の完了条件は `linked_pr_merged_all`。この PR が main に merge された後、main の clean worktree で dev-graph sync を実行して done にする。

## 検証結果

- `pnpm lint`（71 files）/ `pnpm typecheck` / `pnpm build:web` → OK
- `pnpm test` → 124/124、`pnpm e2e` → 69/69（skip 0）
- `pnpm check:repo` → OK、`pnpm check:release` → OK、`pnpm audit` → 既知の脆弱性なし
- `git diff --check` → 問題なし

## 残っていること

- preview（本番）での実 Google ログインと部分許可の確認（`docs/feat-login-redesign/runbook.md` §4）
- Google Cloud の OAuth 同意画面のアプリ名とスコープの登録（runbook §3）
- graph node の内容同期（C14 の正式な再分解。`eval-log/feat-login-redesign-resync-preview-20260924.md`）
- `deleteConsentRecords` の呼び出し元（アカウント削除機能の実装時）
- ローカルで本物の Google ログインを試すには、`.dev.vars` に本物のクライアントシークレットが必要
