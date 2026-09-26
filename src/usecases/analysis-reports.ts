// 集約『レポート版』の usecase。版は追記のみ（スキルの送信と画面の取込が同じ ingestReport を通る）。
// 一覧・詳細・比較・アーカイブ・アクション登録は画面から使う。
// reports は追記のみなので、アーカイブは report_archives の行の有無で表す
import { countChars } from "../domain/analysis";
import { parseReport, type ReportIssue } from "../domain/report-schema";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { newId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { parseJsonOr } from "../lib/json-text";
import type { AnalysisRepository, ReportRow } from "../repositories/skill-analysis-repository";
import { activeRequest, analysisRepo, linkedChannel, periodOrDefault } from "./analysis-requests";
import { type Deps, iso } from "./common";
import { audit } from "./settings-common";

export const REPORT_PAGE_SIZE = 50;
export const REPORT_QUERY_MAX = 100;

export class InvalidReport extends AppError {
  constructor(
    readonly issues: ReportIssue[],
    line?: number,
  ) {
    const first = issues[0];
    super(
      "INVALID_REPORT_JSON",
      first ? `${first.message}（${first.path || "全体"}）` : undefined,
      { ...(line ? { line } : {}), issues: issues.slice(0, 20) },
      line ? `JSONの形式が正しくありません ${line}行目` : undefined,
    );
  }
}

/** 送信の重複判定キー（Idempotency-Key）。同じ依頼・同じ版の再送は新しい版を作らない */
export function idempotencyKey(requestId: string, version: number): string {
  return `${requestId}:v${version}`;
}

// ---- 追記（スキルの送信・画面の取込）----

/**
 * レポート版を1つ追記する（POST /api/skill/reports・画面の取込も同じ入口）。
 * Idempotency-Key = request_id + 版番号。同じキーの再送は新しい版を作らず既存版を返す
 */
export async function ingestReport(
  deps: Deps,
  ctx: TenantContext,
  body: Record<string, unknown>,
  headerKey: string | undefined,
  opts: { auditAction?: string } = {},
): Promise<{ created: boolean; report: { reportId: string; version: number; requestId: string } }> {
  requirePermission(ctx, "content.write");
  const requestId = body.request_id;
  if (typeof requestId !== "string" || !requestId)
    throw new InvalidReport([{ path: "request_id", message: "request_id がありません" }]);
  const repo = analysisRepo(deps, ctx);
  const version = body.version;
  if (Number.isInteger(version)) {
    const key = idempotencyKey(requestId, version as number);
    if (headerKey !== undefined && headerKey !== key)
      throw new AppError("VALIDATION_FAILED", `Idempotency-Key は ${key} にしてください`);
    const existing = await repo.getReportByIdempotencyKey(key);
    if (existing)
      return {
        created: false,
        report: { reportId: existing.report_id, version: existing.version, requestId },
      };
  }
  const req = await activeRequest(repo, requestId);
  const parsed = parseReport(body);
  if (!parsed.ok) throw new InvalidReport(parsed.issues);
  const r = parsed.value;
  const next = await repo.nextVersion(req.channel_id);
  if (r.version !== next) throw new AppError("REPORT_VERSION_CONFLICT");
  const existingVersions = new Set(
    (await repo.listChannelVersions(req.channel_id)).map((v) => v.version),
  );
  const missing = r.historyVersionsUsed.filter((v) => !existingVersions.has(v));
  if (missing.length)
    throw new InvalidReport([
      {
        path: "history_review.versions_used",
        message: `存在しない版 ${missing.join(", ")} を参照しています`,
      },
    ]);
  const key = idempotencyKey(req.request_id, r.version);
  const reportId = newId();
  try {
    await repo.insertReport({
      reportId,
      channelId: req.channel_id,
      requestId: req.request_id,
      version: r.version,
      title: r.title,
      summary: r.summary,
      conclusion: r.conclusion,
      outcome: r.outcome,
      candidateStage: r.candidate?.stage ?? null,
      candidateMetric: r.candidate?.metric ?? null,
      periodStart: req.period_start,
      periodEnd: req.period_end,
      briefJson: JSON.stringify(r.brief),
      resultsJson: JSON.stringify(r.results),
      historyReviewJson: JSON.stringify(r.historyReview),
      ideasJson: JSON.stringify(r.ideas),
      actionsJson: JSON.stringify(r.actions),
      historyVersionsUsed: JSON.stringify(r.historyVersionsUsed),
      reportHtml: r.reportHtml,
      idempotencyKey: key,
      createdBy: ctx.userId,
      now: iso(deps.now),
      findings: r.findings.map((f) => ({ ...f, evidenceJson: JSON.stringify(f.evidence) })),
      psych: r.psych.map((p) => ({ ...p, evidenceJson: JSON.stringify(p.evidence) })),
      emotions: r.emotions,
    });
  } catch (err) {
    // 同時に同じキーが届いた場合は、先に入った版を返す（UNIQUE で2つ目は失敗する）
    const winner = await repo.getReportByIdempotencyKey(key);
    if (winner)
      return {
        created: false,
        report: { reportId: winner.report_id, version: winner.version, requestId },
      };
    // 読取後に取消された場合、DB の INSERT 条件が保存を拒否する。専用の 409 に直す。
    await activeRequest(repo, requestId);
    if (err instanceof Error && /UNIQUE/i.test(err.message))
      throw new AppError("REPORT_VERSION_CONFLICT");
    throw err;
  }
  await audit(deps, ctx, opts.auditAction ?? "analysis.report", `${req.request_id}:v${r.version}`);
  return { created: true, report: { reportId, version: r.version, requestId: req.request_id } };
}

/**
 * POST /api/reports/import（貼り付けた結果JSONを ingestReport で取り込む）。
 * request_id があればその依頼を完了にし、無ければ完了済みの依頼を1件作る（created_via=import・qa-092）。
 * 形式の誤りは依頼を作る前に 422 で返し、保存しない
 */
export async function importReport(deps: Deps, ctx: TenantContext, body: Record<string, unknown>) {
  requirePermission(ctx, "content.write");
  if (typeof body.request_id === "string" && body.request_id) {
    const res = await ingestReport(deps, ctx, body, undefined, { auditAction: "analysis.import" });
    return { created: res.created, report: { ...res.report, requestCreated: false } };
  }
  const parsed = parseReport(body);
  if (!parsed.ok) throw new InvalidReport(parsed.issues);
  const repo = analysisRepo(deps, ctx);
  const channel = await linkedChannel(repo);
  const next = await repo.nextVersion(channel.channel_id);
  if (parsed.value.version !== next) throw new AppError("REPORT_VERSION_CONFLICT");
  const [start, end] = periodOrDefault(deps.now, body.period_start, body.period_end);
  const requestId = await repo.insertRequest({
    channelId: channel.channel_id,
    periodStart: start,
    periodEnd: end,
    instruction: "",
    createdBy: ctx.userId,
    now: iso(deps.now),
    status: "実行中",
    createdVia: "import",
  });
  try {
    const res = await ingestReport(
      deps,
      ctx,
      { ...body, request_id: requestId },
      idempotencyKey(requestId, parsed.value.version),
      { auditAction: "analysis.import" },
    );
    return { created: res.created, report: { ...res.report, requestCreated: true } };
  } catch (err) {
    await repo.deleteUnfinishedRequest(requestId);
    throw err;
  }
}

// ---- 閲覧・整理（画面）----

function reportSummaryView(r: {
  report_id: string;
  request_id: string;
  version: number;
  title: string;
  summary: string;
  outcome: string;
  period_start: string;
  period_end: string;
  created_at: string;
}) {
  return {
    reportId: r.report_id,
    requestId: r.request_id,
    version: r.version,
    title: r.title,
    summary: r.summary,
    outcome: r.outcome,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    createdAt: r.created_at,
  };
}

/** GET /api/reports?q=&archived=0|1&cursor=（新しい版から最大200版の中で名前・要約を部分一致） */
export async function listReports(
  deps: Deps,
  ctx: TenantContext,
  query: { q?: string; archived?: string; cursor?: string },
) {
  requirePermission(ctx, "tenant.read");
  const q = (query.q ?? "").trim();
  if (countChars(q) > REPORT_QUERY_MAX)
    throw new AppError("VALIDATION_FAILED", `検索語は${REPORT_QUERY_MAX}文字以内にしてください`);
  let beforeVersion: number | undefined;
  if (query.cursor) {
    beforeVersion = Number(query.cursor);
    if (!Number.isInteger(beforeVersion) || beforeVersion < 1)
      throw new AppError("VALIDATION_FAILED", "cursor が正しくありません");
  }
  const rows = await analysisRepo(deps, ctx).listReports({
    q,
    includeArchived: query.archived === "1",
    limit: REPORT_PAGE_SIZE + 1,
    beforeVersion,
  });
  const page = rows.slice(0, REPORT_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({ ...reportSummaryView(r), archived: r.archived === 1 })),
    nextCursor: rows.length > REPORT_PAGE_SIZE && last ? String(last.version) : null,
  };
}

interface ReportAction {
  title: string;
  stage: string;
  metric: string;
  baseline_value: number | null;
  target_value: number | null;
}

/** レポート JSON の actions の位置からキー a1, a2, … を作る */
const actionKey = (i: number) => `a${i + 1}`;

/** 主対象 = 改善候補（candidate）の段・指標に一致する最初のアクション。無ければ先頭 */
function primaryIndex(r: ReportRow, actions: ReportAction[]): number {
  if (!actions.length) return -1;
  const i = actions.findIndex(
    (a) => a.stage === r.candidate_stage && a.metric === r.candidate_metric,
  );
  return i >= 0 ? i : 0;
}

async function findReport(repo: AnalysisRepository, reportId: string) {
  const r = await repo.getReport(reportId);
  if (!r) throw new AppError("NOT_FOUND");
  return r;
}

/** GET /api/reports/:id（?version= で同じチャンネルの別の版） */
export async function getReportDetail(
  deps: Deps,
  ctx: TenantContext,
  reportId: string,
  version?: string,
) {
  requirePermission(ctx, "tenant.read");
  const repo = analysisRepo(deps, ctx);
  let r = await findReport(repo, reportId);
  if (version !== undefined && version !== "") {
    const v = Number(version);
    if (!Number.isInteger(v) || v < 1)
      throw new AppError("VALIDATION_FAILED", "version は1以上の整数にしてください");
    if (v !== r.version) {
      const other = await repo.getReportByVersion(r.channel_id, v);
      if (!other) throw new AppError("NOT_FOUND");
      r = other;
    }
  }
  const [req, archived, versions, findings, psych, emotions, registered] = await Promise.all([
    repo.getRequest(r.request_id),
    repo.isArchived(r.report_id),
    repo.listChannelVersions(r.channel_id),
    repo.findingsDetail(r.report_id),
    repo.psychFor(r.report_id),
    repo.emotionsFor(r.report_id),
    repo.actionsFromReport(r.report_id),
  ]);
  const actions = parseJsonOr<ReportAction[]>(r.actions_json, []);
  const primary = primaryIndex(r, actions);
  const byKey = new Map(registered.map((a) => [a.source_key, a]));
  return {
    ...reportSummaryView(r),
    conclusion: r.conclusion,
    candidate: r.candidate_stage ? { stage: r.candidate_stage, metric: r.candidate_metric } : null,
    isLatest: versions[0]?.version === r.version,
    archived,
    createdVia: req?.created_via ?? null,
    requestStatus: req?.status ?? null,
    brief: parseJsonOr<Record<string, unknown>>(r.brief_json, {}),
    results: parseJsonOr<Record<string, unknown>>(r.results_json, {}),
    historyReview: parseJsonOr<Record<string, unknown>>(r.history_review_json, {}),
    historyVersionsUsed: parseJsonOr<number[]>(r.history_versions_used, []),
    ideas: parseJsonOr<unknown[]>(r.ideas_json, []),
    findings: findings.map((f) => ({
      no: f.finding_no,
      kind: f.kind,
      title: f.title,
      fact: f.fact,
      interpretation: f.interpretation,
      stage: f.stage,
      metric: f.metric,
      hypothesisId: f.hypothesis_id,
      falsifier: f.falsifier,
      verdict: f.verdict,
      evidence: parseJsonOr<unknown>(f.evidence_json, null),
    })),
    psych: psych.map((p) => ({
      no: p.finding_no,
      layer: p.layer,
      claim: p.claim,
      evidence: parseJsonOr<unknown[]>(p.evidence_json, []),
      counterHypothesis: p.counter_hypothesis,
      confidence: p.confidence,
    })),
    emotions: emotions.map((e) => ({
      commentId: e.comment_id,
      emotion: e.emotion,
      intent: e.intent,
    })),
    actions: actions.map((a, i) => {
      const reg = byKey.get(actionKey(i));
      return {
        key: actionKey(i),
        title: a.title,
        stage: a.stage,
        metric: a.metric,
        baselineValue: a.baseline_value,
        targetValue: a.target_value,
        primary: i === primary,
        registered: reg ? { actionId: reg.action_id, status: reg.status } : null,
      };
    }),
    versions: versions.map((v) => ({
      reportId: v.report_id,
      version: v.version,
      createdAt: v.created_at,
      archived: v.archived === 1,
    })),
    reportHtml: r.report_html,
  };
}

/** GET /api/reports/diff?a=&b=（2つの版の要点を並べ、発見・アクションの増減を返す） */
export async function diffReports(deps: Deps, ctx: TenantContext, a?: string, b?: string) {
  requirePermission(ctx, "tenant.read");
  if (!a || !b || a === b)
    throw new AppError("VALIDATION_FAILED", "比較する2つの版（a と b）を選んでください");
  const repo = analysisRepo(deps, ctx);
  const [ra, rb] = await Promise.all([findReport(repo, a), findReport(repo, b)]);
  const [fa, fb] = await Promise.all([
    repo.findingsDetail(ra.report_id),
    repo.findingsDetail(rb.report_id),
  ]);
  const side = (r: ReportRow, f: { kind: string; title: string; verdict: string | null }[]) => ({
    ...reportSummaryView(r),
    conclusion: r.conclusion,
    candidate: r.candidate_stage ? { stage: r.candidate_stage, metric: r.candidate_metric } : null,
    findings: f.map((x) => ({ kind: x.kind, title: x.title, verdict: x.verdict })),
    actions: parseJsonOr<ReportAction[]>(r.actions_json, []).map((x) => x.title),
  });
  const left = side(ra, fa);
  const right = side(rb, fb);
  const setDiff = (x: string[], y: string[]) => x.filter((t) => !y.includes(t));
  const ft = (s: typeof left) => s.findings.map((f) => f.title);
  return {
    a: left,
    b: right,
    changed: {
      title: left.title !== right.title,
      summary: left.summary !== right.summary,
      conclusion: left.conclusion !== right.conclusion,
      outcome: left.outcome !== right.outcome,
      candidate: JSON.stringify(left.candidate) !== JSON.stringify(right.candidate),
    },
    findings: { added: setDiff(ft(right), ft(left)), removed: setDiff(ft(left), ft(right)) },
    actions: {
      added: setDiff(right.actions, left.actions),
      removed: setDiff(left.actions, right.actions),
    },
  };
}

/** PUT/DELETE /api/reports/:id/archive（reports の行は変えず、report_archives を足し引きする） */
export async function setReportArchived(
  deps: Deps,
  ctx: TenantContext,
  reportId: string,
  archived: boolean,
) {
  requirePermission(ctx, "content.write");
  const repo = analysisRepo(deps, ctx);
  await findReport(repo, reportId);
  if (archived) await repo.archiveReport(reportId, ctx.userId, iso(deps.now));
  else await repo.unarchiveReport(reportId);
  await audit(deps, ctx, archived ? "report.archive" : "report.unarchive", reportId);
  return { reportId, archived };
}

/**
 * POST /api/reports/:id/actions {keys:[...]}（選んだアクションだけを改善アクションに登録する）。
 * 同じ版・同じキーは登録済みを返す（二重登録しない・qa-091）
 */
export async function registerReportActions(
  deps: Deps,
  ctx: TenantContext,
  reportId: string,
  body: Record<string, unknown>,
) {
  requirePermission(ctx, "content.write");
  const repo = analysisRepo(deps, ctx);
  const r = await findReport(repo, reportId);
  const actions = parseJsonOr<ReportAction[]>(r.actions_json, []);
  const keys = body.keys;
  if (!Array.isArray(keys) || keys.length === 0)
    throw new AppError("VALIDATION_FAILED", "登録するアクションを1つ以上選んでください");
  const indexes = new Set<number>();
  for (const k of keys) {
    const m = typeof k === "string" ? /^a(\d{1,3})$/.exec(k) : null;
    const i = m ? Number(m[1]) - 1 : -1;
    if (i < 0 || i >= actions.length)
      throw new AppError("VALIDATION_FAILED", `アクション ${String(k)} はこの版にありません`);
    indexes.add(i);
  }
  const before = new Set((await repo.actionsFromReport(reportId)).map((a) => a.source_key));
  const now = iso(deps.now);
  const fresh = [...indexes].filter((i) => !before.has(actionKey(i)));
  await repo.insertActionsFromReport(
    r,
    fresh.map((i) => {
      const a = actions[i] as ReportAction;
      return {
        actionId: newId(),
        key: actionKey(i),
        title: a.title,
        stage: a.stage,
        metric: a.metric,
        baselineValue: a.baseline_value,
        targetValue: a.target_value,
      };
    }),
    ctx.userId,
    now,
  );
  const selected = new Set([...indexes].map(actionKey));
  const rows = (await repo.actionsFromReport(reportId)).filter(
    (a) => a.source_key && selected.has(a.source_key),
  );
  await audit(deps, ctx, "report.actions", `${reportId}:${[...selected].join(",")}`);
  return {
    reportId,
    created: fresh.map(actionKey),
    alreadyRegistered: [...indexes].filter((i) => before.has(actionKey(i))).map(actionKey),
    actions: rows.map((a) => ({
      key: a.source_key,
      actionId: a.action_id,
      title: a.title,
      status: a.status,
    })),
  };
}
