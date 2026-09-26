// YouTube Reporting API（種類一覧・ジョブ・レポート一覧・原本ダウンロード）。アクセストークンを URL・例外文に含めない。
import { GoogleCollectionError } from "./google-youtube";

export const REPORTING_API_URL = "https://youtubereporting.googleapis.com/v1";
const MAX_PAGES = 200;

export interface ReportingType {
  id: string;
  name: string;
  deprecateTime: string | null;
  systemManaged: boolean;
}

/** 401/403。Reporting API の認可だけを失効扱いにする */
export class ReportingPermissionError extends Error {}

export interface ReportingJob {
  id: string;
  reportTypeId: string;
  name: string;
  systemManaged: boolean;
  createTime: string | null;
}

export interface ReportingReport {
  id: string;
  jobId: string;
  startTime: string;
  endTime: string;
  createTime: string;
  downloadUrl: string;
}

export class ReportingStaleConnectionError extends Error {}
type BeforeRequest = () => Promise<boolean>;

async function requestJson(
  accessToken: string,
  url: URL,
  body?: object,
  beforeRequest?: BeforeRequest,
): Promise<Record<string, unknown>> {
  if (beforeRequest && !(await beforeRequest())) throw new ReportingStaleConnectionError();
  let response: Response;
  try {
    response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GoogleCollectionError(true, "Reporting network failure");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ReportingPermissionError("Reporting permission required");
  }
  if (!response.ok)
    throw new GoogleCollectionError(
      response.status >= 500 || response.status === 429,
      `Reporting HTTP ${response.status}`,
    );
  const raw = await response.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new GoogleCollectionError(true, "Reporting response malformed");
  }
  return raw as Record<string, unknown>;
}

async function listPages<T>(
  accessToken: string,
  path: string,
  field: string,
  parse: (raw: unknown) => T,
  extra?: Record<string, string>,
  beforeRequest?: BeforeRequest,
): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${REPORTING_API_URL}${path}`);
    url.searchParams.set("pageSize", "100");
    for (const [key, value] of Object.entries(extra ?? {})) url.searchParams.set(key, value);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await requestJson(accessToken, url, undefined, beforeRequest);
    const items = body[field];
    if (items !== undefined && !Array.isArray(items)) {
      throw new GoogleCollectionError(true, `Reporting ${field} malformed`);
    }
    for (const item of (items ?? []) as unknown[]) result.push(parse(item));
    const next = body.nextPageToken;
    if (next === undefined || next === "") return result;
    if (typeof next !== "string" || seen.has(next)) {
      throw new GoogleCollectionError(true, "Reporting pagination invalid");
    }
    seen.add(next);
    pageToken = next;
  }
  throw new GoogleCollectionError(true, "Reporting pagination limit exceeded");
}

function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new GoogleCollectionError(true, "Reporting item malformed");
  }
  return raw as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new GoogleCollectionError(true, `Reporting ${label} missing`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  const valueString = string(value, label);
  if (!/^\d{4}-\d\d-\d\dT/.test(valueString) || !Number.isFinite(Date.parse(valueString))) {
    throw new GoogleCollectionError(true, `Reporting ${label} invalid`);
  }
  return valueString;
}

function parseJob(raw: unknown): ReportingJob {
  const job = object(raw);
  return {
    id: string(job.id, "job id"),
    reportTypeId: string(job.reportTypeId, "reportTypeId"),
    name: typeof job.name === "string" ? job.name : "",
    systemManaged: job.systemManaged === true,
    createTime:
      typeof job.createTime === "string" ? timestamp(job.createTime, "job createTime") : null,
  };
}

function parseReport(raw: unknown): ReportingReport {
  const report = object(raw);
  return {
    id: string(report.id, "report id"),
    jobId: string(report.jobId, "report jobId"),
    startTime: timestamp(report.startTime, "startTime"),
    endTime: timestamp(report.endTime, "endTime"),
    createTime: timestamp(report.createTime, "createTime"),
    downloadUrl: string(report.downloadUrl, "downloadUrl"),
  };
}

/** OAuth 主体が利用可能な種類を全ページ列挙する（並べ替え・重複除去は呼び出し側） */
export async function listAvailableReportingTypes(
  accessToken: string,
  beforeRequest?: BeforeRequest,
): Promise<ReportingType[]> {
  return listPages(
    accessToken,
    "/reportTypes",
    "reportTypes",
    (raw) => {
      const type = object(raw);
      return {
        id: string(type.id, "report type id"),
        name: string(type.name, "report type name"),
        deprecateTime: typeof type.deprecateTime === "string" ? type.deprecateTime : null,
        systemManaged: type.systemManaged === true,
      };
    },
    { includeSystemManaged: "true" },
    beforeRequest,
  );
}

export async function listReportingJobs(
  accessToken: string,
  beforeRequest?: BeforeRequest,
): Promise<ReportingJob[]> {
  return listPages(
    accessToken,
    "/jobs",
    "jobs",
    parseJob,
    { includeSystemManaged: "true" },
    beforeRequest,
  );
}

export async function createReportingJob(
  accessToken: string,
  reportTypeId: string,
  name: string,
  beforeRequest?: BeforeRequest,
): Promise<ReportingJob> {
  const body = await requestJson(
    accessToken,
    new URL(`${REPORTING_API_URL}/jobs`),
    { reportTypeId, name },
    beforeRequest,
  );
  return parseJob(body);
}

/**
 * jobs.reports.list の1ページ。createdAfter（RFC3339）を渡すと、それより後に作られた
 * レポート（backfill を含む）だけが返る。並び順は API 仕様に無いため呼び出し側で並べる
 */
export async function listJobReportsPage(
  accessToken: string,
  jobId: string,
  options: { pageSize: number; pageToken?: string; createdAfter?: string | null },
  beforeRequest?: BeforeRequest,
): Promise<{ reports: ReportingReport[]; nextPageToken: string | null }> {
  const url = new URL(`${REPORTING_API_URL}/jobs/${encodeURIComponent(jobId)}/reports`);
  url.searchParams.set("pageSize", String(options.pageSize));
  if (options.createdAfter) url.searchParams.set("createdAfter", options.createdAfter);
  if (options.pageToken) url.searchParams.set("pageToken", options.pageToken);
  const body = await requestJson(accessToken, url, undefined, beforeRequest);
  if (body.reports !== undefined && !Array.isArray(body.reports)) {
    throw new GoogleCollectionError(true, "Reporting reports malformed");
  }
  if (body.nextPageToken !== undefined && typeof body.nextPageToken !== "string") {
    throw new GoogleCollectionError(true, "Reporting report pagination invalid");
  }
  return {
    reports: ((body.reports ?? []) as unknown[]).map(parseReport),
    nextPageToken:
      typeof body.nextPageToken === "string" && body.nextPageToken ? body.nextPageToken : null,
  };
}

/** OAuth 主体の既存 job は再利用し、利用可能な非 system-managed 種類だけ新規作成する。 */
export async function ensureReportingJobs(
  accessToken: string,
  beforeRequest?: BeforeRequest,
): Promise<{ jobs: ReportingJob[]; pendingCreations: boolean }> {
  const [types, existing] = await Promise.all([
    listAvailableReportingTypes(accessToken, beforeRequest),
    listReportingJobs(accessToken, beforeRequest),
  ]);
  const byType = new Set(existing.map((job) => job.reportTypeId));
  const jobs = [...existing];
  let createdCount = 0;
  let pendingCreations = false;
  for (const type of types) {
    if (type.systemManaged || type.deprecateTime || byType.has(type.id)) continue;
    if (createdCount >= 3) {
      pendingCreations = true;
      continue;
    }
    const created = await createReportingJob(
      accessToken,
      type.id,
      `Channel Insight: ${type.id}`,
      beforeRequest,
    );
    if (created.reportTypeId !== type.id) {
      throw new GoogleCollectionError(true, "Reporting created job type mismatch");
    }
    jobs.push(created);
    byType.add(type.id);
    createdCount += 1;
  }
  return { jobs: jobs.sort((a, b) => a.id.localeCompare(b.id)), pendingCreations };
}

/** 認証ヘッダーを送る先を Reporting API に限定する。リダイレクト先にも転送しない。 */
export async function downloadReportingCsv(
  accessToken: string,
  downloadUrl: string,
): Promise<Response> {
  let url: URL;
  try {
    url = new URL(downloadUrl);
  } catch {
    throw new GoogleCollectionError(false, "Reporting download URL invalid");
  }
  if (url.protocol !== "https:" || url.hostname !== "youtubereporting.googleapis.com") {
    throw new GoogleCollectionError(false, "Reporting download URL host invalid");
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new GoogleCollectionError(true, "Reporting download network failure");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ReportingPermissionError("Reporting download permission required");
  }
  if (!response.ok || !response.body) {
    throw new GoogleCollectionError(
      response.status >= 500 || response.status === 429,
      `Reporting download HTTP ${response.status}`,
    );
  }
  return response;
}
