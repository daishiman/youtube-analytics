// 分析対象期間の決め方（サーバの依頼作成と、画面のヘッダー・AI分析で共有）。
// JST の昨日までを終わりにし、開始 ≤ 終了・最長1年（366日）・未来日不可

export const PERIOD_MAX_DAYS = 366;
/** 期間を指定しないときの長さ（最新28日） */
export const DEFAULT_PERIOD_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD で、実在する日付か */
export function isDate(v: unknown): v is string {
  return typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/** JST の今日（YYYY-MM-DD） */
export function jstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 今日を含まない直近 days 日（終わりは昨日） */
export function recentPeriod(today: string, days: number): [string, string] {
  return [addDays(today, -days), addDays(today, -1)];
}

export type PeriodProblem = "format" | "order" | "future" | "too_long";

/** 利用者に見せる理由。format だけは画面（日付を選ぶ）と API（文字列で送る）で言い方を変える */
export const PERIOD_MESSAGES: Record<Exclude<PeriodProblem, "format">, string> = {
  order: "開始日は終了日より前にしてください",
  future: "未来の日付は指定できません",
  too_long: "対象期間は最長1年までです",
};

/** 期間の検査。問題が無ければ null */
export function periodProblem(start: unknown, end: unknown, today: string): PeriodProblem | null {
  if (!isDate(start) || !isDate(end)) return "format";
  if (start > end) return "order";
  if (end > today) return "future";
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS + 1;
  return days > PERIOD_MAX_DAYS ? "too_long" : null;
}
