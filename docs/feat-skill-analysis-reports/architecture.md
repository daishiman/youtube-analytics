# feat-skill-analysis-reports 設計（SYS-SAR-P02）

最終更新: 2026-09-25。実装ファイルを読んで書いた。

## 1. 部品

| 部品 | 場所 | 役割 |
|---|---|---|
| 画面 API | `src/http/analysis-requests-routes.ts` | セッション認証。GET/POST `/api/analysis-requests` が SAR、取消・再実行・レポートの閲覧と取込が AIA。どちらも下の usecase を呼ぶ |
| スキル API | `src/http/skill-routes.ts` | `/api/skill/*`。skillAuth の後に6本のルートを置く |
| 認証 | `src/http/middleware.ts` | isSkillApi（`/api/skill/` で判定）を authGate と csrfGuard の対象から外し、skillAuth で Bearer を検証する |
| usecase（依頼） | `src/usecases/analysis-requests.ts` | createAnalysisRequest、listAnalysisRequests、createSkillRequest、patchSkillRequest。AIA の取消・再実行も同じファイル |
| usecase（レポート） | `src/usecases/analysis-reports.ts` | ingestReport、idempotencyKey。AIA の取込・閲覧も同じファイル |
| usecase（スキルの入出力） | `src/usecases/skill-export.ts` | exportForSkill、saveTranscript、saveMedia |
| トークン照合 | `src/usecases/skill-tokens.ts`、`src/repositories/platform-repository.ts` | resolveSkillToken が Bearer を SHA-256 にし、PlatformRepository.authenticateSkillToken で引く |
| 検証 | `src/domain/report-schema.ts` | 結果 JSON の型と parseReport（合わなければ 422）、HISTORY_LIMIT=5、CAUSAL_PATTERNS。形の正本はスキルの compute.mjs（buildReportJson）の実出力で、見本は `tests/fixtures/skill-analysis-report.json` |
| リポジトリ | `src/repositories/skill-analysis-repository.ts` | AnalysisRepository。tenantId を固定した TenantScopedRepository |
| スキル | `.claude/skills/yt-analyze/` | scripts/yt-analyze.mjs と lib/（client・pipeline・compute・funnel・render・causal-language・paths）、templates/ |
| HTML 生成 | `.claude/skills/report-design-system/` | 無改変で使う（vendoring） |

usecase は集約ごとに分け、依存は skill-export → analysis-reports → analysis-requests の一方向にする（skill-export は analysis-requests も直接使う）。

## 2. 層

1. HTTP 層: 本文の上限（`src/domain/analysis.ts` の REPORT_BODY_MAX_BYTES=3,500,000。readSkillJson が画面の結果取込と共通で使う。超えると 413 PAYLOAD_TOO_LARGE）と、JSON 構文エラー（422。行番号を付ける）を扱う。
2. usecase 層: 権限（tenant.read / content.write）、状態遷移、Idempotency、audit_log を扱う。
3. リポジトリ層: SQL は必ず tenant_id で絞る。例外は個人トークンの照合（authenticateSkillToken）で、token_hash でテナントをまたいで引く。UPDATE 文を使うのは analysis_requests の状態、取消、skill_tokens の last_used_at だけ。

## 3. API

| メソッドとパス | 認証 | 成功 | 主な失敗 |
|---|---|---|---|
| GET /api/analysis-requests | セッション | 200（20件ずつ、cursor 付き） | 401 |
| POST /api/analysis-requests | セッション + CSRF | 201（待機中、A-連番） | 403 viewer、429（10件/分） |
| GET /api/skill/export?request_id= | Bearer | 200 | 400 request_id 無し、404 他テナント、409 REQUEST_STATE_CONFLICT / REQUEST_CANCELED |
| POST /api/skill/requests | Bearer | 201 と request_id | 403 content.write 無し。本体は AIA の createSkillRequest |
| PATCH /api/skill/requests/:id | Bearer | 200 | 400 status が不正、409 終端後 |
| POST /api/skill/reports | Bearer + Idempotency-Key | 201 新規 / 200 重複 | 400 キーの不一致、409 REPORT_VERSION_CONFLICT、422 INVALID_REPORT_JSON |
| POST /api/skill/transcripts | Bearer | 201 | 422（source は srt/vtt/whisper/captions_api、最大 TRANSCRIPT_MAX_SEGMENTS=5000 セグメント） |
| POST /api/skill/media | Bearer | 201 | 400 マジックバイトの不一致、413（MEDIA_MAX_BYTES=2MiB 超） |

どの API も `X-Skill-Api-Version: 1` を要求し、エラーは `{error:{code,message,hint}}` の形で返す。

## 4. テーブル

| 番号 | テーブル | 要点 |
|---|---|---|
| 0008 | analysis_requests | PK は (tenant_id, request_id)。progress は 0〜100、stage は 0〜3。instruction は1000字以内 |
| 0009 | reports、findings | UNIQUE (tenant_id, idempotency_key) と UNIQUE (tenant_id, channel_id, version)。outcome は 改善候補あり/全指標目標達成/判定保留。report_html は 2,000,000 bytes 以内。history_versions_used を持つ。findings は kind、fact/interpretation、falsifier、verdict を持つ。追記専用トリガあり |
| 0010 | actions | stage は 露出/流入/維持/導線/成約。metric は impressions/ctr/m1/lead_route_rate/inquiry_close_rate |
| 0011 | psych_findings、comment_emotions | 追記専用トリガあり |
| 0012 | transcripts、media_assets | R2 キーは `tenants/<tid>/media/…` |

0013〜0015（取消状態・created_via、report_archives、actions.source_report_id）は AIA の番号。

## 5. 状態遷移

```
待機中 ──PATCH 実行中──▶ 実行中 ──POST /reports──▶ 完了
   │                      └──PATCH 失敗(error 必須)──▶ 失敗
   └──（AIA）取消
```

遷移は一方向だけ。完了・失敗・取消に着いた後は 409 を返す。POST /api/skill/requests で作る依頼は、最初から「実行中」になる（AIA）。

## 6. スキルの処理の流れ

createRequest（request_id が無いときだけ）→ export → PATCH(20, stage1) → `report.mjs init` → brief.json と analysis.mjs を置く → PATCH(50, 2) → `report.mjs build` → PATCH(90, 3) → POST /reports（キーは export が返した idempotency_key）→ posted-result.json。409 と 401 以外で失敗したときは、依頼を「失敗」にする。

## 7. 引渡し

- AIA へ: POST /api/skill/requests 本体、取消・再実行、report_archives。SAR の recentReports は report_archives を除外しているため、0014 に依存する。
- feat-web-screens-actions へ: reports・findings・actions の読み取り。
