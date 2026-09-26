// 週次売上ファネルの判定（database 章「週次売上ファネル追補」・qa-060 の判定ロジックを維持）。
// 入力は週ごとに集計済みの数値。DB を知らない純粋関数にしてテストで境界値を固定する
export const FUNNEL_METRICS = [
  { id: "impressions", label: "インプレッション数", unit: "回" },
  { id: "ctr", label: "インプレッションのクリック率", unit: "%" },
  { id: "weighted_retention_m1", label: "長尺の平均視聴率（暫定）", unit: "%" },
  { id: "lead_route_rate", label: "導線誘導率", unit: "%" },
  { id: "inquiry_close_rate", label: "問い合わせ→成約率", unit: "%" },
] as const;

export type FunnelMetricId = (typeof FUNNEL_METRICS)[number]["id"];

/** 判定保留の理由コード。API とレポートへそのまま渡す */
export type PendingReason =
  | "missing_input"
  | "zero_denominator"
  | "target_missing"
  | "min_sample_not_met"
  | "stale";

/** 1週分の入力。null は入力欠損（空欄）、0 は実測 0 */
export interface FunnelWeekInput {
  impressions: number | null;
  /** Σ(CTR × インプレッション)。CTR はインプレッション数で重み付けする */
  ctrWeightedSum: number | null;
  /** Σ(平均視聴率 × 視聴回数)（Studio CSV の動画別日次） */
  retentionWeightedSum: number | null;
  /** M1 の分母（Studio CSV の動画別日次の視聴回数合計） */
  retentionViews: number | null;
  engagedViews: number | null;
  /** 週次視聴回数（Studio CSV 合計.csv） */
  views: number | null;
  routeVisits: number | null;
  inquiries: number | null;
  closedDeals: number | null;
}

export interface FunnelTarget {
  targetValue: number | null;
  minSample: number;
}

export interface FunnelMetricResult {
  id: FunnelMetricId;
  label: string;
  unit: string;
  actual: number | null;
  target: number | null;
  /** (actual - target) / target。判定保留なら null */
  target_gap: number | null;
  sampleCount: number | null;
  minSample: number | null;
  status: "ok" | "pending";
  reasons: PendingReason[];
}

export interface FunnelJudgement {
  metrics: FunnelMetricResult[];
  /** 全5指標が判定可能な週だけ、target_gap < 0 のうち最小の指標を返す。因果関係は表さない。 */
  candidate: { metricId: FunnelMetricId; label: string; target_gap: number } | null;
  /** 全指標が判定でき、すべて target_gap >= 0 */
  allTargetsMet: boolean;
}

function ratio(numerator: number | null, denominator: number | null, scale: number) {
  if (numerator === null || denominator === null)
    return { value: null, reason: "missing_input" as const };
  if (denominator === 0) return { value: null, reason: "zero_denominator" as const };
  return { value: (numerator / denominator) * scale, reason: null };
}

function measure(id: FunnelMetricId, w: FunnelWeekInput) {
  switch (id) {
    case "impressions":
      return {
        ...(w.impressions === null
          ? { value: null, reason: "missing_input" as const }
          : { value: w.impressions, reason: null }),
        sample: w.impressions,
      };
    case "ctr":
      return { ...ratio(w.ctrWeightedSum, w.impressions, 1), sample: w.impressions };
    case "weighted_retention_m1":
      return { ...ratio(w.retentionWeightedSum, w.retentionViews, 1), sample: w.engagedViews };
    case "lead_route_rate":
      return { ...ratio(w.routeVisits, w.views, 100), sample: w.views };
    case "inquiry_close_rate":
      return { ...ratio(w.closedDeals, w.inquiries, 100), sample: w.inquiries };
  }
}

export function judgeFunnelWeek(
  week: FunnelWeekInput,
  targets: Partial<Record<FunnelMetricId, FunnelTarget>>,
  stale: boolean,
): FunnelJudgement {
  const metrics = FUNNEL_METRICS.map((m): FunnelMetricResult => {
    const { value, reason, sample } = measure(m.id, week);
    const target = targets[m.id];
    const reasons: PendingReason[] = [];
    if (reason) reasons.push(reason);
    if (!target || target.targetValue === null || target.targetValue <= 0)
      reasons.push("target_missing");
    if (target && (sample === null || sample < target.minSample))
      reasons.push("min_sample_not_met");
    if (stale) reasons.push("stale");
    const targetValue = target?.targetValue ?? null;
    const target_gap =
      reasons.length === 0 && value !== null && targetValue !== null
        ? (value - targetValue) / targetValue
        : null;
    return {
      id: m.id,
      label: m.label,
      unit: m.unit,
      actual: value,
      target: targetValue,
      target_gap,
      sampleCount: sample,
      minSample: target?.minSample ?? null,
      status: target_gap === null ? "pending" : "ok",
      reasons,
    };
  });

  const allJudgeable = metrics.every((m) => m.target_gap !== null);
  let candidate: FunnelJudgement["candidate"] = null;
  if (allJudgeable) {
    for (const m of metrics) {
      if (
        m.target_gap !== null &&
        m.target_gap < 0 &&
        (candidate === null || m.target_gap < candidate.target_gap)
      ) {
        candidate = { metricId: m.id, label: m.label, target_gap: m.target_gap };
      }
    }
  }
  const allTargetsMet =
    allJudgeable && metrics.every((m) => m.target_gap !== null && m.target_gap >= 0);
  return { metrics, candidate, allTargetsMet };
}
