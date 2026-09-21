# 実装要件: feat-platform-tenant-auth (Googleログイン・テナント分離・権限・デプロイ基盤)

- handoff target: `task-graph` (capability-build / task-graph build)
- graph snapshot: `.dev-graph/state/graph.json` revision 2 / `sha256:5904515cc872f8246ded393c4f422cb4701c832e33a02eabb9779b36e78c8497`
- package: `.dev-graph/published/feature-package-feat-platform-tenant-auth` / published digest `sha256:6e46c44289a97833c3c2c07fe53f3de4232895bd5c8f332291a34706873bafd6`
- 本文書は実装コードを含まない。実装は下記 13 task spec を正本として task-graph build が行う。

## 1. 目的と範囲

feature node `feat-platform-tenant-auth` (confirmed / pass / readiness complete) を正本とする。

- 範囲 (in): Google OAuth ログイン、初回ログインでのテナント自動作成、単一 D1 での `tenant_id` 行分離、招待リンクによるメンバー追加とオーナー/編集者/閲覧者の3権限、`MAX_TENANTS` による受付停止、GitHub Actions + wrangler による main push デプロイ。
- 範囲外 (out): 日次収集・CSV/メディア取込・AI分析レポート・画面群・保持期間運用 (各 feature が所有)。

## 2. 受入要件 (feature acceptance → task 写像)

| # | 受入要件 | 検証 task |
|---|---|---|
| A1 | 未ログインで `/api/*` を呼ぶと 401 | P04, P06, P07 |
| A2 | 初回ログインで tenants と owner の tenant_members が1組だけ作られる | P04, P05, P07 |
| A3 | 閲覧者の書込APIは 403、他テナントの資源IDは 404 (越境成功0件) | P04, P06, P07 |
| A4 | 招待リンクを別の Google アカウントで開くと参加できない | P04 |
| A5 | テナント数が `MAX_TENANTS` に達すると新規作成せず受付停止メッセージ | P04, P05 |
| A6 | main への push で D1 マイグレーションと deploy が完了 | P13 |

## 3. 実行 task (exact 13・前向き DAG)

P01 要件 → P02 基盤設計 → P03 セキュリティ設計レビュー → P04 テスト先行 → P05 実装 → P06 テスト実行 → P07 受入 → P08 リファクタ/マイグレーション整理 → P09 セキュリティQA → P10 最終レビュー → {P11 証跡索引, P12 運用手順/README} → P13 CI/CD。

各 task spec: `task-specs/SYS-PTA-P01.md` 〜 `SYS-PTA-P13.md` (published package 内)。

## 4. 出典 (system-spec lineage)

`system-spec/00-requirements-definition.md`, `auth.md`, `security.md`, `database.md`, `infrastructure.md`, `maintenance-ops.md`, `index.md` — 評価済み `spec-state.json` digest `513945ca…4f31` (completeness evaluator r6 PASS)。

## 5. Readiness matrix

| gate | 結果 | 証跡 |
|---|---|---|
| C11 validate-graph-schema | complete / violations 0 | `.dev-graph/state/graph.json` |
| C02 saved state | 8 node 全て confirmed / pass / complete、evidence digest 一致 | graph revision 2 |
| validate-system-plan (published) | pass、validated_digest = published digest | `eval-log/validation-sdp-feat-platform-tenant-auth-r1.json` |
| plan evaluator C1..C4 | PASS (low 1件: architecture_refs の明示引用漏れ) | `eval-log/plan-findings-sdp-feat-platform-tenant-auth-r1.json` |

missing_sections: なし。

## 6. 保留中の仕様改訂 (本 feature 非影響)

`eval-log/pending-spec-change-analysis-history.json` — AI分析で直近5回分の過去分析結果を踏まえる要件。影響先は `feat-skill-analysis-reports` で、本 handoff の範囲外。
