# 実装要件: feat-settings-channel-link (設定画面・YouTubeチャンネル紐付け・共通レイアウト)

- handoff target: `task-graph` (capability-build / task-graph build)
- graph snapshot: `.dev-graph/state/graph.json` revision 6 / `sha256:4e06c06af2e3e38d73b37a92d4b2b90bb8df74f6f553ff72d0ce5cc2de1b3316`
- package: `.dev-graph/published/feature-package-feat-settings-channel-link` / published digest `sha256:b99f16a19d6b011e9af0228340cc1112273911b4f51180dbad5a1f5b16c529b8`
- 本文書は実装コードを含まない。実装は下記 13 task spec を正本として task-graph build が行う。

## 1. 目的と範囲

feature node `feat-settings-channel-link` (confirmed / pass / readiness complete)。依存: feat-platform-tenant-auth, feat-youtube-daily-collection, feat-csv-media-ingest, feat-skill-analysis-reports。

- 目的: オーナーが分析対象の YouTube チャンネルを設定画面で確認・選択・切替でき、全画面が同じヘッダー/フッターと共通部品で一貫して見える。
- 範囲 (in):
  - 共通 AppShell (Sidebar / Header / main / Footer) と共通部品 PageHeader・SectionCard・StatusBadge・DataTable・UsageBar・DropZone・ConfirmDialog・Toast。配色は `web/styles.css` の既存 CSS 変数だけを使う。
  - `docs/screens/05-settings.png` の6区画 (YouTube連携 → データ取込 → Claude Code連携トークン → メンバー → 無料枠の使用状況 → データを削除) を画像どおりに実装する。
  - 画面に見えないバックエンド: `GET /api/settings`、OAuth connect/callback、`channel-candidates` (channels.list mine=true)、`POST /api/youtube/channel` (1テナント1チャンネル、UNIQUE tenant_id/channel_id、409)、reconnect (同一チャンネルのみ)、`DELETE /api/youtube/connection` (revoke + 7日以内削除)、`PUT /api/youtube/captions-auto` (force-ssl の incremental auth、1日5本、機能フラグ)、`/api/imports`、`/api/skill-tokens` (1人5本・名前必須)、`/api/usage` (usage_counters + GraphQL Analytics を1時間キャッシュ、70/90%)、`POST /api/tenant/delete` の呼出し、audit_log、Origin 検査、レート制限。
  - runbook「チャンネルを変更する」と Playwright の3サイズ E2E。
- 範囲外 (out): 日次収集本体・取込解析・トークン検証 API・テナント/招待のサーバ処理・削除実行処理・他画面の中身・複数チャンネル同時紐付け・画像の配色の採用と新しい色トークンの追加。

## 2. 受入要件 (feature acceptance → task 写像)

| # | 受入要件 | 検証 task |
|---|---|---|
| A1 | 6区画が画像どおりの順序・文言・配置、閲覧者にはメンバー区画と書込ボタンが出ない | P04, P06, P07 |
| A2 | channels.list mine=true の候補から1チャンネルを紐付け、別テナント連携済みは 409 | P04, P05, P07 |
| A3 | 再連携は同一チャンネルのみ、変更は解除 → 旧データ7日以内削除 → 再連携の順 | P04, P06, P07, P12 |
| A4 | 字幕トグル ON で force-ssl 付与と1日5本上限、OFF で revoke、検証前は運営者オーナー以外「準備中」 | P03, P04, P06, P09 |
| A5 | トークンは名前必須、6本目は 409、平文は発行直後1回のみ | P04, P06, P09 |
| A6 | 使用量バーは 70% で黄・90% で赤、GraphQL 値は1時間キャッシュ、テナント内訳を出さない | P04, P06, P07 |
| A7 | 取込履歴に最新20件と失敗理由 | P04, P06 |
| A8 | 共通 Header/Footer が全画面で同一、既存 CSS 変数以外の色指定 0件 | P05, P08, P10 |
| A9 | 設定・連携・トークン・削除操作が audit_log に1件ずつ、Origin 不一致の書込を拒否 | P03, P04, P09 |
| A10 | 390×844 / 820×1180 / 1440×900 で主要操作 E2E が通る | P04, P06, P13 |

## 3. 実行 task (exact 13・前向き DAG)

P01 要件 → P02 AppShell/API/channels 設計 → P03 セキュリティ設計レビュー → P04 テスト先行 → P05 実装 → P06 テスト実行 → P07 受入 → P08 共通部品集約/マイグレーション整理 → P09 セキュリティQA → P10 最終レビュー → {P11 証跡索引, P12 runbook「チャンネルを変更する」} → P13 CI/CD。

各 task spec: `task-specs/SYS-SCL-P01.md` 〜 `SYS-SCL-P13.md` (published package 内)。graph 投影: `tasks/feat-settings-channel-link/SYS-SCL-P01.md` 〜 `P13.md`。

## 4. 出典 (system-spec lineage)

`system-spec/00-requirements-definition.md`, `ui-ux.md`, `frontend.md`, `backend.md`, `auth.md`, `security.md`, `database.md`, `maintenance-ops.md`, `index.md` (qa-062〜qa-074 追補)、`specs/youtube-analytics-system.md`、`architecture/youtube-analytics-system.md`、`docs/screens/05-settings.png`。completeness evaluator r3 PASS (`eval-log/completeness-findings-20260924-r3.json`)。

## 5. Readiness matrix

| gate | 結果 | 証跡 |
|---|---|---|
| C11 validate-graph-schema | complete / violations 0 | `.dev-graph/state/graph.json` rev 6 |
| C02 saved state | feature + 依存4 + spec/arch + SCL 13 task が全て confirmed / pass / complete、task evidence digest = published digest | graph revision 6 |
| validate-system-plan (published) | pass、validated_digest = published digest | `eval-log/validation-sdp-feat-settings-channel-link-r1.json` |
| plan evaluator C1..C4 | PASS (low 1件) | `eval-log/plan-findings-sdp-feat-settings-channel-link-r1.json` |

missing_sections: なし。

## 6. 保留 (handoff は止めない)

- plan low: P02/P05 の API 一覧に `POST /api/tenant/delete` の呼出しが明記されていない → P02 着手時に API 一覧へ追記する (所有: P02)。
- spec 由来: O3 の文言 (medium)、plugin テスト1件 fail (low)、ラベル分離 (low)。
- decompose 由来: 既存 3 feature (csv-media-ingest / skill-analysis-reports / web-screens-actions) の node と md の不一致 (medium・持ち越し)。本 feature の範囲外。
