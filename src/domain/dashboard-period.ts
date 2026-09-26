// ダッシュボードの期間（qa-099）。全画面共通のヘッダーの ?period= をそのまま受ける。
// 日付文字列は YYYY-MM-DD。固定期間の末日は取得済みAnalytics日次（PT）に合わせる。
// 事業CSVの週境界はJSTとして別に扱う。
import { AppError } from "../lib/errors";
import { DAY_MS } from "./time";

export const PERIOD_KEYS = ["7d", "28d", "90d", "1y", "custom"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
export const DEFAULT_PERIOD: PeriodKey = "28d";
export const MAX_CUSTOM_DAYS = 365;

const FIXED_DAYS: Record<Exclude<PeriodKey, "custom">, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
  "1y": 365,
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRange {
  from: string;
  to: string;
  days: number;
}

export interface ResolvedPeriod {
  key: PeriodKey;
  current: DateRange;
  /** 直前の同じ日数 */
  previous: DateRange;
}

/** JST の今日（YYYY-MM-DD） */
export function jstToday(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** from から to までの日数（両端を含む） */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** from〜to の日付の列（両端を含む） */
export function dateList(range: Pick<DateRange, "from" | "to">): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 実在する暦日だけを通す（2026-02-30 のような値は弾く） */
export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

/** JST の暦日 → その日の 00:00 JST を UTC ISO で */
export function jstStartIso(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - JST_OFFSET_MS).toISOString();
}

/** UTC ISO → JST の暦日 */
export function jstDateOf(iso: string): string {
  return jstToday(new Date(iso));
}

function previousOf(current: DateRange): DateRange {
  const to = addDays(current.from, -1);
  return { from: addDays(to, -(current.days - 1)), to, days: current.days };
}

/**
 * ?period=・from・to を検証して今期と前期を決める。
 * 固定期間は取得済みの日があればそこまでの N 日、無ければJSTの昨日まで。
 * 未来日の異常値はJSTの昨日を上限とする。任意期間は指定日をそのまま使う。
 * 許可外の period、custom の from/to 欠落・不正日付・from>to・366日以上は 400
 */
export function resolvePeriod(
  input: { period?: string | null; from?: string | null; to?: string | null },
  now: Date,
  latestAnalyticsDate?: string | null,
): ResolvedPeriod {
  const raw = input.period ?? DEFAULT_PERIOD;
  if (!(PERIOD_KEYS as readonly string[]).includes(raw)) {
    throw new AppError("VALIDATION_FAILED", "期間は 7日・28日・90日・1年・任意 から選んでください");
  }
  const key = raw as PeriodKey;
  let current: DateRange;
  if (key === "custom") {
    const { from, to } = input;
    if (!isDate(from) || !isDate(to)) {
      throw new AppError(
        "VALIDATION_FAILED",
        "任意の期間は開始日と終了日を YYYY-MM-DD で指定してください",
      );
    }
    if (from > to) throw new AppError("VALIDATION_FAILED", "開始日は終了日以前にしてください");
    const days = daysBetween(from, to);
    if (days > MAX_CUSTOM_DAYS) {
      throw new AppError("VALIDATION_FAILED", `任意の期間は最大${MAX_CUSTOM_DAYS}日です`);
    }
    current = { from, to, days };
  } else {
    const days = FIXED_DAYS[key];
    const yesterday = addDays(jstToday(now), -1);
    const to =
      isDate(latestAnalyticsDate) && latestAnalyticsDate < yesterday
        ? latestAnalyticsDate
        : yesterday;
    current = { from: addDays(to, -(days - 1)), to, days };
  }
  return { key, current, previous: previousOf(current) };
}

/** JST 月曜始まりの週。date を含む週の月曜を返す */
export function weekStartOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=日
  return addDays(date, -((dow + 6) % 7));
}

export function isMonday(date: string): boolean {
  return isDate(date) && weekStartOf(date) === date;
}
