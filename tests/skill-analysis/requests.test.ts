// 画面の依頼 API（GET/POST /api/analysis-requests）: 権限・期間検査・連携前・レート制限・ページング
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  addMember,
  auditCount,
  call,
  count,
  expectError,
  newOwner,
  post,
} from "../platform/helpers";
import { connectChannel, createRequest, skill, skillTenant } from "./helpers";

const create = (cookie: string, body: unknown) => post("/api/analysis-requests", cookie, body);

describe("依頼の作成", () => {
  it("owner・editor は作成でき、待機中・A-連番・監査ログが付く", async () => {
    const t = await skillTenant("req-create");
    const editor = await addMember(t.owner, "editor");
    const res = await create(editor.cookie, {
      period_start: "2026-08-01",
      period_end: "2026-08-28",
      instruction: "  サムネイル中心に  ",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      channelId: t.channelId,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-28",
      instruction: "サムネイル中心に",
      status: "待機中",
      progress: 0,
      reportId: null,
      createdBy: editor.userId,
    });
    expect(body.requestId).toMatch(/^A-\d{4,}$/);
    await createRequest(t.owner);
    expect(await auditCount(t.owner.tenantId, "analysis.request")).toBe(2);
  });

  it("viewer は 403・未ログインは 401・CSRF ヘッダ無しは 403", async () => {
    const t = await skillTenant("req-perm");
    const viewer = await addMember(t.owner, "viewer");
    await expectError(
      await create(viewer.cookie, { period_start: "2026-08-01", period_end: "2026-08-02" }),
      403,
      "FORBIDDEN",
    );
    await expectError(await call("/api/analysis-requests"), 401, "UNAUTHENTICATED");
    const noCsrf = await call("/api/analysis-requests", {
      method: "POST",
      cookie: t.owner.cookie,
      csrf: false,
      body: { period_start: "2026-08-01", period_end: "2026-08-02" },
    });
    expect(noCsrf.status).toBe(403);
  });

  it("チャンネル未連携では作れない", async () => {
    const owner = await newOwner("req-nochan");
    await expectError(
      await create(owner.cookie, { period_start: "2026-08-01", period_end: "2026-08-02" }),
      409,
      "CHANNEL_NOT_CONNECTED",
    );
  });

  it.each([
    [{ period_start: "2026-08-10", period_end: "2026-08-01" }, "開始 > 終了"],
    [{ period_start: "2025-01-01", period_end: "2026-08-01" }, "1年超"],
    [{ period_start: "2026-08-01", period_end: "2999-01-01" }, "未来日"],
    [{ period_start: "2026/08/01", period_end: "2026-08-02" }, "形式"],
    [
      { period_start: "2026-08-01", period_end: "2026-08-02", instruction: "あ".repeat(1001) },
      "補足1001字",
    ],
  ])("期間・補足の誤りは 400（%j: %s）", async (body, _label) => {
    const t = await skillTenant("req-valid");
    await expectError(await create(t.owner.cookie, body), 400, "VALIDATION_FAILED");
  });

  it("補足指示はちょうど1000字なら受ける", async () => {
    const t = await skillTenant("req-1000");
    const res = await create(t.owner.cookie, {
      period_start: "2026-08-01",
      period_end: "2026-08-02",
      instruction: "あ".repeat(1000),
    });
    expect(res.status).toBe(201);
  });

  it("1ユーザー1分あたり11件目は 429", async () => {
    const t = await skillTenant("req-rate");
    for (let i = 0; i < 10; i++) await createRequest(t.owner);
    await expectError(
      await create(t.owner.cookie, { period_start: "2026-08-01", period_end: "2026-08-02" }),
      429,
      "RATE_LIMITED",
    );
  });
});

describe("依頼の一覧", () => {
  it("新しい順に20件ずつ返し、cursor で続きを取れる。他テナントの依頼は出ない", async () => {
    const t = await skillTenant("req-list");
    const other = await skillTenant("req-list-other");
    await createRequest(other.owner);
    // レート制限（1分10件）を避けて直接 25 件用意する
    for (let i = 1; i <= 25; i++)
      await env.DB.prepare(
        `INSERT INTO analysis_requests (tenant_id, request_id, channel_id, period_start, period_end,
           instruction, status, progress, stage, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, '2026-08-01', '2026-08-02', '', '待機中', 0, 0, ?4, ?5, ?5)`,
      )
        .bind(
          t.owner.tenantId,
          `A-${String(i).padStart(4, "0")}`,
          t.channelId,
          t.owner.userId,
          `2026-09-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        )
        .run();
    const viewer = await addMember(t.owner, "viewer");
    const first = (await (
      await call("/api/analysis-requests", { cookie: viewer.cookie })
    ).json()) as {
      items: { requestId: string }[];
      nextCursor: string | null;
    };
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.requestId).toBe("A-0025");
    expect(first.nextCursor).not.toBeNull();
    const second = (await (
      await call(`/api/analysis-requests?cursor=${encodeURIComponent(first.nextCursor ?? "")}`, {
        cookie: viewer.cookie,
      })
    ).json()) as { items: { requestId: string }[]; nextCursor: string | null };
    expect(second.items.map((r) => r.requestId)).toEqual([
      "A-0005",
      "A-0004",
      "A-0003",
      "A-0002",
      "A-0001",
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it("Bearer 個人トークンでは画面 API を呼べない（セッション専用）", async () => {
    const t = await skillTenant("req-bearer");
    const res = await skill("/api/analysis-requests", t.token);
    await expectError(res, 401, "UNAUTHENTICATED");
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM analysis_requests WHERE tenant_id = ?1",
        t.owner.tenantId,
      ),
    ).toBe(0);
  });

  it("連携チャンネルが無くても一覧は空で返る", async () => {
    const owner = await newOwner("req-empty");
    const res = await call("/api/analysis-requests", { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
    await connectChannel(owner);
  });
});
