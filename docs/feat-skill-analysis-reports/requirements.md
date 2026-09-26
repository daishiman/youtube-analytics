# feat-skill-analysis-reports 要件（SYS-SAR-P01）

最終更新: 2026-09-25。正本は `features/feat-skill-analysis-reports.md` と `features/feat-skill-analysis-reports.context.json`（goal-spec）。根拠章は system-spec の backend.md・auth.md・database.md・security.md・maintenance-ops.md と `docs/analysis/dashboard-analysis-catalog.md` の §6。

## 1. 目的

運営者の Mac 上の Claude Code から `/yt-analyze` を1回実行するだけで、依頼、書き出し（export）、分析、HTML レポートの build、結果 JSON の反映までを手作業なしで終える。アプリ本体は LLM を呼ばない。分析は Claude Code 側で行い、アプリは次の3つだけを受け持つ。

- 個人トークンでの認証
- テナントで絞ったデータの書き出し
- 版の追記保存

## 2. 決定表

| 論点 | 決定 | 根拠 |
|---|---|---|
| スキル API の認証 | Bearer 個人トークン（`yta_` 接頭辞）。SHA-256 で照合し、失効済み・メンバー外・削除済みテナントは 401。セッション cookie では呼べない | auth.md、security.md |
| 画面 API の認証 | セッション cookie と CSRF。Bearer では呼べない | auth.md |
| API 版 | `X-Skill-Api-Version: 1`。一致しなければ 400 | backend.md |
| 結果 JSON の形 | スキルの compute.mjs（buildReportJson）の実出力を正本とし、`src/domain/report-schema.ts` の型と parseReport で検査する（合わなければ 422。見本は `tests/fixtures/skill-analysis-report.json`）。計画時は catalog §6 の列挙を正本としていたが、2026-09-25 のユーザー決定で変更した | catalog §6、2026-09-25 のユーザー決定 |
| 履歴 | 同じ tenant と channel の完了済み直近5版（HISTORY_LIMIT=5）。0件でも初回分析として続ける | goal-spec |
| 二重送信 | Idempotency-Key = `${request_id}:v${version}`。同じキーは既存版を返す | backend.md |
| 版の保存 | 追記だけ。reports などに BEFORE UPDATE トリガ（RAISE ABORT）を置く | database.md |
| 分析の記述 | 統計的事実と解釈を分け、仮説には反証条件と「採用/棄却/保留」の判定を付ける。因果の断定はしない | catalog、goal-spec |
| HTML の生成 | `.claude/skills/report-design-system` を無改変で使い（vendoring）、`report.mjs build` の合格物を report_html にする | `.claude/report-design-system.ORIGIN.md` |
| 週次実行 | 運営者の Mac 上の launchd | maintenance-ops.md |
| マイグレーション番号 | main の既存 0001〜0007 の後の 0008〜0012 に確定（計画時は 0011〜0015） | `eval-log/renumber-receipt-feat-skill-analysis-reports-20260925.json` |

## 3. 受入対応表（scope_in 11件と受入12件の計23件）

| # | 要件 | 根拠章 | 区画/API | 検証 |
|---|---|---|---|---|
| S1 | 個人トークンの SHA-256 照合と失効拒否（発行画面は feat-settings-channel-link） | auth.md | skillAuth | skill-api.test.ts |
| S2 | analysis_requests（待機中→実行中→完了/失敗）と GET/POST /api/analysis-requests | backend.md | analysis-requests-routes.ts | requests.test.ts |
| S3 | GET /api/skill/export（行ごとの source、M1〜M10 は studio_csv 由来の行だけ） | backend.md | skill-routes.ts | skill-api.test.ts |
| S4 | 直近5版の analysis_history | database.md | export | skill-api.test.ts |
| S5 | 5原因指標と結果指標。target_gap が負で最小の指標を改善候補にし、全指標が0以上なら候補なしとする | catalog §6 | yt-analyze の compute.mjs | 受入2 |
| S6 | PATCH /requests/:id、POST /reports、transcripts・media | backend.md | skill-routes.ts | skill-api / reports.test.ts |
| S7 | 追記だけの版保存と history_versions_used | database.md | 0009・0011 | reports.test.ts |
| S8 | 改善アクションの効果比較 | catalog | export の action_effects | skill-api.test.ts |
| S9 | `/yt-analyze` スキル（init → 記入 → build → POST） | goal-spec | `.claude/skills/yt-analyze/` | 受入1・10 |
| S10 | report-design-system の作法による記述 | ORIGIN.md | analysis.mjs | 受入10・11 |
| S11 | launchd による週次実行 | maintenance-ops.md | `ops/launchd/`（参照パス） | 受入1、runbook |
| A1〜A12 | 受入12項目 | goal-spec | — | acceptance.md 1節 |

## 4. I5 と qa-095 の要素ごとの担当

| 要素 | 担当 | 場所 |
|---|---|---|
| 依頼の自動作成（request_id を渡さずに起動したとき） | SAR（クライアント） | `.claude/skills/yt-analyze/lib/client.mjs` |
| 依頼の作成エンドポイント本体（POST /api/skill/requests） | AIA（SYS-AIA-P05） | `src/usecases/analysis-requests.ts` の createSkillRequest |
| 「実行中」状態・created_via='skill' での作成 | AIA | 同上 |
| request_id 必須の export | SAR | `src/usecases/skill-export.ts` の exportForSkill |
| 週次起動（launchd） | SAR | `ops/launchd/`（参照パス） |

## 5. 前提となる境界

- 週次集計・Studio CSV・事業実績・目標は、feat-youtube-daily-collection と feat-csv-media-ingest が用意する。SAR は境界テーブル `analysis_export_rows` と `analysis_export_targets` を読むだけで、テーブルが無いときは空配列を返す。
- トークンの発行・一覧・削除の画面と API は feat-settings-channel-link の担当。
- 取消・再実行・アーカイブ除外・画面からの JSON 取込は AIA の担当。

## 6. 対象外

- レポート閲覧画面と改善アクション画面（feat-web-screens-actions）
- アプリ内での LLM 呼び出し、因果推論、予測
- report-design-system 本体の改変と、同スキルの範囲外の手法（重回帰・機械学習・生存分析）
