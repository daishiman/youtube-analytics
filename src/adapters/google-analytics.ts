import { daysBetween } from "../domain/dashboard-period";
import type { ChannelDailyRow, VideoDailyRow } from "../repositories/youtube-collector-repository";
import { collectionHttpError, GoogleCollectionError } from "./google-youtube";

export const YOUTUBE_ANALYTICS_REPORTS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";

const REQUIRED_COLUMNS = [
  "day",
  "views",
  "estimatedMinutesWatched",
  "subscribersGained",
  "subscribersLost",
] as const;
const VIDEO_COLUMNS = [
  "day",
  "video",
  "views",
  "estimatedMinutesWatched",
  "averageViewPercentage",
] as const;
const VIDEO_REPORT_PAGE_ROWS = 500;

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** 列順は Google の columnHeaders を正本とし、未返却日は行を作らない。 */
export function parseChannelDailyReport(
  raw: unknown,
  startDate: string,
  endDate: string,
): ChannelDailyRow[] {
  if (!raw || typeof raw !== "object") {
    throw new GoogleCollectionError(true, "Analytics response malformed");
  }
  const report = raw as { columnHeaders?: unknown; rows?: unknown };
  if (!Array.isArray(report.columnHeaders)) {
    throw new GoogleCollectionError(true, "Analytics columnHeaders missing");
  }
  const names = report.columnHeaders.map((column: unknown) =>
    column && typeof column === "object" ? (column as { name?: unknown }).name : null,
  );
  const indexes = REQUIRED_COLUMNS.map((name) => names.indexOf(name));
  if (indexes.some((index) => index < 0)) {
    throw new GoogleCollectionError(false, "Analytics required column missing");
  }
  if (report.rows !== undefined && !Array.isArray(report.rows)) {
    throw new GoogleCollectionError(true, "Analytics rows malformed");
  }
  const seen = new Set<string>();
  const result: ChannelDailyRow[] = [];
  for (const rawRow of (report.rows ?? []) as unknown[]) {
    if (!Array.isArray(rawRow)) {
      throw new GoogleCollectionError(true, "Analytics row malformed");
    }
    const date = rawRow[indexes[0] ?? -1];
    const views = integer(rawRow[indexes[1] ?? -1]);
    const estimatedMinutesWatched = integer(rawRow[indexes[2] ?? -1]);
    const subscribersGained = integer(rawRow[indexes[3] ?? -1]);
    const subscribersLost = integer(rawRow[indexes[4] ?? -1]);
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < startDate ||
      date > endDate ||
      seen.has(date) ||
      views === null ||
      estimatedMinutesWatched === null ||
      subscribersGained === null ||
      subscribersLost === null
    ) {
      throw new GoogleCollectionError(true, "Analytics row invalid");
    }
    seen.add(date);
    result.push({ date, views, estimatedMinutesWatched, subscribersGained, subscribersLost });
  }
  return result;
}

/** Analytics reports.query のチャンネル日次。この1件以外のレポートを収集済みとは扱わない。 */
export async function queryChannelDaily(input: {
  accessToken: string;
  channelId: string;
  startDate: string;
  endDate: string;
}): Promise<ChannelDailyRow[]> {
  const url = new URL(YOUTUBE_ANALYTICS_REPORTS_URL);
  url.search = new URLSearchParams({
    ids: `channel==${input.channelId}`,
    startDate: input.startDate,
    endDate: input.endDate,
    metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
    dimensions: "day",
    sort: "day",
  }).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GoogleCollectionError(true, "Analytics network failure");
  }
  const raw = await response.json().catch(() => null);
  if (!response.ok) throw collectionHttpError(response.status, raw);
  return parseChannelDailyReport(raw, input.startDate, input.endDate);
}

function parseVideoDailyReport(
  raw: unknown,
  allowedVideoIds: Set<string>,
  startDate: string,
  endDate: string,
): VideoDailyRow[] {
  if (!raw || typeof raw !== "object") {
    throw new GoogleCollectionError(true, "Analytics video response malformed");
  }
  const report = raw as { columnHeaders?: unknown; rows?: unknown };
  if (!Array.isArray(report.columnHeaders)) {
    throw new GoogleCollectionError(true, "Analytics video columnHeaders missing");
  }
  const names = report.columnHeaders.map((column: unknown) =>
    column && typeof column === "object" ? (column as { name?: unknown }).name : null,
  );
  const indexes = VIDEO_COLUMNS.map((name) => names.indexOf(name));
  if (indexes.some((index) => index < 0)) {
    throw new GoogleCollectionError(false, "Analytics video required column missing");
  }
  if (report.rows !== undefined && !Array.isArray(report.rows)) {
    throw new GoogleCollectionError(true, "Analytics video rows malformed");
  }
  return ((report.rows ?? []) as unknown[]).map((rawRow) => {
    if (!Array.isArray(rawRow))
      throw new GoogleCollectionError(true, "Analytics video row malformed");
    const date = rawRow[indexes[0] ?? -1];
    const videoId = rawRow[indexes[1] ?? -1];
    const views = integer(rawRow[indexes[2] ?? -1]);
    const estimatedMinutesWatched = integer(rawRow[indexes[3] ?? -1]);
    const percentage = rawRow[indexes[4] ?? -1];
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < startDate ||
      date > endDate ||
      typeof videoId !== "string" ||
      !allowedVideoIds.has(videoId) ||
      views === null ||
      estimatedMinutesWatched === null ||
      (percentage !== null && (typeof percentage !== "number" || !Number.isFinite(percentage)))
    ) {
      throw new GoogleCollectionError(true, "Analytics video row invalid");
    }
    return { date, videoId, views, estimatedMinutesWatched, averageViewPercentage: percentage };
  });
}

/** 最大50本×要求日数。APIの最大行数を明示し、startIndex=1-based で取り切る。 */
export async function queryVideoDaily(input: {
  accessToken: string;
  channelId: string;
  videoIds: string[];
  startDate: string;
  endDate: string;
}): Promise<VideoDailyRow[]> {
  if (input.videoIds.length === 0) return [];
  if (input.videoIds.length > 50) throw new Error("video report chunk exceeds 50 IDs");
  const allowed = new Set(input.videoIds);
  const allRows: VideoDailyRow[] = [];
  const seen = new Set<string>();
  // 本数×日数が最大行数（35日なら50本で1750行）。最終ページが満杯なら次の空ページで終端を確認する。
  const maxRows = input.videoIds.length * daysBetween(input.startDate, input.endDate);
  for (let startIndex = 1; startIndex <= maxRows + 1; startIndex += VIDEO_REPORT_PAGE_ROWS) {
    const url = new URL(YOUTUBE_ANALYTICS_REPORTS_URL);
    url.search = new URLSearchParams({
      ids: `channel==${input.channelId}`,
      startDate: input.startDate,
      endDate: input.endDate,
      metrics: "views,estimatedMinutesWatched,averageViewPercentage",
      dimensions: "day,video",
      filters: `video==${input.videoIds.join(",")}`,
      sort: "day,video",
      maxResults: String(VIDEO_REPORT_PAGE_ROWS),
      startIndex: String(startIndex),
    }).toString();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { authorization: `Bearer ${input.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GoogleCollectionError(true, "Analytics video network failure");
    }
    const raw = await response.json().catch(() => null);
    if (!response.ok) throw collectionHttpError(response.status, raw);
    const rows = parseVideoDailyReport(raw, allowed, input.startDate, input.endDate);
    if (rows.length > VIDEO_REPORT_PAGE_ROWS) {
      throw new GoogleCollectionError(true, "Analytics video page exceeded requested size");
    }
    for (const row of rows) {
      const key = `${row.videoId}:${row.date}`;
      if (seen.has(key)) throw new GoogleCollectionError(true, "Analytics video row duplicated");
      seen.add(key);
      allRows.push(row);
    }
    if (rows.length < VIDEO_REPORT_PAGE_ROWS) return allRows;
  }
  throw new GoogleCollectionError(true, "Analytics video report exceeded expected rows");
}
