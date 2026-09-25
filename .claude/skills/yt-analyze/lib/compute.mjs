// /yt-analyze の分析本体（決定的な純粋関数だけ）。GET /api/skill/export の応答と brief.json から、
// 週次5段ファネル・目標との差・改善候補・仮説判定・前回版の振り返り・結果 JSON（catalog §6）を作る。
// 時刻・乱数・ネットワークを使わないので、同じ export からは何度実行しても同じ値になる（再現性の検査対象）。
// 文言は目標との差と前後の比較だけを述べ、因果を断定しない（catalog §5.1・report-schema の CAUSAL_PATTERNS）。
import { actionEffect, CAUSE_METRICS, channelMetrics, diagnoseWeek, weeklyFunnel } from "./funnel.mjs";

export const HISTORY_LIMIT = 5;
/** 仮説を「採用/棄却」まで判定するのに要る判定可能週の数。未満は「保留」（n 不足） */
export const MIN_JUDGED_WEEKS = 4;
/** RDS の init に渡す週次ファネル CSV の列（brief.json の hypotheses.列 はこの中から選ぶ） */
export const FUNNEL_CSV_COLUMNS = [
  "week",
  "impressions",
  "ctr",
  "m1",
  "lead_route_rate",
  "inquiry_close_rate",
  "views",
  "inquiries",
  "closed_deals",
  "revenue_jpy",
];

const DAY = 86_400_000;
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const round = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const labelOf = (id) => CAUSE_METRICS.find((m) => m.id === id);

/** 表示用の数値（小数桁固定・桁区切り）。null は「—」 */
export function show(v, digits = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export const digitsOf = (id) => (id === "impressions" ? 0 : 2);
/** 目標比（target_gap×100）の表示。マイナスは ▲ */
export function gapText(gap) {
  if (gap == null) return "判定保留";
  const v = round(gap * 100, 1);
  return v < 0 ? `▲${show(-v, 1)}%` : `+${show(v, 1)}%`;
}

/** 依頼期間の中で、月曜〜日曜が全部入っている週だけを「確定週」とする（鮮度不足の週は判定しない） */
export function isCompleteWeek(week, periodEnd) {
  return addDays(week, 6) <= periodEnd;
}

/** RDS init に渡す週次ファネル CSV（Studio CSV と事業 CSV だけから計算。API 行は混ぜない） */
export function funnelCsv(exp) {
  const weeks = weeklyFunnel(exp.rows ?? []);
  const cell = (v) => (v == null ? "" : String(round(v, 6)));
  const lines = [FUNNEL_CSV_COLUMNS.join(",")];
  for (const w of weeks) lines.push(FUNNEL_CSV_COLUMNS.map((c) => (c === "week" ? w.week : cell(w[c]))).join(","));
  return `${lines.join("\n")}\n`;
}

/** 仮説の判定（反証条件をコードで評価する。LLM は判定しない） */
export function judgeHypotheses(brief, candidateMetric, diagnoses) {
  const judged = candidateMetric
    ? diagnoses.map((d) => d.metrics.find((m) => m.metric === candidateMetric)).filter((m) => m && m.target_gap != null)
    : [];
  const n = judged.length;
  const below = judged.filter((m) => m.target_gap < 0).length;
  const share = n ? below / n : 0;
  const numbers = { 判定週数: n, 未達週数: below, 未達の割合: round(share, 4) };
  const enough = candidateMetric != null && n >= MIN_JUDGED_WEEKS;
  return (brief.hypotheses ?? []).map((h) => {
    // 対立: false = 「半分以上の週で未達（継続）」、対立: true = 「対象週だけの下振れ」。反証条件は互いに排他
    const falsified = h.対立 === true ? share >= 0.5 : share < 0.5;
    const verdict = !enough ? "保留" : falsified ? "棄却" : "採用";
    return { id: h.id, 判定: verdict, 数字: numbers, 理由: enough ? null : candidateMetric ? `判定できた週が${n}週（${MIN_JUDGED_WEEKS}週未満）` : "改善候補がない" };
  });
}

/** 前回版の振り返り（参照版・前回仮説の当否・施策効果・前回からの変化） */
export function reviewHistory(exp, version, funnelWeeks, current) {
  const history = [...(exp.analysis_history ?? [])]
    .filter((h) => Number.isInteger(h.version) && h.version < version)
    .sort((a, b) => b.version - a.version)
    .slice(0, HISTORY_LIMIT);
  const verdictNow = new Map(current.hypotheses.map((h) => [h.id, h.判定]));
  const previous = history.flatMap((h) =>
    (h.hypotheses ?? []).map((p) => ({
      version: h.version,
      hypothesis_id: p.hypothesis_id,
      title: p.title,
      previous_verdict: p.verdict ?? null,
      current_verdict: verdictNow.get(p.hypothesis_id) ?? null,
      review: verdictNow.has(p.hypothesis_id) ? "同じ反証条件で今回の期間を再判定" : "今回の仮説に対応なし",
    })),
  );
  const effects = (exp.action_effects ?? []).map((a) => ({ ...actionEffect(a, funnelWeeks), status: a.status ?? null, report_id: a.report_id ?? null }));
  const last = history[0] ?? null;
  const cur = current.diagnosis;
  const diff = (k) => (last?.downstream?.[k] == null || cur.downstream[k] == null ? null : cur.downstream[k] - last.downstream[k]);
  return {
    first_analysis: history.length === 0,
    versions_used: history.map((h) => h.version),
    previous_hypotheses: previous,
    action_effects: effects,
    changes: last
      ? {
          compared_version: last.version,
          previous_candidate: last.candidate ?? null,
          current_candidate: cur.candidate ? { stage: cur.candidate.stage, metric: cur.candidate.metric } : null,
          same_candidate: Boolean(last.candidate && cur.candidate && last.candidate.metric === cur.candidate.metric),
          downstream_delta: { inquiries: diff("inquiries"), closed_deals: diff("closed_deals"), revenue_jpy: diff("revenue_jpy") },
        }
      : null,
  };
}

/**
 * export と brief から分析結果を作る。戻り値の数値・判定・文言はすべてここで決まり、
 * analysis.mjs（HTML）と結果 JSON の両方がこれを使う
 */
export function analyzeExport(exp, brief) {
  const periodEnd = exp.request?.period_end ?? "9999-12-31";
  const version = exp.next_version;
  const funnel = weeklyFunnel(exp.rows ?? []);
  const complete = funnel.filter((w) => isCompleteWeek(w.week, periodEnd));
  const diagnoses = complete.map((w) => diagnoseWeek(w, exp.targets ?? []));
  // 対象週 = 期間内で最新の確定週。確定週が無ければ最新週を鮮度不足として判定保留にする
  const target = complete.at(-1) ?? funnel.at(-1) ?? null;
  const diagnosis = target
    ? complete.length
      ? diagnoses.at(-1)
      : diagnoseWeek(target, exp.targets ?? [], { fresh: false })
    : { week: null, metrics: [], candidate: null, status: "判定保留", pending_reasons: [{ metric: "*", reason: "対象期間の行がありません" }], downstream: {} };
  const candidateMetric = diagnosis.candidate?.metric ?? null;
  const hypotheses = judgeHypotheses(brief, candidateMetric, diagnoses);
  const current = { diagnosis, hypotheses };
  const history = reviewHistory(exp, version, funnel, current);
  const channel = channelMetrics(exp.rows ?? []);
  return { version, periodEnd, funnel, complete, diagnoses, diagnosis, hypotheses, history, channel };
}

/** 文言（結論・要約・発見）。目標との差と比較だけを書き、原因を言い切らない */
export function narrate(a) {
  const d = a.diagnosis;
  const c = d.candidate ? d.metrics.find((m) => m.metric === d.candidate.metric) : null;
  let summary;
  let conclusion;
  if (c) {
    summary = `${d.week}週の5原因指標のうち、目標との差が最も大きいのは${c.stage}段の${c.label}（実績 ${show(c.actual, digitsOf(c.metric))}${c.unit}・目標 ${show(c.target, digitsOf(c.metric))}${c.unit}・目標比 ${gapText(c.target_gap)}）でした。`;
    conclusion = `次の一手は${c.stage}段（${c.label}）の改善候補を試すことです。売上・成約との関係は施策後の効果測定で確かめます。`;
  } else if (d.status === "全指標目標達成") {
    summary = `${d.week}週の5原因指標はすべて目標以上でした。`;
    conclusion = "全指標が目標を達成しているため、今週は改善候補を置かず、現状の運用を続けて推移を見ます。";
  } else {
    const reasons = d.pending_reasons.map((p) => `${labelOf(p.metric)?.label ?? p.metric}: ${p.reason}`).join("、");
    summary = `${d.week ?? "対象期間"}の判定保留の指標があり、改善候補を決められませんでした（${reasons}）。`;
    conclusion = "判定保留の理由を解消するデータ（目標・件数・最新の取込）をそろえてから改めて判定します。";
  }
  return { summary, conclusion, candidateMetric: c };
}

/** 結果 JSON（catalog §6。POST /api/skill/reports の本文）。report_html だけは build 合格の HTML を後から入れる */
export function buildReportJson(exp, brief, a, reportHtml) {
  const d = a.diagnosis;
  const { summary, conclusion, candidateMetric: c } = narrate(a);
  const judged = d.metrics.filter((m) => m.target_gap != null).sort((x, y) => x.target_gap - y.target_gap);
  const findings = [
    ...judged.slice(0, 3).map((m) => ({
      kind: "factor",
      title: `${m.label}の目標比 ${gapText(m.target_gap)}`,
      fact: `${d.week}週の${m.label}は ${show(m.actual, digitsOf(m.metric))}${m.unit}（目標 ${show(m.target, digitsOf(m.metric))}${m.unit}、目標比 ${gapText(m.target_gap)}）`,
      interpretation:
        m.target_gap < 0
          ? `${m.stage}段は目標を下回っており、改善候補の比較対象になります（相関や因果は判定していません）`
          : `${m.stage}段は目標以上で、今週の改善候補からは外します`,
      stage: m.stage,
      metric: m.metric,
      evidence: { week: d.week, actual: m.actual, target: m.target, target_gap: m.target_gap },
    })),
    ...(brief.hypotheses ?? []).map((h) => {
      const r = a.hypotheses.find((x) => x.id === h.id);
      return {
        kind: "hypothesis",
        hypothesis_id: h.id,
        title: h.主張,
        falsifier: h.反証条件,
        verdict: r?.判定 ?? "保留",
        stage: c?.stage ?? null,
        metric: c?.metric ?? null,
        evidence: { ...(r?.数字 ?? {}), reason: r?.理由 ?? null },
      };
    }),
  ];
  const ideas = c
    ? [{ title: `${c.stage}段（${c.label}）の改善案を1件選んで試す`, stage: c.stage, metric: c.metric, options: ["タイトル案", "台本", "サムネイル", "導線", "問い合わせ対応"] }]
    : [];
  const actions = c
    ? [{ title: `${c.stage}段の${c.label}を目標 ${show(c.target, digitsOf(c.metric))}${c.unit} へ近づける施策を1件試す`, stage: c.stage, metric: c.metric, baseline_value: round(c.actual, 6), target_value: c.target }]
    : [];
  return {
    request_id: exp.request?.request_id,
    version: a.version,
    title: `週次分析 v${a.version}（${exp.request?.period_start}〜${exp.request?.period_end}）`,
    summary,
    conclusion,
    brief: {
      question: brief.plan?.問い,
      reader: brief.plan?.読み手,
      decision: brief.plan?.判断,
      hypotheses: (brief.hypotheses ?? []).map((h) => ({ id: h.id, claim: h.主張, falsifier: h.反証条件, alternative: h.対立 === true })),
    },
    results: {
      status: d.status,
      candidate: d.candidate ? { stage: d.candidate.stage, metric: d.candidate.metric, target_gap: d.candidate.target_gap } : null,
      target_week: d.week,
      funnel: d.metrics,
      pending_reasons: d.pending_reasons,
      downstream: d.downstream,
      weekly: a.funnel,
      channel_metrics: a.channel,
      hypotheses: a.hypotheses,
      sources_used: { cause_metrics: "studio_csv", business: "business_csv", excluded: "api" },
    },
    history_review: a.history,
    findings,
    psych_findings: [],
    comment_emotions: [],
    ideas,
    actions,
    report_html: reportHtml,
  };
}

/** 再現性の比較に使う部分（report_html を除いた全体）。キー順を固定して文字列化する */
export function reproducibleView(report) {
  const { report_html: _html, ...rest } = report;
  return rest;
}
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}
