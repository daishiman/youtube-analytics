import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REPORTING_API_URL } from "../../src/adapters/google-reporting-jobs";
import { GOOGLE_TOKEN_URL } from "../../src/adapters/google-youtube";
import { getReportTypes } from "../../src/usecases/report-types";
import { insertChannel, newLinkedOwner, randomChannelId } from "../helpers/channels";
import { call, expectError, newOwner } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const YOUTUBE_REPORT_TYPES_URL = `${REPORTING_API_URL}/reportTypes`;

const deps = () => ({ env, now: new Date("2026-09-25T03:00:00.000Z") });
const ctx = (owner: Awaited<ReturnType<typeof newOwner>>) => ({
  tenantId: owner.tenantId,
  userId: owner.userId,
  role: "owner" as const,
});

async function linked() {
  const { owner, channelId: id } = await newLinkedOwner("report-types");
  return { owner, id };
}

function mockReporting(
  pages: Array<{ reportTypes?: unknown; nextPageToken?: string; status?: number }>,
) {
  let page = 0;
  const calls: URL[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.href.startsWith(GOOGLE_TOKEN_URL)) {
      const form = new URLSearchParams(String(init?.body ?? ""));
      expect(form.get("grant_type")).toBe("refresh_token");
      return Response.json({ access_token: "private-reporting-access" });
    }
    if (url.href.startsWith(YOUTUBE_REPORT_TYPES_URL)) {
      calls.push(url);
      expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(
        "Bearer private-reporting-access",
      );
      const next = pages[page++] ?? {};
      return Response.json(next, { status: next.status ?? 200 });
    }
    throw new Error(`unexpected external URL: ${url.origin}${url.pathname}`);
  });
  return calls;
}

describe("Reporting API レポート種類の発見", () => {
  it("ルートはログインを必須とし、個人の応答をキャッシュしない", async () => {
    await expectError(await call("/api/data/report-types"), 401, "UNAUTHENTICATED");
    const { owner, id } = await linked();
    mockReporting([{ reportTypes: [{ id: "channel_basic_a2", name: "User activity" }] }]);
    const res = await call("/api/data/report-types", { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      status: "available",
      channelId: id,
      reportTypes: [
        {
          id: "channel_basic_a2",
          name: "User activity",
          deprecateTime: null,
          systemManaged: false,
        },
      ],
    });
  });

  it("未連携は Google に接続せず not_linked を返す", async () => {
    const owner = await newOwner("report-types-empty");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await getReportTypes(deps(), ctx(owner));
    expect(result).toEqual({ status: "not_linked", channelId: null, reportTypes: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("全ページを取得し、公開可能な種類フィールドだけを返す", async () => {
    const { owner, id } = await linked();
    const calls = mockReporting([
      {
        reportTypes: [
          { id: "channel_reach_basic_a1", name: "Reach", systemManaged: false, secret: "omit" },
        ],
        nextPageToken: "page-2",
      },
      {
        reportTypes: [
          { id: "channel_basic_a2", name: "User activity", deprecateTime: "2027-01-01T00:00:00Z" },
        ],
      },
    ]);
    const result = await getReportTypes(deps(), ctx(owner));
    expect(result).toEqual({
      status: "available",
      channelId: id,
      reportTypes: [
        {
          id: "channel_basic_a2",
          name: "User activity",
          deprecateTime: "2027-01-01T00:00:00Z",
          systemManaged: false,
        },
        { id: "channel_reach_basic_a1", name: "Reach", deprecateTime: null, systemManaged: false },
      ],
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.searchParams.get("includeSystemManaged")).toBe("true");
    expect(calls[1]?.searchParams.get("pageToken")).toBe("page-2");
    expect(JSON.stringify(result)).not.toContain("private-reporting-access");
  });

  it("一覧の 400/404 は権限不足にせず OAUTH_FAILED、同じ id は1件にまとめる", async () => {
    const { owner } = await linked();
    mockReporting([{ status: 400 }]);
    await expect(getReportTypes(deps(), ctx(owner))).rejects.toMatchObject({
      code: "OAUTH_FAILED",
    });
    vi.restoreAllMocks();
    mockReporting([
      { reportTypes: [{ id: "channel_basic_a2", name: "old" }], nextPageToken: "p2" },
      { reportTypes: [{ id: "channel_basic_a2", name: "new" }] },
    ]);
    const result = await getReportTypes(deps(), ctx(owner));
    expect(result.reportTypes.map((type) => type.name)).toEqual(["new"]);
  });

  it("権限不足・失効したトークンを permission_required として区別する", async () => {
    const { owner, id } = await linked();
    const calls = mockReporting([{ status: 403 }]);
    expect(await getReportTypes(deps(), ctx(owner))).toEqual({
      status: "permission_required",
      channelId: id,
      reportTypes: [],
    });
    expect(calls).toHaveLength(1);
    await env.DB.prepare("UPDATE channel_oauth_tokens SET granted_scopes = '' WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    expect(await getReportTypes(deps(), ctx(owner))).toEqual({
      status: "permission_required",
      channelId: id,
      reportTypes: [],
    });
    expect(calls).toHaveLength(1);
  });

  it("別テナントのトークンと削除予約中のチャンネルを使わない", async () => {
    const first = await linked();
    const second = await newOwner("report-types-other");
    const secondChannelId = randomChannelId();
    await insertChannel({
      tenantId: second.tenantId,
      channelId: secondChannelId,
      title: "other channel",
      connectedBy: second.userId,
      connectedAt: deps().now.toISOString(),
    }).run();
    const calls = mockReporting([
      { reportTypes: [{ id: "channel_basic_a2", name: "User activity" }] },
    ]);
    expect(await getReportTypes(deps(), ctx(second))).toEqual({
      status: "permission_required",
      channelId: secondChannelId,
      reportTypes: [],
    });
    await env.DB.prepare(
      `INSERT INTO data_deletions (deletion_id, tenant_id, scope, requested_by, requested_at, due_at)
       VALUES (?1, ?2, 'channel', ?3, ?4, ?4)`,
    )
      .bind(crypto.randomUUID(), first.owner.tenantId, first.owner.userId, deps().now.toISOString())
      .run();
    expect(await getReportTypes(deps(), ctx(first.owner))).toEqual({
      status: "not_linked",
      channelId: null,
      reportTypes: [],
    });
    expect(calls).toHaveLength(0);
  });

  it("テナント全体の削除予約中は外部へ問い合わせない", async () => {
    const { owner } = await linked();
    const calls = mockReporting([
      { reportTypes: [{ id: "channel_basic_a2", name: "User activity" }] },
    ]);
    await env.DB.prepare(
      `INSERT INTO data_deletions (deletion_id, tenant_id, scope, requested_by, requested_at, due_at)
       VALUES (?1, ?2, 'tenant', ?3, ?4, ?4)`,
    )
      .bind(crypto.randomUUID(), owner.tenantId, owner.userId, deps().now.toISOString())
      .run();
    const res = await call("/api/data/report-types", { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "not_linked", channelId: null, reportTypes: [] });
    expect(calls).toHaveLength(0);
  });
});
