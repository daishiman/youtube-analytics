// 分析対象期間（ヘッダーと各画面で共有する ?period=7d|28d|90d|1y|custom&from=&to=）。
// 範囲の決め方と検査はサーバと同じ src/domain/period.ts を使い、ここは URL との読み書きと表示だけを持つ
import { useCallback } from "react";
import { useSearchParams } from "react-router";
import {
  DEFAULT_PERIOD_DAYS,
  jstToday,
  PERIOD_MESSAGES,
  periodProblem,
  recentPeriod,
} from "../src/domain/period";

export type PeriodKey = "7d" | "28d" | "90d" | "1y" | "custom";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7日" },
  { key: "28d", label: "28日" },
  { key: "90d", label: "90日" },
  { key: "1y", label: "1年" },
  { key: "custom", label: "任意" },
];

const PRESET_DAYS: Record<Exclude<PeriodKey, "custom">, number> = {
  "7d": 7,
  "28d": DEFAULT_PERIOD_DAYS,
  "90d": 90,
  "1y": 365,
};

/** 任意期間の検査。問題が無ければ null、あれば画面に出す1行 */
export function periodError(from: string, to: string, today: string = jstToday()): string | null {
  const problem = periodProblem(from, to, today);
  if (problem === null) return null;
  return problem === "format" ? "開始日と終了日を選んでください" : PERIOD_MESSAGES[problem];
}

export interface Period {
  key: PeriodKey;
  start: string;
  end: string;
  /** ?period=custom の from/to が不正なとき（範囲は最新28日に戻す） */
  error: string | null;
}

export function resolvePeriod(params: URLSearchParams, today: string = jstToday()): Period {
  const raw = params.get("period");
  const key: PeriodKey = PERIODS.some((p) => p.key === raw) ? (raw as PeriodKey) : "28d";
  if (key !== "custom") {
    const [start, end] = recentPeriod(today, PRESET_DAYS[key]);
    return { key, start, end, error: null };
  }
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const error = periodError(from, to, today);
  if (!error) return { key, start: from, end: to, error: null };
  const [start, end] = recentPeriod(today, DEFAULT_PERIOD_DAYS);
  return { key, start, end, error };
}

/** YYYY-MM-DD を「2026年8月13日」に */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return y && m && d ? `${y}年${m}月${d}日` : date;
}

/** URL のクエリを差分で書き換える（null のキーは消す）。ほかのクエリは残し、履歴は積まない */
export function useQueryPatch() {
  const [params, setParams] = useSearchParams();
  const patch = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [params, patch] as const;
}

/** URL の期間を読み書きする。ほかのクエリ（?request= など）は残す */
export function usePeriod() {
  const [params, patch] = useQueryPatch();
  const period = resolvePeriod(params);

  const setPeriod = useCallback(
    (key: PeriodKey, range?: { from: string; to: string }) => {
      const custom = key === "custom" ? range : undefined;
      patch({ period: key, from: custom?.from ?? null, to: custom?.to ?? null });
    },
    [patch],
  );

  return { period, setPeriod };
}
