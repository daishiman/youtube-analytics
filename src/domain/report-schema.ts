// AI分析の結果 JSON の形と検証。POST /api/skill/reports と画面の取込（feat-ai-analysis-screen）が同じ検証を使い、
// 画面はここで定めた型だけを読む。形の正本は /yt-analyze の compute.mjs（buildReportJson）が実際に出すもので、
// 見本は tests/fixtures/skill-analysis-report.json。数値と判定はスキル側の計算をそのまま受け、ここでは形と整合だけを見る

export const STAGES = ["露出", "流入", "維持", "導線", "成約"] as const;
export type Stage = (typeof STAGES)[number];
export const CAUSE_METRICS = [
  "impressions",
  "ctr",
  "m1",
  "lead_route_rate",
  "inquiry_close_rate",
] as const;
export type CauseMetric = (typeof CAUSE_METRICS)[number];
/** 原因指標の表示名・単位・ファネル段（スキルの funnel.mjs と同じ。一致はテストで確かめる） */
export const CAUSE_METRIC_INFO: Record<CauseMetric, { label: string; unit: string; stage: Stage }> =
  {
    impressions: { label: "インプレッション", unit: "回", stage: "露出" },
    ctr: { label: "クリック率", unit: "%", stage: "流入" },
    m1: { label: "加重平均視聴率", unit: "%", stage: "維持" },
    lead_route_rate: { label: "導線誘導率", unit: "%", stage: "導線" },
    inquiry_close_rate: { label: "問い合わせ→成約率（同週）", unit: "%", stage: "成約" },
  };
/** 原因指標とファネル段の対応（段と指標が食い違う結果は受けない） */
export const STAGE_OF_METRIC: Record<string, string> = Object.fromEntries(
  CAUSE_METRICS.map((m) => [m, CAUSE_METRIC_INFO[m].stage]),
);
export const isCauseMetric = (v: unknown): v is CauseMetric =>
  (CAUSE_METRICS as readonly unknown[]).includes(v);
export const OUTCOMES = ["改善候補あり", "全指標目標達成", "判定保留"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const PSYCH_LAYERS = ["考え", "感情", "行動"] as const;
export const EMOTIONS = ["喜び", "信頼", "恐れ", "驚き", "悲しみ", "嫌悪", "怒り", "期待"] as const;
export const INTENTS = ["質問", "共感", "反論", "体験談"] as const;
export const VERDICTS = ["採用", "棄却", "保留"] as const;
export type Verdict = (typeof VERDICTS)[number];
/** 週次ファネルの1行が持つ値（原因指標と下流の実数） */
export const WEEKLY_VALUE_KEYS = [
  ...CAUSE_METRICS,
  "views",
  "engaged_views",
  "route_visits",
  "inquiries",
  "closed_deals",
  "revenue_jpy",
  "subscribers",
] as const;
export const DOWNSTREAM_KEYS = ["inquiries", "closed_deals", "revenue_jpy", "subscribers"] as const;
/** 下流の結果の表示名と単位 */
export const DOWNSTREAM_INFO: Record<
  (typeof DOWNSTREAM_KEYS)[number],
  { label: string; unit: string }
> = {
  inquiries: { label: "問い合わせ", unit: "件" },
  closed_deals: { label: "成約", unit: "件" },
  revenue_jpy: { label: "売上", unit: "円" },
  subscribers: { label: "登録者の増加", unit: "人" },
};
/** 前回との差・アクションの効果で比べる下流の項目（スキルの downstream_delta と同じ） */
export const DOWNSTREAM_DELTA_KEYS = ["inquiries", "closed_deals", "revenue_jpy"] as const;
export const REPORT_HTML_MAX_BYTES = 2_000_000;
export const HISTORY_LIMIT = 5;

/**
 * 因果を断定する言い回し（「〜が原因で」「〜したため増えた」など）。結論・要約・発見は
 * 目標との差と相関だけを述べ、因果を言い切らない（requirements U8・catalog §5.1）
 */
export const CAUSAL_PATTERNS: readonly RegExp[] = [
  /が原因(で|だ|です|である)/,
  /のせいで/,
  /によって(増え|減っ|伸び|下が|上が)/,
  /[たえ](ため|から|ので)(に)?、?(増え|減っ|伸び|下が|上が)/,
  /を引き起こし/,
  /因果関係が(ある|あります|確認)/,
];

export function findCausalLanguage(text: string): string | null {
  for (const p of CAUSAL_PATTERNS) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

export interface ReportIssue {
  /** JSON 内の位置（例: "actions[0].stage"）。画面取込ではここから行番号を探す */
  path: string;
  message: string;
}

/** 対象週の原因指標1件の診断。目標との差を出せないときは target_gap を null にし理由を pending_reason に書く */
export interface FunnelMetric {
  metric: CauseMetric;
  label: string;
  stage: Stage;
  unit: string;
  actual: number | null;
  target: number | null;
  target_gap: number | null;
  pending_reason: string | null;
}

export type DownstreamKey = (typeof DOWNSTREAM_KEYS)[number];
/** 下流の結果（問い合わせ・成約・売上・登録者）。対象週が無ければ空 */
export type Downstream = Partial<Record<DownstreamKey, number | null>>;
/** 下流の差（問い合わせ・成約・売上） */
export type DownstreamDelta = Record<(typeof DOWNSTREAM_DELTA_KEYS)[number], number | null>;

/** 週次ファネルの1行 */
export type WeeklyFunnelRow = { week: string } & Record<
  (typeof WEEKLY_VALUE_KEYS)[number],
  number | null
>;

export interface ReportResults {
  status: Outcome;
  candidate: { stage: Stage; metric: CauseMetric; target_gap: number } | null;
  /** 判定した週（期間内で最新の確定週）。行が無ければ null */
  target_week: string | null;
  funnel: FunnelMetric[];
  pending_reasons: { metric: string; reason: string }[];
  downstream: Downstream;
  weekly: WeeklyFunnelRow[];
  /** 以下は HTML レポートの材料。画面は読まない */
  channel_metrics?: Record<string, unknown>;
  hypotheses?: unknown[];
  sources_used?: Record<string, unknown>;
}

/** 前回までの版で立てた仮説を、今回の期間で同じ反証条件のまま判定し直したもの */
export interface PreviousHypothesis {
  version: number;
  hypothesis_id: string;
  title: string;
  previous_verdict: Verdict | null;
  current_verdict: Verdict | null;
  review: string;
}

/** 登録済みアクションの効果比較（差を示すだけで、施策が原因だとは判定しない） */
export interface ActionEffect {
  action_id: string;
  title: string;
  stage: Stage;
  metric: CauseMetric;
  baseline: number | null;
  current: number | null;
  delta: number | null;
  week: string | null;
  downstream: DownstreamDelta | null;
  status: string | null;
  report_id: string | null;
}

/** 改善候補の段と指標。候補が無ければ null */
export type CandidateRef = { stage: Stage; metric: CauseMetric } | null;

/** 直前の版との比較 */
export interface HistoryChanges {
  compared_version: number;
  previous_candidate: CandidateRef;
  current_candidate: CandidateRef;
  same_candidate: boolean;
  downstream_delta: DownstreamDelta;
}

export interface HistoryReview {
  first_analysis: boolean;
  /** 参照した過去の版（新しい順・最大 HISTORY_LIMIT 版） */
  versions_used: number[];
  previous_hypotheses: PreviousHypothesis[];
  action_effects: ActionEffect[];
  /** 初回分析は null */
  changes: HistoryChanges | null;
}

export interface ParsedReport {
  version: number;
  title: string;
  summary: string;
  conclusion: string;
  outcome: Outcome;
  candidate: ReportResults["candidate"];
  brief: Record<string, unknown>;
  results: ReportResults;
  historyReview: HistoryReview;
  historyVersionsUsed: number[];
  findings: {
    kind: "factor" | "hypothesis";
    title: string;
    fact: string | null;
    interpretation: string | null;
    stage: string | null;
    metric: string | null;
    hypothesisId: string | null;
    falsifier: string | null;
    verdict: string | null;
    evidence: unknown;
  }[];
  psych: {
    layer: string;
    claim: string;
    evidence: unknown[];
    counterHypothesis: string | null;
    confidence: number;
  }[];
  emotions: { commentId: string; emotion: string; intent: string | null }[];
  ideas: unknown[];
  actions: {
    title: string;
    stage: string;
    metric: string;
    baseline_value: number | null;
    target_value: number | null;
  }[];
  reportHtml: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

type Bad = (path: string, message: string) => void;
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";
const isWeek = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isVerdictOrNull = (v: unknown) => v === null || VERDICTS.includes(v as Verdict);
const isCandidateRef = (v: unknown) =>
  isObj(v) && isCauseMetric(v.metric) && v.stage === CAUSE_METRIC_INFO[v.metric].stage;

/** 配列の各要素（オブジェクト）を check で見る。要素ごとに最初の誤りだけを返す */
function eachObj(
  value: unknown,
  path: string,
  what: string,
  bad: Bad,
  check: (item: Record<string, unknown>, at: string) => void,
) {
  if (!Array.isArray(value)) return bad(path, `${path}（${what}）は配列にしてください`);
  value.forEach((item, i) => {
    const at = `${path}[${i}]`;
    if (isObj(item)) check(item, at);
    else bad(at, `${at} はオブジェクトにしてください`);
  });
}

/** results の本体（対象週の指標ごとの診断・下流・週次ファネル）。status と candidate は parseReport が見る */
function checkResults(r: Record<string, unknown>, bad: Bad) {
  if (!(r.target_week === null || isWeek(r.target_week)))
    bad("results.target_week", "results.target_week は YYYY-MM-DD か null にしてください");
  eachObj(r.funnel, "results.funnel", "対象週の原因指標ごとの診断", bad, (m, at) => {
    if (!isCauseMetric(m.metric))
      return bad(`${at}.metric`, `${at}.metric が5原因指標ではありません`);
    if (m.stage !== CAUSE_METRIC_INFO[m.metric].stage)
      return bad(`${at}.stage`, `${at}.stage が指標のファネル段と一致しません`);
    if (typeof m.label !== "string" || typeof m.unit !== "string")
      return bad(at, `${at} は label と unit（文字列）が必要です`);
    for (const k of ["actual", "target", "target_gap"] as const)
      if (!isNumOrNull(m[k])) return bad(`${at}.${k}`, `${at}.${k} は数か null にしてください`);
    if (!isStrOrNull(m.pending_reason) || (m.target_gap === null && !m.pending_reason))
      bad(
        `${at}.pending_reason`,
        "目標との差が無い指標には判定保留の理由（pending_reason）が必要です",
      );
  });
  eachObj(r.pending_reasons, "results.pending_reasons", "判定保留の理由", bad, (p, at) => {
    if (typeof p.metric !== "string" || typeof p.reason !== "string" || !p.reason)
      bad(at, `${at} は metric と reason が必要です`);
  });
  if (!isObj(r.downstream))
    bad("results.downstream", "results.downstream はオブジェクトにしてください");
  else
    for (const k of DOWNSTREAM_KEYS)
      if (k in r.downstream && !isNumOrNull(r.downstream[k]))
        bad(`results.downstream.${k}`, `results.downstream.${k} は数か null にしてください`);
  eachObj(r.weekly, "results.weekly", "週次ファネル", bad, (w, at) => {
    if (!isWeek(w.week)) return bad(`${at}.week`, `${at}.week は YYYY-MM-DD にしてください`);
    const k = WEEKLY_VALUE_KEYS.find((key) => !isNumOrNull(w[key]));
    if (k) bad(`${at}.${k}`, `${at}.${k} は数か null にしてください`);
  });
}

/** history_review（参照した版・前回仮説の再判定・アクションの効果・前回からの変化）。参照した版を返す */
function checkHistoryReview(h: Record<string, unknown>, version: number | null, bad: Bad) {
  const versions: number[] = [];
  const used = h.versions_used;
  if (!Array.isArray(used) || used.length > HISTORY_LIMIT)
    bad("history_review.versions_used", `参照した版は${HISTORY_LIMIT}版までの配列にしてください`);
  else
    used.forEach((v, i) => {
      if (!Number.isInteger(v) || v < 1 || (version !== null && v >= version))
        bad(`history_review.versions_used[${i}]`, "参照した版番号が今回の版より前ではありません");
      else versions.push(v);
    });
  if (typeof h.first_analysis !== "boolean")
    bad(
      "history_review.first_analysis",
      "history_review.first_analysis は true か false にしてください",
    );
  else if (Array.isArray(used) && h.first_analysis !== (used.length === 0))
    bad(
      "history_review.first_analysis",
      "first_analysis は参照した版が無いときだけ true にしてください",
    );

  const at0 = "history_review.previous_hypotheses";
  eachObj(h.previous_hypotheses, at0, "前回までの仮説の再判定", bad, (p, at) => {
    if (!versions.includes(p.version as number))
      return bad(`${at}.version`, `${at}.version が参照した版（versions_used）にありません`);
    if (typeof p.hypothesis_id !== "string" || !p.hypothesis_id || typeof p.title !== "string")
      return bad(at, `${at} は hypothesis_id と title が必要です`);
    for (const k of ["previous_verdict", "current_verdict"] as const)
      if (!isVerdictOrNull(p[k]))
        return bad(`${at}.${k}`, `${at}.${k} は 採用・棄却・保留 か null にしてください`);
    if (typeof p.review !== "string") bad(`${at}.review`, `${at}.review がありません`);
  });

  eachObj(h.action_effects, "history_review.action_effects", "アクションの効果", bad, (a, at) => {
    if (typeof a.action_id !== "string" || !a.action_id || typeof a.title !== "string")
      return bad(at, `${at} は action_id と title が必要です`);
    if (!isCandidateRef(a))
      return bad(`${at}.metric`, `${at} の metric と stage が5原因指標と段の組になっていません`);
    for (const k of ["baseline", "current", "delta"] as const)
      if (!isNumOrNull(a[k])) return bad(`${at}.${k}`, `${at}.${k} は数か null にしてください`);
    if (!(a.week === null || isWeek(a.week)))
      return bad(`${at}.week`, `${at}.week は YYYY-MM-DD か null にしてください`);
    if (!(a.downstream === null || isObj(a.downstream)))
      return bad(`${at}.downstream`, `${at}.downstream はオブジェクトか null にしてください`);
    for (const k of ["status", "report_id"] as const)
      if (!isStrOrNull(a[k])) return bad(`${at}.${k}`, `${at}.${k} は文字列か null にしてください`);
  });

  const ch = h.changes;
  const at = "history_review.changes";
  if (ch === null) {
    if (h.first_analysis === false)
      bad(at, "参照した版があるときは changes（前回との比較）が必要です");
  } else if (!isObj(ch)) bad(at, `${at} はオブジェクトか null にしてください`);
  else if (h.first_analysis === true) bad(at, "初回分析では changes を null にしてください");
  else {
    if (!versions.includes(ch.compared_version as number))
      bad(`${at}.compared_version`, "compared_version が参照した版（versions_used）にありません");
    for (const k of ["previous_candidate", "current_candidate"] as const)
      if (!(ch[k] === null || isCandidateRef(ch[k])))
        bad(`${at}.${k}`, `${at}.${k} は { stage, metric } か null にしてください`);
    if (typeof ch.same_candidate !== "boolean")
      bad(`${at}.same_candidate`, `${at}.same_candidate は true か false にしてください`);
    const delta = ch.downstream_delta;
    if (!isObj(delta) || !DOWNSTREAM_DELTA_KEYS.every((k) => isNumOrNull(delta[k])))
      bad(
        `${at}.downstream_delta`,
        `${at}.downstream_delta は問い合わせ・成約・売上の差（数か null）にしてください`,
      );
  }
  return versions;
}

/**
 * 結果 JSON を検証して保存用の形へ直す。誤りは最初の1件だけでなく全件を返す
 * （画面では先頭の1件を「N行目」付きで出す）
 */
export function parseReport(
  input: unknown,
): { ok: true; value: ParsedReport } | { ok: false; issues: ReportIssue[] } {
  const issues: ReportIssue[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });
  if (!isObj(input))
    return { ok: false, issues: [{ path: "", message: "JSONオブジェクトではありません" }] };

  const text = (key: string, max: number, required = true): string => {
    const v = input[key];
    if (v === undefined || v === null || v === "") {
      if (required) bad(key, `${key} がありません`);
      return "";
    }
    if (typeof v !== "string") {
      bad(key, `${key} は文字列にしてください`);
      return "";
    }
    if (Array.from(v).length > max) bad(key, `${key} は${max}文字以内にしてください`);
    return v;
  };

  const version = input.version;
  if (!(Number.isInteger(version) && (version as number) >= 1))
    bad("version", "version は1以上の整数にしてください");
  const title = text("title", 120);
  const summary = text("summary", 2000, false);
  const conclusion = text("conclusion", 1000);

  for (const key of ["brief", "results", "history_review"] as const) {
    if (!isObj(input[key])) bad(key, `${key} はオブジェクトにしてください`);
  }
  const brief = isObj(input.brief) ? input.brief : {};
  const results = isObj(input.results) ? input.results : {};
  const historyReview = isObj(input.history_review) ? input.history_review : {};
  if (isObj(input.brief) && (typeof brief.question !== "string" || brief.question === ""))
    bad("brief.question", "brief.question（問い）がありません");

  // results: 改善候補あり / 全指標目標達成 / 判定保留 のどれか。改善候補ありなら候補の段と指標が要る
  const outcome = results.status;
  if (!OUTCOMES.includes(outcome as (typeof OUTCOMES)[number]))
    bad("results.status", `results.status は ${OUTCOMES.join("・")} のどれかにしてください`);
  let candidate: ParsedReport["candidate"] = null;
  if (outcome === "改善候補あり") {
    const c = results.candidate;
    if (!isObj(c)) bad("results.candidate", "改善候補ありのときは results.candidate が必要です");
    else {
      if (!CAUSE_METRICS.includes(c.metric as (typeof CAUSE_METRICS)[number]))
        bad("results.candidate.metric", "results.candidate.metric が5原因指標ではありません");
      else if (c.stage !== STAGE_OF_METRIC[c.metric as string])
        bad("results.candidate.stage", "results.candidate.stage が指標のファネル段と一致しません");
      if (!isNum(c.target_gap) || c.target_gap >= 0)
        bad("results.candidate.target_gap", "改善候補の target_gap は負の数にしてください");
      if (issues.length === 0)
        candidate = {
          stage: c.stage as Stage,
          metric: c.metric as CauseMetric,
          target_gap: c.target_gap as number,
        };
    }
  } else if (results.candidate !== undefined && results.candidate !== null) {
    bad("results.candidate", "改善候補あり以外では results.candidate を null にしてください");
  }

  if (isObj(input.results)) checkResults(results, bad);
  const historyVersionsUsed = isObj(input.history_review)
    ? checkHistoryReview(historyReview, Number.isInteger(version) ? (version as number) : null, bad)
    : [];

  const arr = (key: string, required: boolean): unknown[] => {
    const v = input[key];
    if (v === undefined && !required) return [];
    if (!Array.isArray(v)) {
      bad(key, `${key} は配列にしてください`);
      return [];
    }
    return v;
  };

  const findings: ParsedReport["findings"] = [];
  for (const [i, f] of arr("findings", false).entries()) {
    const p = `findings[${i}]`;
    if (
      !isObj(f) ||
      (f.kind !== "factor" && f.kind !== "hypothesis") ||
      typeof f.title !== "string" ||
      !f.title
    ) {
      bad(p, `${p} は kind（factor|hypothesis）と title が必要です`);
      continue;
    }
    if (f.stage != null && !STAGES.includes(f.stage as (typeof STAGES)[number])) {
      bad(`${p}.stage`, `${p}.stage がファネル段ではありません`);
      continue;
    }
    if (f.verdict != null && !VERDICTS.includes(f.verdict as (typeof VERDICTS)[number])) {
      bad(`${p}.verdict`, `${p}.verdict は 採用・棄却・保留 のどれかにしてください`);
      continue;
    }
    if (f.kind === "hypothesis" && (typeof f.falsifier !== "string" || !f.falsifier)) {
      bad(`${p}.falsifier`, "仮説には反証条件（falsifier）が必要です");
      continue;
    }
    findings.push({
      kind: f.kind,
      title: f.title,
      fact: optStr(f.fact),
      interpretation: optStr(f.interpretation),
      stage: optStr(f.stage),
      metric: optStr(f.metric),
      hypothesisId: optStr(f.hypothesis_id),
      falsifier: optStr(f.falsifier),
      verdict: optStr(f.verdict),
      evidence: f.evidence ?? {},
    });
  }

  const psych: ParsedReport["psych"] = [];
  for (const [i, p] of arr("psych_findings", true).entries()) {
    const at = `psych_findings[${i}]`;
    if (!isObj(p) || !PSYCH_LAYERS.includes(p.layer as (typeof PSYCH_LAYERS)[number])) {
      bad(`${at}.layer`, `${at}.layer は 考え・感情・行動 のどれかにしてください`);
      continue;
    }
    if (typeof p.claim !== "string" || !p.claim) {
      bad(`${at}.claim`, `${at}.claim がありません`);
      continue;
    }
    if (!Array.isArray(p.evidence) || p.evidence.length === 0) {
      bad(`${at}.evidence`, "推定した心理には根拠（evidence）を1件以上付けてください");
      continue;
    }
    if (!isNum(p.confidence) || p.confidence < 0 || p.confidence > 1) {
      bad(`${at}.confidence`, "確信度（confidence）は0〜1の数にしてください");
      continue;
    }
    psych.push({
      layer: p.layer as string,
      claim: p.claim,
      evidence: p.evidence,
      counterHypothesis: optStr(p.counter_hypothesis),
      confidence: p.confidence,
    });
  }

  const emotions: ParsedReport["emotions"] = [];
  const seenComments = new Set<string>();
  for (const [i, e] of arr("comment_emotions", false).entries()) {
    const at = `comment_emotions[${i}]`;
    if (!isObj(e) || typeof e.comment_id !== "string" || !e.comment_id) {
      bad(`${at}.comment_id`, `${at}.comment_id がありません`);
      continue;
    }
    if (!EMOTIONS.includes(e.emotion as (typeof EMOTIONS)[number])) {
      bad(`${at}.emotion`, `${at}.emotion は Plutchik の8感情のどれかにしてください`);
      continue;
    }
    if (e.intent != null && !INTENTS.includes(e.intent as (typeof INTENTS)[number])) {
      bad(`${at}.intent`, `${at}.intent は 質問・共感・反論・体験談 のどれかにしてください`);
      continue;
    }
    if (seenComments.has(e.comment_id)) {
      bad(`${at}.comment_id`, "同じコメントが2回あります");
      continue;
    }
    seenComments.add(e.comment_id);
    emotions.push({
      commentId: e.comment_id,
      emotion: e.emotion as string,
      intent: optStr(e.intent),
    });
  }

  const ideas = arr("ideas", true);

  const actions: ParsedReport["actions"] = [];
  for (const [i, a] of arr("actions", true).entries()) {
    const at = `actions[${i}]`;
    if (!isObj(a) || typeof a.title !== "string" || !a.title) {
      bad(`${at}.title`, `${at}.title がありません`);
      continue;
    }
    if (!CAUSE_METRICS.includes(a.metric as (typeof CAUSE_METRICS)[number])) {
      bad(`${at}.metric`, `${at}.metric が5原因指標ではありません`);
      continue;
    }
    if (a.stage !== STAGE_OF_METRIC[a.metric as string]) {
      bad(`${at}.stage`, `${at}.stage（対象ファネル段）が指標と一致しません`);
      continue;
    }
    for (const k of ["baseline_value", "target_value"] as const)
      if (a[k] != null && !isNum(a[k])) {
        bad(`${at}.${k}`, `${at}.${k} は数にしてください`);
      }
    actions.push({
      title: a.title,
      stage: a.stage as string,
      metric: a.metric as string,
      baseline_value: isNum(a.baseline_value) ? a.baseline_value : null,
      target_value: isNum(a.target_value) ? a.target_value : null,
    });
  }

  const html = input.report_html;
  if (typeof html !== "string" || html.trim() === "")
    bad("report_html", "report_html（build 合格の単一HTML）がありません");
  else if (utf8Bytes(html) > REPORT_HTML_MAX_BYTES)
    bad(
      "report_html",
      `report_html は ${REPORT_HTML_MAX_BYTES.toLocaleString()} バイト以下にしてください`,
    );

  for (const [key, value] of [
    ["conclusion", conclusion],
    ["summary", summary],
  ] as const) {
    const hit = findCausalLanguage(value);
    if (hit)
      bad(key, `因果を断定する表現「${hit}」は使えません（目標との差と相関だけを書いてください）`);
  }

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      version: version as number,
      title,
      summary,
      conclusion,
      outcome: outcome as ParsedReport["outcome"],
      candidate,
      brief,
      results: results as unknown as ReportResults,
      historyReview: historyReview as unknown as HistoryReview,
      historyVersionsUsed,
      findings,
      psych,
      emotions,
      ideas,
      actions,
      reportHtml: html as string,
    },
  };
}
