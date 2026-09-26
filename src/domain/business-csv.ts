import { AppError } from "../lib/errors";
import { firstCsvLine, parseCsvTable } from "./csv-table";
import { isMonday } from "./dashboard-period";

const REQUIRED_HEADERS = [
  "week_start",
  "channel_id",
  "route_visits",
  "inquiries",
  "closed_deals",
  "revenue_jpy",
] as const;
const WITH_ROUTE_HEADERS = [
  "week_start",
  "channel_id",
  "route_label",
  "route_visits",
  "inquiries",
  "closed_deals",
  "revenue_jpy",
] as const;

/** 週次なら約19年分。D1の同期一括書込が過大にならない上限。 */
export const BUSINESS_CSV_MAX_ROWS = 1000;

export interface BusinessCsvRow {
  weekStart: string;
  channelId: string;
  routeLabel: string;
  routeVisits: number | null;
  inquiries: number | null;
  closedDeals: number | null;
  revenueJpy: number | null;
}

export interface BusinessCsv {
  rows: BusinessCsvRow[];
  period: string;
}

function invalid(reason: string): never {
  throw new AppError("VALIDATION_FAILED", `事業週次CSV: ${reason}`);
}

function sameHeaders(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((cell, i) => cell === expected[i]);
}

/** スキーマ一致で認識する。専用ファイル名なら列名の誤りも失敗として知らせる。 */
export function isBusinessCsv(csv: string, fileName: string): boolean {
  if (fileName.toLowerCase() === "business-funnel-weekly.csv") return true;
  const firstLine = firstCsvLine(csv);
  return firstLine === REQUIRED_HEADERS.join(",") || firstLine === WITH_ROUTE_HEADERS.join(",");
}

function count(value: string | undefined, column: string, line: number): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    invalid(`${line}行目の${column}は0以上の整数か空欄にしてください`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) invalid(`${line}行目の${column}が大きすぎます`);
  return parsed;
}

export function parseBusinessCsv(csv: string, linkedChannelId: string | null): BusinessCsv {
  const table = parseCsvTable(csv, BUSINESS_CSV_MAX_ROWS);
  const hasRoute = sameHeaders(table.headers, WITH_ROUTE_HEADERS);
  if (!hasRoute && !sameHeaders(table.headers, REQUIRED_HEADERS)) {
    invalid(
      `列名と順序を ${WITH_ROUTE_HEADERS.join(",")} に合わせてください（route_labelのみ省略可）`,
    );
  }
  if (!linkedChannelId) invalid("先にYouTubeチャンネルを連携してください");
  if (table.rows.length === 0) invalid("データ行がありません");

  const seen = new Set<string>();
  const rows = table.rows.map((cells, index): BusinessCsvRow => {
    const line = index + 2;
    const expected = hasRoute ? WITH_ROUTE_HEADERS.length : REQUIRED_HEADERS.length;
    if (cells.length !== expected) invalid(`${line}行目の列数は${expected}列にしてください`);
    const weekStart = (cells[0] ?? "").trim();
    if (!isMonday(weekStart))
      invalid(`${line}行目のweek_startはJST月曜日のYYYY-MM-DDにしてください`);
    if (seen.has(weekStart)) invalid(`${line}行目のweek_startが重複しています: ${weekStart}`);
    seen.add(weekStart);
    const channelId = (cells[1] ?? "").trim();
    if (channelId !== linkedChannelId) {
      invalid(`${line}行目のchannel_idが連携中のYouTubeチャンネルと一致しません`);
    }
    const metricStart = hasRoute ? 3 : 2;
    const routeLabel = hasRoute ? (cells[2] ?? "").trim() || "LINE" : "LINE";
    if (routeLabel.length > 100) invalid(`${line}行目のroute_labelは100文字以内にしてください`);
    return {
      weekStart,
      channelId,
      routeLabel,
      routeVisits: count(cells[metricStart], "route_visits", line),
      inquiries: count(cells[metricStart + 1], "inquiries", line),
      closedDeals: count(cells[metricStart + 2], "closed_deals", line),
      revenueJpy: count(cells[metricStart + 3], "revenue_jpy", line),
    };
  });
  const weeks = rows.map((row) => row.weekStart).sort();
  const first = weeks[0]?.replaceAll("-", "/");
  const last = weeks.at(-1)?.replaceAll("-", "/");
  return { rows, period: first === last ? (first ?? "") : `${first}〜${last}` };
}
