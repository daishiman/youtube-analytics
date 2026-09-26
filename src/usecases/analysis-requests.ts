// 集約『分析依頼』の usecase（画面・スキルの両方の入口から使う）。
// 状態は 待機中 → 実行中 → 完了|失敗|取消 の一方向。取消は終端状態（以後のスキルの送信を 409 で
// 拒否するだけで、実行中の Claude Code は止めない）。完了はレポートの追記（analysis-reports）だけが付ける。
// アプリ内で LLM は呼ばない。計算は利用者の Claude Code（/yt-analyze + report-design-system）が行う
import {
  ACTIVE_STATUSES,
  type CreatedVia,
  countChars,
  INSTRUCTION_MAX,
  isActiveStatus,
  isRetryableStatus,
} from "../domain/analysis";
import {
  DEFAULT_PERIOD_DAYS,
  jstToday,
  PERIOD_MESSAGES,
  periodProblem,
  recentPeriod,
} from "../domain/period";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { AppError } from "../lib/errors";
import { controlDb } from "../repositories/db";
import {
  AnalysisRepository,
  type AnalysisRequestRow,
} from "../repositories/skill-analysis-repository";
import { type Deps, iso } from "./common";
import { audit, rateLimit } from "./settings-common";

/** 依頼作成は1ユーザー1分あたり10件まで（画面・スキルの作成と再実行を合算・backend 章） */
export const REQUEST_LIMIT_PER_MINUTE = 10;
export const REQUEST_PAGE_SIZE = 20;

/** API は日付を文字列で受けるので、形式の誤りは書式を示す（画面は日付を選ばせる別の文言） */
const PERIOD_FORMAT_MESSAGE = "対象期間の開始日と終了日を YYYY-MM-DD で指定してください";

export function analysisRepo(deps: Deps, ctx: Pick<TenantContext, "tenantId">) {
  return new AnalysisRepository(controlDb(deps.env), ctx);
}

/** 対象期間の検査: 開始 ≤ 終了・最長1年・未来日不可（JST） */
function validatePeriod(now: Date, start: unknown, end: unknown): [string, string] {
  const problem = periodProblem(start, end, jstToday(now));
  if (problem)
    throw new AppError(
      "VALIDATION_FAILED",
      problem === "format" ? PERIOD_FORMAT_MESSAGE : PERIOD_MESSAGES[problem],
    );
  return [start as string, end as string];
}

/** 開始・終了のどちらも無ければ最新28日（今日を含まない昨日まで・JST）、あれば検査して使う */
export function periodOrDefault(now: Date, start: unknown, end: unknown): [string, string] {
  if (start === undefined && end === undefined)
    return recentPeriod(jstToday(now), DEFAULT_PERIOD_DAYS);
  return validatePeriod(now, start, end);
}

function parseInstruction(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string")
    throw new AppError("VALIDATION_FAILED", "補足指示は文字列で入力してください");
  const s = v.trim();
  if (countChars(s) > INSTRUCTION_MAX)
    throw new AppError("VALIDATION_FAILED", `補足指示は${INSTRUCTION_MAX}文字以内にしてください`);
  return s;
}

function requestView(r: AnalysisRequestRow) {
  return {
    requestId: r.request_id,
    channelId: r.channel_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    instruction: r.instruction,
    status: r.status,
    progress: r.progress,
    stage: r.stage,
    error: r.error,
    reportId: r.report_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    retryOf: r.retry_of,
    canceledAt: r.canceled_at,
    canceledBy: r.canceled_by,
    createdVia: r.created_via,
  };
}

export async function linkedChannel(repo: AnalysisRepository) {
  const channel = await repo.getChannel();
  if (!channel) throw new AppError("CHANNEL_NOT_CONNECTED");
  return channel;
}

async function findRequest(repo: AnalysisRepository, requestId: string) {
  const req = await repo.getRequest(requestId);
  if (!req) throw new AppError("NOT_FOUND");
  return req;
}

/** 依頼がこのテナントのもので、まだ動かせる状態かを確かめる（他テナントの ID は 404） */
export async function activeRequest(repo: AnalysisRepository, requestId: string) {
  const req = await findRequest(repo, requestId);
  if (!isActiveStatus(req.status))
    throw new AppError(req.status === "取消" ? "REQUEST_CANCELED" : "REQUEST_STATE_CONFLICT");
  return req;
}

/** 画面作成・再実行・スキル作成で共有する、1件の依頼作成とレート制限。 */
async function createRequestRow(
  deps: Deps,
  ctx: TenantContext,
  repo: AnalysisRepository,
  input: {
    periodStart: string;
    periodEnd: string;
    instruction: string;
    status: (typeof ACTIVE_STATUSES)[number];
    createdVia: Exclude<CreatedVia, "import">;
    retryOf?: string;
  },
) {
  const channel = await linkedChannel(repo);
  await rateLimit(deps, `analysis-request:${ctx.userId}`, REQUEST_LIMIT_PER_MINUTE, 60 * 1000);
  const requestId = await repo.insertRequest({
    channelId: channel.channel_id,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    instruction: input.instruction,
    createdBy: ctx.userId,
    now: iso(deps.now),
    status: input.status,
    createdVia: input.createdVia,
    retryOf: input.retryOf ?? null,
  });
  const row = await repo.getRequest(requestId);
  if (!row) throw new AppError("INTERNAL");
  return row;
}

// ---- 画面 API（セッション）----

export async function createAnalysisRequest(
  deps: Deps,
  ctx: TenantContext,
  body: Record<string, unknown>,
) {
  requirePermission(ctx, "content.write");
  const [start, end] = validatePeriod(deps.now, body.period_start, body.period_end);
  const instruction = parseInstruction(body.instruction);
  const row = await createRequestRow(deps, ctx, analysisRepo(deps, ctx), {
    periodStart: start,
    periodEnd: end,
    instruction,
    status: "待機中",
    createdVia: "web",
  });
  await audit(deps, ctx, "analysis.request", row.request_id);
  return requestView(row);
}

export async function listAnalysisRequests(deps: Deps, ctx: TenantContext, cursor?: string) {
  requirePermission(ctx, "tenant.read");
  let after: { createdAt: string; requestId: string } | undefined;
  if (cursor) {
    const [createdAt, requestId] = cursor.split("|");
    if (!createdAt || !requestId)
      throw new AppError("VALIDATION_FAILED", "cursor が正しくありません");
    after = { createdAt, requestId };
  }
  const rows = await analysisRepo(deps, ctx).listRequests(REQUEST_PAGE_SIZE + 1, after);
  const page = rows.slice(0, REQUEST_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: page.map(requestView),
    nextCursor:
      rows.length > REQUEST_PAGE_SIZE && last ? `${last.created_at}|${last.request_id}` : null,
  };
}

export async function getAnalysisRequest(deps: Deps, ctx: TenantContext, requestId: string) {
  requirePermission(ctx, "tenant.read");
  return requestView(await findRequest(analysisRepo(deps, ctx), requestId));
}

/** 待機中・実行中 → 取消（取消者と時刻を残す）。完了・失敗・取消からは動かさない */
export async function cancelAnalysisRequest(deps: Deps, ctx: TenantContext, requestId: string) {
  requirePermission(ctx, "content.write");
  const repo = analysisRepo(deps, ctx);
  await findRequest(repo, requestId);
  const changed = await repo.cancelRequest(requestId, ctx.userId, iso(deps.now));
  if (changed === 0) throw new AppError("REQUEST_STATE_CONFLICT");
  await audit(deps, ctx, "analysis.cancel", requestId);
  return requestView(await findRequest(repo, requestId));
}

/** 失敗・取消の依頼と同じ期間・補足指示で新しい依頼を作り、retry_of に元の ID を残す */
export async function retryAnalysisRequest(deps: Deps, ctx: TenantContext, requestId: string) {
  requirePermission(ctx, "content.write");
  const repo = analysisRepo(deps, ctx);
  const src = await findRequest(repo, requestId);
  if (!isRetryableStatus(src.status)) throw new AppError("REQUEST_STATE_CONFLICT");
  const row = await createRequestRow(deps, ctx, repo, {
    periodStart: src.period_start,
    periodEnd: src.period_end,
    instruction: src.instruction,
    status: "待機中",
    createdVia: "web",
    retryOf: src.request_id,
  });
  await audit(deps, ctx, "analysis.retry", `${src.request_id}->${row.request_id}`);
  return requestView(row);
}

/**
 * Claude Code に貼るプロンプト。/yt-analyze と依頼 ID・期間・補足指示・送信先（YTA_BASE_URL）だけを書く
 * （取得・分析・送信の手順は /yt-analyze スキルが持つ）。
 * 個人トークンの平文と他テナントの情報は入れない（トークンは利用者の環境変数から読む）
 */
export async function getAnalysisPrompt(
  deps: Deps,
  ctx: TenantContext,
  requestId: string,
  origin: string,
) {
  requirePermission(ctx, "tenant.read");
  const req = await findRequest(analysisRepo(deps, ctx), requestId);
  const id = req.request_id;
  const lines = [
    `/yt-analyze ${id}`,
    "",
    `対象期間: ${req.period_start} 〜 ${req.period_end}`,
    `補足指示: ${req.instruction || "なし"}`,
    `送信先: ${origin}（取得 /api/skill/export?request_id=${id}・送信 /api/skill/reports）`,
    `環境変数: YTA_BASE_URL=${origin}`,
    "認証: 設定画面で発行した個人トークンを環境変数 YTA_SKILL_TOKEN に設定する",
  ];
  return { requestId: id, prompt: lines.join("\n") };
}

/**
 * 使用するデータの件数と内訳。依存 feature（日次収集・CSV取込）の表がまだ無い項目は null（未取得）
 */
export async function getDataSummary(deps: Deps, ctx: TenantContext, from?: string, to?: string) {
  requirePermission(ctx, "tenant.read");
  const [start, end] = periodOrDefault(deps.now, from, to);
  const repo = analysisRepo(deps, ctx);
  const channel = await repo.getChannel();
  const { counts, csvImports, exportRows } = await repo.dataSummary(
    channel?.channel_id ?? "",
    start,
    end,
  );
  return {
    period: { start, end },
    channel: channel ? { channelId: channel.channel_id, title: channel.title } : null,
    counts,
    csvImports: csvImports && {
      total: csvImports.reduce((a, r) => a + r.n, 0),
      byKind: csvImports,
    },
    exportRows: exportRows && {
      total: exportRows.reduce((a, r) => a + r.n, 0),
      bySource: exportRows,
    },
  };
}

// ---- スキル連携 API（Bearer）----

/** POST /api/skill/requests（/yt-analyze を依頼 ID 無しで起動したときの自動作成。実行中で作る） */
export async function createSkillRequest(
  deps: Deps,
  ctx: TenantContext,
  body: Record<string, unknown>,
) {
  requirePermission(ctx, "content.write");
  const [start, end] = periodOrDefault(deps.now, body.period_start, body.period_end);
  const row = await createRequestRow(deps, ctx, analysisRepo(deps, ctx), {
    periodStart: start,
    periodEnd: end,
    instruction: parseInstruction(body.instruction),
    status: "実行中",
    createdVia: "skill",
  });
  await audit(deps, ctx, "analysis.request", row.request_id);
  return requestView(row);
}

/** PATCH /api/skill/requests/:id（進捗・段階・失敗の報告。完了は POST /api/skill/reports だけが作る） */
export async function patchSkillRequest(
  deps: Deps,
  ctx: TenantContext,
  requestId: string,
  body: Record<string, unknown>,
) {
  requirePermission(ctx, "content.write");
  const repo = analysisRepo(deps, ctx);
  const req = await activeRequest(repo, requestId);
  const { progress, stage, status, error } = body;
  if (
    progress !== undefined &&
    !(Number.isInteger(progress) && (progress as number) >= 0 && (progress as number) <= 100)
  )
    throw new AppError("VALIDATION_FAILED", "progress は0〜100の整数にしてください");
  if (
    stage !== undefined &&
    !(Number.isInteger(stage) && (stage as number) >= 1 && (stage as number) <= 3)
  )
    throw new AppError(
      "VALIDATION_FAILED",
      "stage は 1:データ取得 / 2:分析・HTML生成 / 3:反映 のどれかにしてください",
    );
  if (status !== undefined && status !== "実行中" && status !== "失敗")
    throw new AppError(
      "VALIDATION_FAILED",
      "status は 実行中 か 失敗 にしてください（完了は POST /api/skill/reports で結果を送ると付きます）",
    );
  if (
    error !== undefined &&
    error !== null &&
    (typeof error !== "string" || countChars(error) > 500)
  )
    throw new AppError("VALIDATION_FAILED", "error は500文字以内の文字列にしてください");
  if (status === "失敗" && (typeof error !== "string" || !error.trim()))
    throw new AppError("VALIDATION_FAILED", "失敗にするときは error に原因を1行で書いてください");
  const now = iso(deps.now);
  // 進捗の報告が来たら、待機中の依頼は実行中にする（待機中 → 実行中 → 完了|失敗 の一方向）
  const nextStatus = status ?? "実行中";
  const changed = await repo.updateRequestState(req.request_id, ACTIVE_STATUSES, {
    status: nextStatus as string,
    progress: progress as number | undefined,
    stage: stage as number | undefined,
    error: status === "失敗" ? (error as string).trim() : undefined,
    startedAt: now,
    finishedAt: nextStatus === "失敗" ? now : undefined,
    now,
  });
  if (changed === 0) await activeRequest(repo, requestId); // 同時に終端へ動いていたら 409
  if (nextStatus === "失敗") await audit(deps, ctx, "analysis.fail", req.request_id);
  const row = await repo.getRequest(req.request_id);
  if (!row) throw new AppError("NOT_FOUND");
  return requestView(row);
}
