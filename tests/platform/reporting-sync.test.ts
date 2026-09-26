import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_TOKEN_URL } from "../../src/adapters/google-youtube";
import type { ReportingMessage } from "../../src/env";
import { ReportingRepository } from "../../src/repositories/reporting-repository";
import {
  CsvRecordCounter,
  REPORT_LISTS_PER_MESSAGE,
  REPORTING_CURSOR_LOOKBACK_MS,
  REPORTS_PER_MESSAGE,
  syncTenantReporting,
} from "../../src/usecases/reporting-sync";
import { newLinkedOwner } from "../helpers/channels";
import { call, newOwner } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const NOW = new Date("2026-09-25T03:00:00.000Z");

async function linked() {
  const { owner, channelId } = await newLinkedOwner("reporting");
  const message = await new ReportingRepository(env.DB).currentMessage(owner.tenantId);
  expect(message).toBeTruthy();
  if (!message) throw new Error("no current message");
  return { owner, channelId, message };
}

function mockReporting(
  options: {
    onDownload?: () => Promise<void>;
    replacement?: boolean;
    paginated?: boolean;
    csv?: string;
  } = {},
) {
  let created = false;
  const calls: string[] = [];
  const report = (id: string, createTime: string, csv: string) => ({
    id,
    jobId: "job-1",
    startTime: "2026-09-20T08:00:00Z",
    endTime: "2026-09-21T08:00:00Z",
    createTime,
    downloadUrl: `https://youtubereporting.googleapis.com/v1/media/${id}?alt=media`,
    csv,
  });
  const first = report(
    "report-1",
    "2026-09-23T10:00:00Z",
    options.csv ?? "video_id,unknown_column\nabc,one\n",
  );
  const replacement = report(
    "report-2",
    "2026-09-24T10:00:00Z",
    "video_id,unknown_column\nabc,two\n",
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.href.startsWith(GOOGLE_TOKEN_URL))
      return Response.json({ access_token: "reporting-access" });
    expect((init?.headers as Record<string, string>)?.authorization).toBe(
      "Bearer reporting-access",
    );
    if (url.pathname === "/v1/reportTypes") {
      return Response.json({
        reportTypes: [
          { id: "channel_basic_a2", name: "basic", systemManaged: false },
          { id: "system_a1", name: "system", systemManaged: true },
        ],
      });
    }
    if (url.pathname === "/v1/jobs" && init?.method === "POST") {
      expect(JSON.parse(String(init.body))).toMatchObject({ reportTypeId: "channel_basic_a2" });
      created = true;
      return Response.json({ id: "job-1", reportTypeId: "channel_basic_a2", name: "basic" });
    }
    if (url.pathname === "/v1/jobs") {
      return Response.json({
        jobs: created ? [{ id: "job-1", reportTypeId: "channel_basic_a2", name: "basic" }] : [],
      });
    }
    if (url.pathname === "/v1/jobs/job-1/reports") {
      if (options.paginated) {
        return Response.json(
          url.searchParams.get("pageToken") === "next"
            ? { reports: [replacement] }
            : { reports: [first], nextPageToken: "next" },
        );
      }
      return Response.json({ reports: options.replacement ? [first, replacement] : [first] });
    }
    if (url.pathname.startsWith("/v1/media/")) {
      await options.onDownload?.();
      const selected = url.pathname.endsWith("report-2") ? replacement : first;
      return new Response(selected.csv, { headers: { "content-type": "text/csv" } });
    }
    throw new Error(`unexpected Reporting URL: ${url.pathname}`);
  });
  return { calls };
}

/** 重い処理の枠ちょうどの件数のページ。期間と create_time は古い順 */
const fullPage = (prefix: string) =>
  Array.from({ length: REPORTS_PER_MESSAGE }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    start: `2026-09-${String(10 + i).padStart(2, "0")}`,
    created: `2026-09-${String(12 + i).padStart(2, "0")}T10:00:00Z`,
  }));

/** jobs と各ジョブのレポートを返し、一覧 URL を記録する。page ごとに pageToken で続きを返す */
function mockReportList(
  jobs: { id: string; reportTypeId: string }[],
  pages: Record<
    string,
    { reports: { id: string; start: string; created: string }[]; next?: string }[]
  >,
) {
  const listed: URL[] = [];
  const downloads: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.href.startsWith(GOOGLE_TOKEN_URL))
      return Response.json({ access_token: "reporting-access" });
    if (url.pathname === "/v1/reportTypes") return Response.json({ reportTypes: [] });
    if (url.pathname === "/v1/jobs") return Response.json({ jobs });
    const match = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/reports$/);
    if (match?.[1]) {
      listed.push(url);
      const jobPages = pages[match[1]] ?? [];
      const index = Number(url.searchParams.get("pageToken") ?? "0");
      const page = jobPages[index] ?? { reports: [] };
      return Response.json({
        reports: page.reports.map((report) => ({
          id: report.id,
          jobId: match[1],
          startTime: `${report.start}T07:00:00Z`,
          endTime: `${report.start}T23:00:00Z`,
          createTime: report.created,
          downloadUrl: `https://youtubereporting.googleapis.com/v1/media/${report.id}?alt=media`,
        })),
        ...(page.next ? { nextPageToken: page.next } : {}),
      });
    }
    if (url.pathname.startsWith("/v1/media/")) {
      downloads.push(url.pathname.slice("/v1/media/".length));
      return new Response("video_id,views\nabc,1\n");
    }
    throw new Error(`unexpected Reporting URL: ${url.pathname}`);
  });
  return { listed, downloads };
}

function mockReach(channelId: string, firstCsv: string, secondCsv?: string) {
  let replacement = false;
  const reports = [
    {
      id: "reach-r1",
      jobId: "reach-job",
      startTime: "2026-09-20T07:00:00Z",
      endTime: "2026-09-21T07:00:00Z",
      createTime: "2026-09-23T10:00:00Z",
      downloadUrl: "https://youtubereporting.googleapis.com/v1/media/reach-r1?alt=media",
    },
    {
      id: "reach-r2",
      jobId: "reach-job",
      startTime: "2026-09-20T07:00:00Z",
      endTime: "2026-09-21T07:00:00Z",
      createTime: "2026-09-24T10:00:00Z",
      downloadUrl: "https://youtubereporting.googleapis.com/v1/media/reach-r2?alt=media",
    },
  ];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.href.startsWith(GOOGLE_TOKEN_URL))
      return Response.json({ access_token: "reporting-access" });
    expect((init?.headers as Record<string, string>)?.authorization).toBe(
      "Bearer reporting-access",
    );
    if (url.pathname === "/v1/reportTypes")
      return Response.json({
        reportTypes: [{ id: "channel_reach_basic_a1", name: "reach", systemManaged: false }],
      });
    if (url.pathname === "/v1/jobs")
      return Response.json({
        jobs: [{ id: "reach-job", reportTypeId: "channel_reach_basic_a1", name: "reach" }],
      });
    if (url.pathname === "/v1/jobs/reach-job/reports")
      return Response.json({ reports: [reports[replacement ? 1 : 0]] });
    if (url.pathname === "/v1/media/reach-r1") return new Response(firstCsv);
    if (url.pathname === "/v1/media/reach-r2") return new Response(secondCsv ?? "");
    throw new Error(`unexpected reach URL: ${url.pathname}`);
  });
  return {
    replace: () => {
      replacement = true;
    },
    row: (videoId: string, impressions: string, ctr: string) =>
      `2026-09-20,${channelId},${videoId},${impressions},${ctr}\n`,
  };
}

describe("Reporting API raw sync", () => {
  it("同期成功で現行 OAuth 世代の認可確認時刻を更新する", async () => {
    const { owner, message } = await linked();
    mockReporting();
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({ status: "synced" });
    const row = await env.DB.prepare(
      "SELECT connected_at, token_updated_at, verified_at, revoked_at FROM reporting_authorizations WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first();
    expect(row).toEqual({
      connected_at: message.connectedAt,
      token_updated_at: message.tokenUpdatedAt,
      verified_at: NOW.toISOString(),
      revoked_at: null,
    });
    const tracked = await env.DB.prepare(
      `SELECT o.r2_key FROM reporting_orphan_objects o
        JOIN reporting_raw_reports r ON r.tenant_id = o.tenant_id AND r.r2_key = o.r2_key
       WHERE o.tenant_id = ?1`,
    )
      .bind(owner.tenantId)
      .first<{ r2_key: string }>();
    expect(tracked?.r2_key).toContain(`/reporting/`);
  });

  it("invalid_grant は即時失効として原本を遮断し、通信障害では失効にしない", async () => {
    const { owner, message } = await linked();
    mockReporting();
    await syncTenantReporting(env, message, NOW);
    const repository = new ReportingRepository(env.DB);
    const key = await repository.rawReportKey(owner.tenantId, "report-1", NOW);
    expect(key).toBeTruthy();

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));
    await expect(syncTenantReporting(env, message, NOW)).rejects.toThrow(
      "Google token network failure",
    );
    expect(await repository.rawReportKey(owner.tenantId, "report-1", NOW)).toBe(key);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    );
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "permission_required",
      authorizationRevoked: true,
    });
    expect(await repository.rawReportKey(owner.tenantId, "report-1", NOW)).toBeNull();
  });

  it("Reporting の403は同APIの認可だけを失効扱いにする", async () => {
    const { owner, message } = await linked();
    mockReporting();
    await syncTenantReporting(env, message, NOW);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.startsWith(GOOGLE_TOKEN_URL)) {
        return Response.json({ access_token: "reporting-access" });
      }
      if (url.pathname === "/v1/reportTypes") return new Response("", { status: 403 });
      throw new Error(`unexpected URL: ${url.pathname}`);
    });
    const result = await syncTenantReporting(env, message, NOW);
    expect(result.status).toBe("permission_required");
    expect(result.authorizationRevoked).toBeUndefined();
    expect(
      await new ReportingRepository(env.DB).rawReportKey(owner.tenantId, "report-1", NOW),
    ).toBeNull();
  });

  it("CSV の未知列と引用符内改行を保持して論理行数を数える", () => {
    const counter = new CsvRecordCounter();
    counter.push(new TextEncoder().encode('id,"unknown,column"\n1,"two'));
    counter.push(new TextEncoder().encode(' lines"\n2,other\n'));
    expect(counter.finish()).toEqual({
      header: ["id", "unknown,column"],
      rowCount: 2,
      byteCount: new TextEncoder().encode('id,"unknown,column"\n1,"two lines"\n2,other\n')
        .byteLength,
    });
  });

  it("OAuth クライアントの D1 行がなくても有効な連携を選ぶ", async () => {
    const { owner, message } = await linked();
    await env.DB.prepare("DELETE FROM tenant_google_clients WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    const repository = new ReportingRepository(env.DB);
    expect(await repository.currentMessage(owner.tenantId)).toEqual(message);
    const generation = await repository.generation(message);
    expect(generation).not.toBeNull();
    if (generation === null) throw new Error("missing generation");
    expect(await repository.isCurrent(message, generation)).toBe(true);
  });

  it("ジョブを一度だけ作り、原本を R2 に保存して再実行で重複させない", async () => {
    const { owner, message } = await linked();
    const { calls } = mockReporting();
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      jobs: 1,
      stored: 1,
    });
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      jobs: 1,
      stored: 0,
    });
    expect(calls.filter((call) => call === "POST /v1/jobs")).toHaveLength(1);
    const row = await env.DB.prepare(
      "SELECT report_type_id, report_type_version, report_id, header_json, row_count, status, r2_key FROM reporting_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{
        report_type_id: string;
        report_type_version: string;
        report_id: string;
        header_json: string;
        row_count: number;
        status: string;
        r2_key: string;
      }>();
    expect(row).toMatchObject({
      report_type_id: "channel_basic_a2",
      report_type_version: "a2",
      report_id: "report-1",
      row_count: 1,
      status: "stored",
    });
    expect(JSON.parse(row?.header_json ?? "[]")).toEqual(["video_id", "unknown_column"]);
    expect(row?.r2_key).toContain(`tenants/${owner.tenantId}/generations/g0/reporting/`);
    expect(await (await env.MEDIA.get(row?.r2_key ?? ""))?.text()).toBe(
      "video_id,unknown_column\nabc,one\n",
    );
  });

  it("同期間の後発 report の createTime が新しければ置き換える", async () => {
    const { owner, message } = await linked();
    mockReporting({ replacement: true });
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      stored: 1,
    });
    const row = await env.DB.prepare(
      "SELECT report_id, create_time, r2_key FROM reporting_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ report_id: string; create_time: string; r2_key: string }>();
    expect(row?.report_id).toBe("report-2");
    expect(await (await env.MEDIA.get(row?.r2_key ?? ""))?.text()).toContain("abc,two");
  });

  it("保存したページの続きは取得位置を載せた次の通で読み、更新版に置き換える", async () => {
    const { owner, message: linkedMessage } = await linked();
    const message = { ...linkedMessage, cycleStartedAt: NOW.toISOString() };
    mockReporting({ paginated: true });
    const first = await syncTenantReporting(env, message, NOW);
    // 同じ通で次ページへ進むと、次ページで失敗した再試行が進んだ D1 から位置を作り直して古い未保存を飛ばす
    expect(first).toMatchObject({ status: "synced", stored: 1, remaining: true });
    const next = first.nextMessage;
    if (next?.kind !== "reporting") throw new Error("expected reporting continuation");
    expect(next.reportPageToken).toBeTruthy();
    expect(next.reportCursor).toBeDefined();
    // 次の通を2回実行しても（再試行を模す）、通に載った位置は変わらない
    expect(await syncTenantReporting(env, next, NOW)).toMatchObject({
      status: "synced",
      remaining: false,
    });
    expect(await syncTenantReporting(env, next, NOW)).toMatchObject({
      status: "synced",
      remaining: false,
    });
    const row = await env.DB.prepare(
      "SELECT report_id FROM reporting_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ report_id: string }>();
    expect(row?.report_id).toBe("report-2");
  });

  it("16 MB を超える CSV も multipart で原本と行数を保存する", async () => {
    const { owner, message } = await linked();
    const csv = `video_id,unknown_column\nabc,${"x".repeat(17 * 1024 * 1024)}\n`;
    mockReporting({ csv });
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      stored: 1,
    });
    const row = await env.DB.prepare(
      "SELECT row_count, byte_count, r2_key FROM reporting_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ row_count: number; byte_count: number; r2_key: string }>();
    expect(row?.row_count).toBe(1);
    expect(row?.byte_count).toBe(new TextEncoder().encode(csv).byteLength);
    expect((await env.MEDIA.head(row?.r2_key ?? ""))?.size).toBe(row?.byte_count);
  });

  it("ダウンロード中に削除予約された旧世代は登録しない", async () => {
    const { owner, message } = await linked();
    mockReporting({
      onDownload: async () => {
        await env.DB.prepare(
          "UPDATE tenants SET import_generation = import_generation + 1 WHERE tenant_id = ?1",
        )
          .bind(owner.tenantId)
          .run();
      },
    });
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "stale",
      stored: 0,
    });
    const row = await env.DB.prepare(
      "SELECT 1 AS present FROM reporting_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first();
    expect(row).toBeNull();
  });

  it("認可されたテナントだけが全列一覧と CSV 原本を取得できる", async () => {
    const { owner, message } = await linked();
    mockReporting();
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      stored: 1,
    });
    const listed = await call("/api/data/reporting-reports", { cookie: owner.cookie });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      reports: { reportId: string; header: string[]; rowCount: number }[];
    };
    expect(body.reports[0]).toMatchObject({
      reportId: "report-1",
      header: ["video_id", "unknown_column"],
      rowCount: 1,
    });
    const csv = await call("/api/data/reporting-reports/report-1/csv", { cookie: owner.cookie });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-disposition")).toContain("attachment");
    expect(await csv.text()).toBe("video_id,unknown_column\nabc,one\n");

    const other = await newOwner("other-reporting");
    const denied = await call("/api/data/reporting-reports/report-1/csv", { cookie: other.cookie });
    expect(denied.status).toBe(404);
  });

  it("手動同期はその場でダウンロードせず Queue に世代付き要求を積む", async () => {
    const { owner, message } = await linked();
    const send = vi.spyOn(env.COLLECT_QUEUE, "send");
    const response = await call("/api/data/reporting-sync", {
      method: "POST",
      cookie: owner.cookie,
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "queued" });
    expect(send).toHaveBeenCalledWith({
      kind: "reporting",
      tenantId: message.tenantId,
      channelId: message.channelId,
      connectedAt: message.connectedAt,
      tokenUpdatedAt: message.tokenUpdatedAt,
    });
  });

  it("公式 reach basic の並べ替えた列だけを動画日次へ反映し、未知列は原本に残す", async () => {
    const { owner, channelId, message } = await linked();
    const csv =
      `extra,video_thumbnail_impressions_ctr,video_id,date,channel_id,video_thumbnail_impressions\n` +
      `"a,b",4.8,video000001,2026-09-20,${channelId},100\n` +
      `unknown,3.2,,2026-09-20,${channelId},25\n`;
    mockReach(channelId, csv);
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      stored: 1,
    });
    const { results } = await env.DB.prepare(
      "SELECT video_id, date, video_thumbnail_impressions, video_thumbnail_impressions_ctr, report_id FROM video_reach_daily WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .all();
    expect(results).toEqual([
      {
        video_id: "video000001",
        date: "2026-09-20",
        video_thumbnail_impressions: 100,
        video_thumbnail_impressions_ctr: 4.8,
        report_id: "reach-r1",
      },
    ]);
    const raw = await env.DB.prepare(
      "SELECT normalized_at, r2_key FROM reporting_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ normalized_at: string | null; r2_key: string }>();
    expect(raw?.normalized_at).toBe(NOW.toISOString());
    expect(await (await env.MEDIA.get(raw?.r2_key ?? ""))?.text()).toBe(csv);
  });

  it("更新版の行が減った場合、同日の旧動画行を原子的に消す", async () => {
    const { owner, channelId, message } = await linked();
    const header =
      "date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n";
    const first = `${header}2026-09-20,${channelId},video000001,100,4.8\n2026-09-20,${channelId},video000002,200,5.2\n`;
    const second = `${header}2026-09-20,${channelId},video000001,120,6.1\n`;
    const api = mockReach(channelId, first, second);
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({ stored: 1 });
    api.replace();
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({ stored: 1 });
    const { results } = await env.DB.prepare(
      "SELECT video_id, video_thumbnail_impressions, report_id FROM video_reach_daily WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .all();
    expect(results).toEqual([
      { video_id: "video000001", video_thumbnail_impressions: 120, report_id: "reach-r2" },
    ]);
  });

  it("更新版がヘッダーのみなら同期間の旧指標を消す", async () => {
    const { owner, channelId, message } = await linked();
    const header =
      "date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n";
    const api = mockReach(
      channelId,
      `${header}2026-09-20,${channelId},video000001,100,4.8\n`,
      header,
    );
    await syncTenantReporting(env, message, NOW);
    api.replace();
    await syncTenantReporting(env, message, NOW);
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM video_reach_daily WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("不正な更新版は原本のみ残し、旧指標を保持する", async () => {
    const { owner, channelId, message } = await linked();
    const header =
      "date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n";
    const api = mockReach(
      channelId,
      `${header}2026-09-20,${channelId},video000001,100,4.8\n`,
      `${header}2026-09-20,UC_other,video000001,120,6.1\n`,
    );
    await syncTenantReporting(env, message, NOW);
    api.replace();
    await syncTenantReporting(env, message, NOW);
    const metric = await env.DB.prepare(
      "SELECT video_thumbnail_impressions, report_id FROM video_reach_daily WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ video_thumbnail_impressions: number; report_id: string }>();
    expect(metric).toEqual({ video_thumbnail_impressions: 100, report_id: "reach-r1" });
    const raw = await env.DB.prepare(
      "SELECT report_id, normalized_at FROM reporting_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ report_id: string; normalized_at: string | null }>();
    expect(raw).toEqual({ report_id: "reach-r2", normalized_at: null });
  });

  it("原本保存後に正規化だけ未完了なら再ダウンロードせず再処理する", async () => {
    const { owner, channelId, message } = await linked();
    const csv = `date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n2026-09-20,${channelId},video000001,100,4.8\n`;
    mockReach(channelId, csv);
    await syncTenantReporting(env, message, NOW);
    await env.DB.prepare(
      "UPDATE reporting_raw_reports SET normalized_at = NULL WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .run();
    await env.DB.prepare("DELETE FROM video_reach_daily WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      stored: 0,
    });
    const metric = await env.DB.prepare(
      "SELECT video_thumbnail_impressions FROM video_reach_daily WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ video_thumbnail_impressions: number }>();
    expect(metric?.video_thumbnail_impressions).toBe(100);
  });

  it("ステージが複数バッチになる日も全行を反映する", async () => {
    const { owner, channelId, message } = await linked();
    const header =
      "date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n";
    const csv =
      header +
      Array.from(
        { length: 2501 },
        (_, index) =>
          `2026-09-20,${channelId},video${String(index).padStart(6, "0")},${index},4.8\n`,
      ).join("");
    mockReach(channelId, csv);
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      stored: 1,
    });
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM video_reach_daily WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(row?.n).toBe(2501);
  });
});

describe("Reporting 取得位置（createdAfter）と1通複数件", () => {
  const basic = { id: "job-a", reportTypeId: "channel_basic_a2" };
  const traffic = { id: "job-b", reportTypeId: "channel_traffic_source_a2" };

  it("1通で複数レポートを古い順に保存し、pageSize を数件にする", async () => {
    const { owner, message } = await linked();
    const api = mockReportList([basic], {
      "job-a": [
        {
          reports: [
            { id: "r3", start: "2026-09-22", created: "2026-09-24T10:00:00Z" },
            { id: "r1", start: "2026-09-20", created: "2026-09-22T10:00:00Z" },
            { id: "r2", start: "2026-09-21", created: "2026-09-23T10:00:00Z" },
          ],
        },
      ],
    });
    expect(await syncTenantReporting(env, message, NOW)).toMatchObject({
      status: "synced",
      stored: 3,
      remaining: false,
    });
    expect(api.downloads).toEqual(["r1", "r2", "r3"]);
    expect(api.listed[0]?.searchParams.get("pageSize")).toBe(String(REPORTS_PER_MESSAGE));
    expect(api.listed[0]?.searchParams.has("createdAfter")).toBe(false);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM reporting_raw_reports WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(row?.n).toBe(3);
  });

  it("保存済みがあれば最新 create_time から1日戻した createdAfter を付ける", async () => {
    const { message } = await linked();
    mockReportList([basic], {
      "job-a": [{ reports: [{ id: "r1", start: "2026-09-20", created: "2026-09-23T10:00:00Z" }] }],
    });
    await syncTenantReporting(env, message, NOW);
    vi.restoreAllMocks();
    const api = mockReportList([basic], { "job-a": [{ reports: [] }] });
    await syncTenantReporting(env, message, NOW);
    expect(api.listed[0]?.searchParams.get("createdAfter")).toBe(
      new Date(Date.parse("2026-09-23T10:00:00Z") - REPORTING_CURSOR_LOOKBACK_MS).toISOString(),
    );
  });

  it("重い処理の枠を使い切ったら続きページを次の通に回し、通に載った取得位置を使う", async () => {
    const { message } = await linked();
    const api = mockReportList([basic], {
      "job-a": [
        { reports: fullPage("r"), next: "1" },
        { reports: [{ id: "r9", start: "2026-09-21", created: "2026-09-23T10:00:00Z" }] },
      ],
    });
    const first = await syncTenantReporting(env, message, NOW);
    expect(first).toMatchObject({ stored: REPORTS_PER_MESSAGE, remaining: true });
    expect(api.listed).toHaveLength(1);
    expect(first.nextMessage).toMatchObject({
      jobOffset: 0,
      reportPageToken: "1",
      reportCursor: { jobId: "job-a", createdAfter: null },
    });
    if (!first.nextMessage) throw new Error("missing continuation");
    // 1ページ目は保存済みでも、続きと再試行は同じ位置（全件）で取る
    await syncTenantReporting(env, first.nextMessage, NOW);
    await syncTenantReporting(env, first.nextMessage, NOW);
    expect(api.listed.slice(1).map((url) => url.searchParams.has("createdAfter"))).toEqual([
      false,
      false,
    ]);
  });

  it("次のジョブの通にはそのジョブの取得位置を載せ、別ジョブの位置は使わない", async () => {
    const { message } = await linked();
    mockReportList([basic, traffic], {
      "job-b": [{ reports: [{ id: "t1", start: "2026-09-20", created: "2026-09-21T00:00:00Z" }] }],
    });
    const seed = { ...message, kind: "reporting" as const, jobOffset: 1 };
    await syncTenantReporting(env, seed, NOW);
    vi.restoreAllMocks();
    const api = mockReportList([basic, traffic], { "job-a": [{ reports: fullPage("a") }] });
    const first = await syncTenantReporting(env, message, NOW);
    // job-a で枠を使い切ったので、job-b は位置を決めて次の通に回す
    expect(api.listed.map((url) => url.pathname)).toEqual(["/v1/jobs/job-a/reports"]);
    expect(first.nextMessage).toMatchObject({
      jobOffset: 1,
      reportCursor: {
        jobId: "job-b",
        createdAfter: new Date(
          Date.parse("2026-09-21T00:00:00Z") - REPORTING_CURSOR_LOOKBACK_MS,
        ).toISOString(),
      },
    });
    if (!first.nextMessage) throw new Error("missing next job");
    const mismatched = { ...first.nextMessage, jobOffset: 0 };
    await syncTenantReporting(env, mismatched, NOW);
    // job-a に job-b の位置を使わず、job-a の保存済みから決め直す
    expect(api.listed.at(-1)?.pathname).toBe("/v1/jobs/job-a/reports");
    expect(api.listed.at(-1)?.searchParams.get("createdAfter")).toBe(
      new Date(
        Date.parse(fullPage("a").at(-1)?.created ?? "") - REPORTING_CURSOR_LOOKBACK_MS,
      ).toISOString(),
    );
  });

  it("新規レポートのない25ジョブは数通で終わり、再試行しても通の取得位置は変わらない", async () => {
    const { message } = await linked();
    const jobs = Array.from({ length: 25 }, (_, i) => ({
      id: `job-${String(i).padStart(2, "0")}`,
      reportTypeId: `type_${i}`,
    }));
    const api = mockReportList(jobs, {});
    const sent: ReportingMessage[] = [];
    let result = await syncTenantReporting(env, message, NOW);
    while (result.nextMessage) {
      const next = result.nextMessage;
      sent.push(next);
      const retried = await syncTenantReporting(env, next, NOW);
      // 同じ通の再試行は同じ続きを返す
      expect((await syncTenantReporting(env, next, NOW)).nextMessage).toEqual(retried.nextMessage);
      result = retried;
    }
    expect(sent).toHaveLength(Math.ceil(jobs.length / REPORT_LISTS_PER_MESSAGE) - 1);
    expect(new Set(api.listed.map((url) => url.pathname)).size).toBe(jobs.length);
  });

  it("新しいレポートのないジョブは同じ通で次へ進み、一覧の上限で次の通に回す", async () => {
    const { message } = await linked();
    const jobs = Array.from({ length: REPORT_LISTS_PER_MESSAGE + 2 }, (_, i) => ({
      id: `job-${String(i).padStart(2, "0")}`,
      reportTypeId: `type_${i}`,
    }));
    const api = mockReportList(jobs, {});
    const first = await syncTenantReporting(env, message, NOW);
    expect(api.listed).toHaveLength(REPORT_LISTS_PER_MESSAGE);
    expect(first).toMatchObject({ status: "synced", remaining: true });
    expect(first.nextMessage).toMatchObject({
      jobOffset: REPORT_LISTS_PER_MESSAGE,
      reportCursor: {
        jobId: `job-${String(REPORT_LISTS_PER_MESSAGE).padStart(2, "0")}`,
        createdAfter: null,
      },
    });
    if (!first.nextMessage) throw new Error("missing next job");
    expect(await syncTenantReporting(env, first.nextMessage, NOW)).toMatchObject({
      remaining: false,
    });
    expect(api.listed).toHaveLength(jobs.length);
  });
});
