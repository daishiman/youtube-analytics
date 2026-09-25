// レポート詳細の表示モデル。results・history_review は取込時に parseReport で検査した形
// （src/domain/report-schema.ts。正本はスキルの buildReportJson）だけを読み、別名キーは吸収しない。
// 検査を入れる前に保存された版は {} になりうるので、欠けた項目の既定値はこのファイルにだけ置く
import {
  type ActionEffect,
  CAUSE_METRICS,
  type CandidateRef,
  type CauseMetric,
  DOWNSTREAM_DELTA_KEYS,
  DOWNSTREAM_INFO,
  DOWNSTREAM_KEYS,
  type Downstream,
  type DownstreamDelta,
  type DownstreamKey,
  type HistoryChanges,
  type HistoryReview,
  isCauseMetric,
  type PreviousHypothesis,
  type ReportResults,
} from "../../../src/domain/report-schema";
import { formatMetric, gapText, metricLabel, showNumber } from "./format";

const count = (v: number | null | undefined, unit: string) => {
  const text = showNumber(v, 0);
  return text === "—" ? text : `${text}${unit}`;
};

/** 差の符号付き表記（マイナスは ▲。スキルの gapText と同じ記号）。null は「—」 */
const signed = (v: number | null, text: (abs: number) => string) =>
  v === null ? "—" : v < 0 ? `▲${text(-v)}` : `+${text(v)}`;

/** 改善候補（段と指標）を「流入・クリック率」の形に。無ければ「候補なし」 */
export const candidateLabel = (ref: CandidateRef): string =>
  ref ? `${ref.stage}・${metricLabel(ref.metric)}` : "候補なし";

/** 週次ファネルの列（5原因指標） */
export const WEEKLY_METRICS = CAUSE_METRICS.map((metric) => ({
  metric,
  label: metricLabel(metric),
}));

export interface WeeklyRow {
  week: string;
  values: Record<CauseMetric, string>;
}

/** 週次ファネル（results.weekly）。値は単位付きの文字列 */
export function weeklyRows(results: ReportResults): WeeklyRow[] {
  return (results.weekly ?? []).map((w) => {
    const values = Object.fromEntries(CAUSE_METRICS.map((m) => [m, formatMetric(m, w[m])]));
    return { week: w.week, values: values as Record<CauseMetric, string> };
  });
}

export interface DiagnosisRow {
  metric: CauseMetric;
  stage: string;
  label: string;
  actual: string;
  target: string;
  gap: string;
  /** 最大の改善候補の指標 */
  candidate: boolean;
  /** 判定保留の理由（無ければ「—」） */
  pending: string;
}

/** 対象週の原因指標ごとの診断（results.funnel） */
export function diagnosisRows(results: ReportResults): DiagnosisRow[] {
  const candidate = results.candidate ?? null;
  return (results.funnel ?? []).map((m) => ({
    metric: m.metric,
    stage: m.stage,
    label: metricLabel(m.metric),
    actual: formatMetric(m.metric, m.actual),
    target: formatMetric(m.metric, m.target),
    gap: gapText(m.target_gap),
    candidate: candidate?.metric === m.metric,
    pending: m.pending_reason ?? "—",
  }));
}

/** 判定した週と、判定保留の理由（指標名付き。スキルの要約と同じ書き方） */
export function diagnosisNote(results: ReportResults): { week: string | null; pending: string[] } {
  return {
    week: results.target_week ?? null,
    pending: (results.pending_reasons ?? []).map((p) =>
      isCauseMetric(p.metric) ? `${metricLabel(p.metric)}: ${p.reason}` : p.reason,
    ),
  };
}

export interface DownstreamItem {
  key: DownstreamKey;
  label: string;
  value: string;
}

/** 対象週の下流の結果（results.downstream にある項目だけ） */
export function downstreamItems(results: ReportResults): DownstreamItem[] {
  const downstream: Downstream = results.downstream ?? {};
  return DOWNSTREAM_KEYS.filter((k) => k in downstream).map((k) => ({
    key: k,
    label: DOWNSTREAM_INFO[k].label,
    value: count(downstream[k], DOWNSTREAM_INFO[k].unit),
  }));
}

/** 最大の改善候補の1行。候補が無ければ判定（全指標目標達成・判定保留） */
export function candidateText(results: ReportResults, outcome: string): string {
  const candidate = results.candidate ?? null;
  if (!candidate) return outcome || "判定保留";
  return `目標未達が最大: ${candidateLabel(candidate)}（目標比 ${gapText(candidate.target_gap)}）`;
}

export interface ChangesView {
  /** 参照した過去の版が無い（初回分析） */
  first: boolean;
  versions: string;
  /** 前回までの仮説の再判定（前回 → 今回） */
  hypotheses: string[];
  /** 登録済みアクションの効果（基準値 → 今回値と差。施策が原因だとは判定しない） */
  effects: string[];
  /** 直前の版との比較。初回分析は null */
  comparison: { version: number; candidate: string; downstream: string } | null;
}

const verdictText = (h: PreviousHypothesis) =>
  `${h.hypothesis_id}「${h.title}」: ${h.previous_verdict ?? "—"} → ${h.current_verdict ?? "—"}`;

function effectText(a: ActionEffect): string {
  const values = `${formatMetric(a.metric, a.baseline)} → ${formatMetric(a.metric, a.current)}`;
  const diff = signed(a.delta, (v) => formatMetric(a.metric, v));
  const status = a.status ? `・${a.status}` : "";
  return `${a.title}（${metricLabel(a.metric)}）: ${values}（差 ${diff}）${status}`;
}

function candidateChange(c: HistoryChanges): string {
  const now = candidateLabel(c.current_candidate);
  if (c.same_candidate) return `前回と同じ（${now}）`;
  if (!c.previous_candidate && !c.current_candidate) return "前回・今回とも候補なし";
  return `前回から変化（${candidateLabel(c.previous_candidate)} → ${now}）`;
}

function downstreamDelta(c: HistoryChanges): string {
  const delta: Partial<DownstreamDelta> = c.downstream_delta ?? {};
  return DOWNSTREAM_DELTA_KEYS.map((k) => {
    const { label, unit } = DOWNSTREAM_INFO[k];
    return `${label} ${signed(delta[k] ?? null, (v) => count(v, unit))}`;
  }).join("・");
}

/** 要約の先頭「前回からの変化」。versionsUsed は保存時に検査した参照版（history_versions_used） */
export function changesView(review: HistoryReview, versionsUsed: number[]): ChangesView {
  const changes = review.changes ?? null;
  return {
    first: versionsUsed.length === 0,
    versions: versionsUsed.map((v) => `v${v}`).join("・"),
    hypotheses: (review.previous_hypotheses ?? []).map(verdictText),
    effects: (review.action_effects ?? []).map(effectText),
    comparison: changes && {
      version: changes.compared_version,
      candidate: candidateChange(changes),
      downstream: downstreamDelta(changes),
    },
  };
}
