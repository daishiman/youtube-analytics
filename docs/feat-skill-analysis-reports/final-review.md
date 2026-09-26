# feat-skill-analysis-reports 最終レビュー（SYS-SAR-P10）

最終更新: 2026-09-25。

## 1. scope_in とファイルの対応

| scope_in | ファイル |
|---|---|
| 個人トークンの照合と失効拒否 | `src/usecases/skill-tokens.ts`（resolveSkillToken）、`src/repositories/platform-repository.ts`（authenticateSkillToken）、`src/http/middleware.ts`（skillAuth） |
| analysis_requests と GET/POST /api/analysis-requests | `migrations/0008_analysis_requests.sql`、`src/http/analysis-requests-routes.ts`、`src/usecases/analysis-requests.ts` |
| GET /api/skill/export | `src/http/skill-routes.ts`、`src/usecases/skill-export.ts`（exportForSkill）、`src/repositories/skill-analysis-repository.ts` |
| 直近5版の analysis_history | 同上（recentReports、HISTORY_LIMIT=5） |
| 5原因指標と結果指標、改善候補 | `.claude/skills/yt-analyze/lib/compute.mjs`、`funnel.mjs` |
| PATCH・POST reports・transcripts・media | `src/http/skill-routes.ts`、`src/usecases/analysis-requests.ts`（patchSkillRequest）、`analysis-reports.ts`（ingestReport）、`skill-export.ts`（saveTranscript・saveMedia）、`migrations/0012_transcripts_media_assets.sql` |
| 追記だけの版保存 | `migrations/0009_reports_findings.sql`、`0011_psych_findings_comment_emotions.sql` |
| 改善アクションの効果比較 | `migrations/0010_actions.sql`、export の action_effects |
| /yt-analyze スキル | `.claude/skills/yt-analyze/`（SKILL.md、scripts、lib、prompts、templates） |
| report-design-system の作法 | `.claude/skills/report-design-system/`（無改変）、`templates/analysis.mjs` |
| launchd の週次実行 | `ops/launchd/`（plist・run-weekly-analysis.sh・README.md。plist のパスはプレースホルダ） |
| 検証 | `tests/skill-analysis/`、`tests/fixtures/skill-analysis-sample/`、`tests/fixtures/skill-analysis-empty/`、`scripts/skill-analysis/` |

## 2. scope_out に当たる変更

| scope_out | 状況 |
|---|---|
| レポート閲覧画面と改善アクション画面 | 変更なし |
| アプリ内の LLM 呼び出し、因果推論、予測 | なし |
| トークン管理画面と /api/skill-tokens | 変更なし |
| AIA の取消・再実行・POST /api/skill/requests・アーカイブ除外 | **1件あり**: `src/http/skill-routes.ts` に POST /api/skill/requests のルート登録がある（usecase は AIA の createSkillRequest で、`src/usecases/analysis-requests.ts` にある）。また recentReports が 0014 report_archives を参照している |
| report-design-system の改変 | なし（取込元に対する `diff -r` の出力は0行） |

POST /api/skill/requests のルート登録と report_archives の参照は、AIA と同じワークツリーで作ったために生じた。SAR と AIA は同時に出荷する前提とし、その扱いをここに記録する（単独で出荷する場合は、ルート登録を AIA 側へ移す）。

2026-09-25 に、usecase を集約単位（依頼・レポート・スキルの入出力）で3分割し、ルートは認証方式で分けた（Bearer は `skill-routes.ts`、セッションは `analysis-requests-routes.ts`）。ファイルの境界は feature ではなく集約と認証方式で決まるので、POST /api/skill/requests が `skill-routes.ts` にあるのは現在の設計どおりである。同時に出荷する前提は変わらない。

## 3. 残事項

1. SAR と AIA は同時に出荷する（2節）。
2. 受入1〜12はローカルで全件合格（acceptance.md）。公開環境での確認、`claude -p` による定時起動、実データ（境界テーブル作成後）での確認が残る。
3. `pnpm audit` は未実施。
4. マイグレーション番号は 0008〜0012 で確定した（AIA は 0013〜0015）。system-spec と task 仕様で旧番号 0011〜0015 を書いている箇所は、読み替えが必要。
