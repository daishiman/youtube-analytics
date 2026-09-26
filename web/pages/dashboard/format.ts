// ダッシュボードの数値・日付の表示形式。値が無いときは「—」（画面共通のものは web/format.ts）
import type { FunnelMetricResult } from "../../api";
import { fmtNumber } from "../../format";

export function fmtValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "—";
  if (unit === "%") return `${fmtNumber(value, 1)}%`;
  if (unit === "時間") return `${fmtNumber(value, 1)}時間`;
  return `${fmtNumber(value)}${unit}`;
}

/** 改善アクションの指標値。整数はそのまま、小数は1桁 */
export function fmtMetric(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  return unit === "%"
    ? `${value.toFixed(1)}%`
    : `${fmtNumber(value, Number.isInteger(value) ? 0 : 1)}${unit ?? ""}`;
}

/** 週次ファネルの実績・目標。% は2桁 */
export function fmtActual(m: Pick<FunnelMetricResult, "actual" | "unit">): string {
  if (m.actual === null) return "—";
  return m.unit === "%" ? `${m.actual.toFixed(2)}%` : `${fmtNumber(m.actual)}${m.unit}`;
}

/** 比率（0.25 = 25%）を「25.0%」に */
export function fmtShare(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export type Trend = "up" | "down" | "flat" | "none";

/** 前期比の向き。色だけに頼らず記号（▲▼→）と文字でも示す */
export function trendOf(change: number | null): Trend {
  if (change === null || !Number.isFinite(change)) return "none";
  if (Math.abs(change) < 0.0005) return "flat";
  return change > 0 ? "up" : "down";
}

export const TREND_MARK: Record<Trend, string> = { up: "▲", down: "▼", flat: "→", none: "" };
export const TREND_WORD: Record<Trend, string> = {
  up: "増加",
  down: "減少",
  flat: "横ばい",
  none: "比較なし",
};

export function fmtChange(change: number | null): string {
  const t = trendOf(change);
  if (t === "none" || change === null) return "前期比 —";
  const sign = change > 0 ? "+" : "";
  return `${TREND_MARK[t]} ${sign}${(change * 100).toFixed(1)}%`;
}

/** 「2026-09-21」→「9/21」 */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : date;
}

/** 「2026-09-21」→「2026/9/21」 */
export function slashDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-");
  return y && m && d ? `${y}/${Number(m)}/${Number(d)}` : date;
}
