# 2026-09-22 初期設定の引き渡し記録

- branch: `devgraph/feat-platform-tenant-auth`（base: `main`）
- dev-graph node: `feat-platform-tenant-auth`
- Beads: epic `yta-c8g`、task `yta-c8g.1`〜`yta-c8g.13`（すべて open、実装未着手）
- 仕様反映の受領書: `eval-log/spec-reflection-receipt-20260922.json`

## 何を入れたか

| 区分 | 場所 | 内容 |
|---|---|---|
| 正本 | `system-spec/` | 要件定義と技術章（auth / backend / database / frontend / infrastructure / security / ui-ux / maintenance-ops） |
| 集約・分解 | `specs/` `architecture/` `features/` | 正本の集約仕様、構成図、6 feature |
| 実行計画 | `.dev-graph/` `tasks/feat-platform-tenant-auth/` | 最初の feature の exact-13 公開 package と task 投影 |
| 画面・分析 | `docs/screens/` `docs/analysis/` | 6画面モックと生成 prompt、ダッシュボード分析カタログ |
| AIDD | `aidd-agent-kit/` `.claude/` `.agents/` `.codex/` | 開発支援 Skill・agent の編集原本と runtime 配置 |
| 証跡 | `eval-log/` | 完全性評価 r1〜r6、分解監査、計画評価、再同期 gate |

## task と Beads の対応

| task | Beads | 内容 |
|---|---|---|
| SYS-PTA-P01 | yta-c8g.1 | 要件の実装単位への確定（次に実行） |
| SYS-PTA-P02 | yta-c8g.2 | Workers/D1/R2 構成とテナント分離の設計 |
| SYS-PTA-P03 | yta-c8g.3 | 認証・越境防止の設計レビュー |
| SYS-PTA-P04 | yta-c8g.4 | 受入テストと越境テストの設計 |
| SYS-PTA-P05 | yta-c8g.5 | 基盤・ログイン・テナント・招待の実装 |
| SYS-PTA-P06 | yta-c8g.6 | テスト実行と不具合修正 |
| SYS-PTA-P07 | yta-c8g.7 | 受入確認 |
| SYS-PTA-P08 | yta-c8g.8 | リファクタリングとマイグレーション整理 |
| SYS-PTA-P09 | yta-c8g.9 | セキュリティと品質の保証 |
| SYS-PTA-P10 | yta-c8g.10 | 最終レビュー |
| SYS-PTA-P11 | yta-c8g.11 | 証跡の集約 |
| SYS-PTA-P12 | yta-c8g.12 | 運用手順とドキュメント |
| SYS-PTA-P13 | yta-c8g.13 | CI/CD とリリース |

## 検証結果

- `python3 scripts/validate-repository-consistency.py` → OK
- system-dev-planner `validate-system-plan`（公開 package）→ pass、違反 0
- system-dev-planner `check-implementation-readiness` → complete
- dev-graph `validate-graph-schema`（state graph）→ valid、違反 0

## 仕様への影響

追加の仕様・設計変更はありません。qa-060（週次売上ファネル）と psc-001（分析履歴）は正本へ適用済みです。`specs/` `architecture/` `features/` `tasks/` は digest 固定または生成投影のため手編集せず、この記録と受領書で反映しました。

## 残課題

1. 影響3 feature（`feat-csv-media-ingest` / `feat-skill-analysis-reports` / `feat-web-screens-actions`）の task 計画前に dev-graph compile/decompose で lineage を再同期する（`eval-log/dev-graph-resync-required-20260922.json`）。
2. `docs/screens/02-dashboard.png` は週次売上ファネル追補前の画像。次回生成時に prompt 正本から更新する。
3. 残り5 feature の exact-13 計画は未作成。
4. `.artifact-delivery/` は端末ローカルの外部操作ガード状態（署名鍵を含む）のため追跡しない。
