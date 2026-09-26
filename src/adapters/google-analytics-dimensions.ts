import { collectionHttpError, GoogleCollectionError } from "./google-youtube";

export const ANALYTICS_DIMENSIONS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";
export const ANALYTICS_DIMENSION_KEYS = [
  "traffic_daily",
  "device_daily",
  "country_period",
] as const;
export type AnalyticsDimensionKey = (typeof ANALYTICS_DIMENSION_KEYS)[number];

type ReportSpec = { dimensions: readonly string[]; metrics: readonly string[] };
export const ANALYTICS_DIMENSION_SPECS: Record<AnalyticsDimensionKey, ReportSpec> = {
  traffic_daily: {
    dimensions: ["day", "insightTrafficSourceType"],
    metrics: ["views", "estimatedMinutesWatched", "engagedViews"],
  },
  device_daily: {
    dimensions: ["day", "deviceType"],
    metrics: ["views", "estimatedMinutesWatched", "engagedViews"],
  },
  // channel_reports は country+day のレポートを定義しない。指定期間の国別集計を保存する。
  country_period: {
    dimensions: ["country"],
    metrics: ["views", "estimatedMinutesWatched", "engagedViews"],
  },
};

export interface AnalyticsRawReport {
  availability: "available" | "empty" | "permission_denied";
  columnHeaders: Record<string, unknown>[];
  rows: { rowKey: string; values: unknown[] }[];
}

const PAGE_SIZE = 500;
const MAX_PAGES = 10;

function permissionDenied(status: number, body: unknown): boolean {
  if (status !== 403 || !body || typeof body !== "object") return false;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;
  const details = error as { errors?: unknown; status?: unknown };
  const reasons = Array.isArray(details.errors)
    ? details.errors.map((item) =>
        item && typeof item === "object" ? (item as { reason?: unknown }).reason : null,
      )
    : [];
  if (
    reasons.some((reason) =>
      ["quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(String(reason)),
    )
  )
    return false;
  return (
    reasons.some((reason) =>
      ["insufficientPermissions", "forbidden", "authError"].includes(String(reason)),
    ) || details.status === "PERMISSION_DENIED"
  );
}

function parsePage(
  raw: unknown,
  spec: ReportSpec,
): {
  headers: Record<string, unknown>[];
  rows: unknown[][];
  dimensionIndexes: number[];
} {
  if (!raw || typeof raw !== "object") {
    throw new GoogleCollectionError(true, "Analytics dimension response malformed");
  }
  const body = raw as { columnHeaders?: unknown; rows?: unknown };
  if (!Array.isArray(body.columnHeaders) || body.columnHeaders.length === 0) {
    throw new GoogleCollectionError(true, "Analytics dimension columnHeaders missing");
  }
  const headers = body.columnHeaders.map((value) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.name !== "string"
    ) {
      throw new GoogleCollectionError(true, "Analytics dimension header malformed");
    }
    return value as Record<string, unknown>;
  });
  const names = headers.map((header) => header.name);
  const required = [...spec.dimensions, ...spec.metrics];
  if (new Set(names).size !== names.length || required.some((name) => !names.includes(name))) {
    throw new GoogleCollectionError(false, "Analytics dimension required column missing");
  }
  if (body.rows !== undefined && !Array.isArray(body.rows)) {
    throw new GoogleCollectionError(true, "Analytics dimension rows malformed");
  }
  const rows = (body.rows ?? []) as unknown[];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== headers.length) {
      throw new GoogleCollectionError(true, "Analytics dimension row malformed");
    }
    if (
      row.some((value) => value !== null && !["string", "number", "boolean"].includes(typeof value))
    ) {
      throw new GoogleCollectionError(true, "Analytics dimension cell malformed");
    }
  }
  return {
    headers,
    rows: rows as unknown[][],
    dimensionIndexes: spec.dimensions.map((name) => names.indexOf(name)),
  };
}

/** Google reports.query のページを列順ごと原値で収集する。未返却の次元は作らない。 */
export async function queryChannelDimensions(input: {
  accessToken: string;
  channelId: string;
  reportKey: AnalyticsDimensionKey;
  startDate: string;
  endDate: string;
}): Promise<AnalyticsRawReport> {
  const spec = ANALYTICS_DIMENSION_SPECS[input.reportKey];
  const allRows: AnalyticsRawReport["rows"] = [];
  let headers: Record<string, unknown>[] | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(ANALYTICS_DIMENSIONS_URL);
    url.search = new URLSearchParams({
      ids: `channel==${input.channelId}`,
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: spec.dimensions.join(","),
      metrics: spec.metrics.join(","),
      sort: spec.dimensions.join(","),
      maxResults: String(PAGE_SIZE),
      startIndex: String(page * PAGE_SIZE + 1),
    }).toString();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { authorization: `Bearer ${input.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GoogleCollectionError(true, "Analytics dimension network failure");
    }
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      if (permissionDenied(response.status, raw)) {
        return { availability: "permission_denied", columnHeaders: [], rows: [] };
      }
      throw collectionHttpError(response.status, raw);
    }
    const parsed = parsePage(raw, spec);
    if (headers && JSON.stringify(headers) !== JSON.stringify(parsed.headers)) {
      throw new GoogleCollectionError(true, "Analytics dimension headers changed between pages");
    }
    headers = parsed.headers;
    if (parsed.rows.length > PAGE_SIZE) {
      throw new GoogleCollectionError(true, "Analytics dimension page exceeded requested size");
    }
    for (const values of parsed.rows) {
      const dimensions = parsed.dimensionIndexes.map((index) => values[index]);
      if (dimensions.some((value) => typeof value !== "string" || !value)) {
        throw new GoogleCollectionError(true, "Analytics dimension key malformed");
      }
      const rowKey = JSON.stringify(dimensions);
      if (seen.has(rowKey)) {
        throw new GoogleCollectionError(true, "Analytics dimension row duplicated");
      }
      seen.add(rowKey);
      allRows.push({ rowKey, values });
    }
    if (parsed.rows.length < PAGE_SIZE) {
      return {
        availability: allRows.length ? "available" : "empty",
        columnHeaders: headers,
        rows: allRows,
      };
    }
  }
  throw new GoogleCollectionError(true, "Analytics dimension pagination limit exceeded");
}
