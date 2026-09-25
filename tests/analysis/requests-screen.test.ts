// AI分析画面の依頼 API: 詳細・取消・再実行・プロンプト・使用データの件数・スキルからの依頼作成
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { AnalysisRepository } from "../../src/repositories/skill-analysis-repository";
import {
  addMember,
  auditCount,
  call,
  expectError,
  json,
  newOwner,
  post,
} from "../platform/helpers";
import {
  connectChannel,
  createRequest,
  issueToken,
  postReport,
  sampleReport,
  seedExportRows,
  skill,
  skillTenant,
} from "../skill-analysis/helpers";

type RequestView = {
  requestId: string;
  status: string;
  retryOf: string | null;
  canceledAt: string | null;
  canceledBy: string | null;
  createdVia: string;
  periodStart: string;
  periodEnd: string;
  instruction: string;
};

async function failRequest(token: string, requestId: string) {
  const res = await skill(`/api/skill/requests/${requestId}`, token, {
    method: "PATCH",
    body: { status: "失敗", error: "書き出しの取得に失敗しました" },
  });
  expect(res.status).toBe(200);
}

describe("依頼の詳細", () => {
  it("閲覧者でも取れ、他テナントの依頼は 404", async () => {
    const t = await skillTenant("scr-get");
    const other = await skillTenant("scr-get-other");
    const requestId = await createRequest(t.owner);
    const viewer = await addMember(t.owner, "viewer");
    const res = await call(`/api/analysis-requests/${requestId}`, { cookie: viewer.cookie });
    expect(res.status).toBe(200);
    expect(await json<RequestView>(res)).toMatchObject({
      requestId,
      status: "待機中",
      createdVia: "web",
      retryOf: null,
    });
    await expectError(
      await call(`/api/analysis-requests/${requestId}`, { cookie: other.owner.cookie }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("取消", () => {
  it("取込直前に取消されてもレポートと明細を残さず 409 にする", async () => {
    const t = await skillTenant("scr-cancel-race");
    const requestId = await createRequest(t.owner);
    const original = AnalysisRepository.prototype.insertReport;
    const insert = vi
      .spyOn(AnalysisRepository.prototype, "insertReport")
      .mockImplementation(async function (this: AnalysisRepository, report) {
        await env.DB.prepare(
          "UPDATE analysis_requests SET status = '取消' WHERE tenant_id = ?1 AND request_id = ?2",
        )
          .bind(t.owner.tenantId, requestId)
          .run();
        return original.call(this, report);
      });
    try {
      await expectError(await postReport(t, sampleReport(requestId, 1)), 409, "REQUEST_CANCELED");
    } finally {
      insert.mockRestore();
    }
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM reports WHERE tenant_id = ?1 AND request_id = ?2",
      )
        .bind(t.owner.tenantId, requestId)
        .first<{ n: number }>(),
    ).toEqual({ n: 0 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM findings WHERE tenant_id = ?1")
        .bind(t.owner.tenantId)
        .first<{ n: number }>(),
    ).toEqual({ n: 0 });
    const request = await env.DB.prepare(
      "SELECT status, report_id FROM analysis_requests WHERE tenant_id = ?1 AND request_id = ?2",
    )
      .bind(t.owner.tenantId, requestId)
      .first<{ status: string; report_id: string | null }>();
    expect(request).toEqual({ status: "取消", report_id: null });
  });

  it("待機中・実行中を取消にし、取消者と時刻・監査ログを残す。以後スキルの送信は 409", async () => {
    const t = await skillTenant("scr-cancel");
    const editor = await addMember(t.owner, "editor");
    const requestId = await createRequest(t.owner);
    const res = await post(`/api/analysis-requests/${requestId}/cancel`, editor.cookie);
    expect(res.status).toBe(200);
    const body = await json<RequestView>(res);
    expect(body.status).toBe("取消");
    expect(body.canceledBy).toBe(editor.userId);
    expect(body.canceledAt).not.toBeNull();
    expect(await auditCount(t.owner.tenantId, "analysis.cancel")).toBe(1);

    // スキル側には「取り消された」と分かる専用コードで返す
    await expectError(await postReport(t, sampleReport(requestId, 1)), 409, "REQUEST_CANCELED");
    await expectError(
      await skill(`/api/skill/requests/${requestId}`, t.token, {
        method: "PATCH",
        body: { progress: 40, stage: 2 },
      }),
      409,
      "REQUEST_CANCELED",
    );
    // 取消済みをもう一度取り消すことはできない
    await expectError(
      await post(`/api/analysis-requests/${requestId}/cancel`, t.owner.cookie),
      409,
      "REQUEST_STATE_CONFLICT",
    );
  });

  it("実行中も取り消せる。完了・失敗は 409", async () => {
    const t = await skillTenant("scr-cancel-run");
    const running = await createRequest(t.owner);
    await skill(`/api/skill/requests/${running}`, t.token, {
      method: "PATCH",
      body: { progress: 30, stage: 1 },
    });
    expect((await post(`/api/analysis-requests/${running}/cancel`, t.owner.cookie)).status).toBe(
      200,
    );

    const failed = await createRequest(t.owner);
    await failRequest(t.token, failed);
    await expectError(
      await post(`/api/analysis-requests/${failed}/cancel`, t.owner.cookie),
      409,
      "REQUEST_STATE_CONFLICT",
    );

    const done = await createRequest(t.owner);
    expect((await postReport(t, sampleReport(done, 1))).status).toBe(201);
    await expectError(
      await post(`/api/analysis-requests/${done}/cancel`, t.owner.cookie),
      409,
      "REQUEST_STATE_CONFLICT",
    );
  });

  it("viewer は 403 で状態は変わらない", async () => {
    const t = await skillTenant("scr-cancel-viewer");
    const viewer = await addMember(t.owner, "viewer");
    const requestId = await createRequest(t.owner);
    await expectError(
      await post(`/api/analysis-requests/${requestId}/cancel`, viewer.cookie),
      403,
      "FORBIDDEN",
    );
    const row = await env.DB.prepare(
      "SELECT status FROM analysis_requests WHERE tenant_id = ?1 AND request_id = ?2",
    )
      .bind(t.owner.tenantId, requestId)
      .first<{ status: string }>();
    expect(row?.status).toBe("待機中");
  });
});

describe("再実行", () => {
  it("失敗・取消の依頼と同じ期間・補足指示で新しい依頼を作り、元の ID を残す", async () => {
    const t = await skillTenant("scr-retry");
    const src = await createRequest(t.owner, {
      period_start: "2026-08-03",
      period_end: "2026-08-20",
      instruction: "サムネイル中心に",
    });
    await failRequest(t.token, src);
    const res = await post(`/api/analysis-requests/${src}/retry`, t.owner.cookie);
    expect(res.status).toBe(201);
    const body = await json<RequestView>(res);
    expect(body).toMatchObject({
      status: "待機中",
      retryOf: src,
      createdVia: "web",
      periodStart: "2026-08-03",
      periodEnd: "2026-08-20",
      instruction: "サムネイル中心に",
    });
    expect(body.requestId).not.toBe(src);
    expect(await auditCount(t.owner.tenantId, "analysis.retry")).toBe(1);

    const canceled = await createRequest(t.owner);
    await post(`/api/analysis-requests/${canceled}/cancel`, t.owner.cookie);
    expect((await post(`/api/analysis-requests/${canceled}/retry`, t.owner.cookie)).status).toBe(
      201,
    );
  });

  it("待機中・完了の依頼は再実行できない（409）", async () => {
    const t = await skillTenant("scr-retry-bad");
    const waiting = await createRequest(t.owner);
    await expectError(
      await post(`/api/analysis-requests/${waiting}/retry`, t.owner.cookie),
      409,
      "REQUEST_STATE_CONFLICT",
    );
  });

  it("再実行も依頼作成のレート制限（1分10件）に数える", async () => {
    const t = await skillTenant("scr-retry-rate");
    const src = await createRequest(t.owner);
    await failRequest(t.token, src);
    for (let i = 0; i < 9; i++) await createRequest(t.owner);
    await expectError(
      await post(`/api/analysis-requests/${src}/retry`, t.owner.cookie),
      429,
      "RATE_LIMITED",
    );
  });
});

describe("Claude Code 用プロンプト", () => {
  it("依頼 ID・期間・補足指示・送信先を含み、トークンの平文は含まない", async () => {
    const t = await skillTenant("scr-prompt");
    const requestId = await createRequest(t.owner, {
      period_start: "2026-08-01",
      period_end: "2026-08-28",
      instruction: "コメントの感情を重視",
    });
    const viewer = await addMember(t.owner, "viewer");
    const res = await call(`/api/analysis-requests/${requestId}/prompt`, {
      cookie: viewer.cookie,
    });
    expect(res.status).toBe(200);
    const { prompt } = await json<{ prompt: string }>(res);
    expect(prompt.startsWith(`/yt-analyze ${requestId}`)).toBe(true);
    expect(prompt).toContain("2026-08-01 〜 2026-08-28");
    expect(prompt).toContain("コメントの感情を重視");
    expect(prompt).toContain(`/api/skill/export?request_id=${requestId}`);
    expect(prompt).toContain("/api/skill/reports");
    expect(prompt).toMatch(/^環境変数: YTA_BASE_URL=https?:\/\/\S+$/m);
    expect(prompt).toContain("YTA_SKILL_TOKEN");
    expect(prompt).not.toContain(t.token);
    expect(prompt).not.toMatch(/yta_[A-Za-z0-9_-]{20,}/);
    expect(prompt).not.toContain(t.owner.tenantId);
  });
});

describe("使用データの件数", () => {
  it("依存 feature の表が無い項目は null（未取得）、ある項目は件数と内訳を返す", async () => {
    const t = await skillTenant("scr-summary");
    await seedExportRows(t.owner.tenantId, t.channelId, [
      { source: "api", period: "2026-08-03", metric: "impressions", value: 100 },
      { source: "api", period: "2026-08-10", metric: "ctr", value: 0.04 },
      { source: "studio_csv", period: "2026-08-10", metric: "m1", value: 0.5 },
      { source: "api", period: "2026-06-01", metric: "ctr", value: 0.04 },
    ]);
    await skill("/api/skill/transcripts", t.token, {
      method: "POST",
      body: {
        video_id: "vid_abc123",
        source: "srt",
        segments: [{ start_ms: 0, end_ms: 900, text: "こんにちは" }],
      },
    });
    const viewer = await addMember(t.owner, "viewer");
    const res = await call("/api/analysis/data-summary?from=2026-08-01&to=2026-08-28", {
      cookie: viewer.cookie,
    });
    expect(res.status).toBe(200);
    const body = await json<{
      period: { start: string; end: string };
      counts: Record<string, number | null>;
      exportRows: { total: number; bySource: { key: string; n: number }[] } | null;
    }>(res);
    expect(body.period).toEqual({ start: "2026-08-01", end: "2026-08-28" });
    expect(body.counts.transcripts).toBe(1);
    expect(body.counts.sceneImages).toBe(0);
    // 日次収集（daily_metrics）・コメントの表は依存 feature が作るまで無い
    expect(body.counts.dailyMetrics).toBeNull();
    expect(body.counts.comments).toBeNull();
    expect(body.exportRows).toEqual({
      total: 3,
      bySource: [
        { key: "api", n: 2 },
        { key: "studio_csv", n: 1 },
      ],
    });
  });

  it("期間の誤りは 400、期間省略は直近28日", async () => {
    const t = await skillTenant("scr-summary-period");
    await expectError(
      await call("/api/analysis/data-summary?from=2026-08-10&to=2026-08-01", {
        cookie: t.owner.cookie,
      }),
      400,
      "VALIDATION_FAILED",
    );
    const res = await call("/api/analysis/data-summary", { cookie: t.owner.cookie });
    const { period } = await json<{ period: { start: string; end: string } }>(res);
    const days = (Date.parse(period.end) - Date.parse(period.start)) / 86_400_000 + 1;
    expect(days).toBe(28);
  });
});

describe("スキルからの依頼作成（POST /api/skill/requests）", () => {
  it("実行中・created_via=skill で作り、期間省略は直近28日", async () => {
    const t = await skillTenant("scr-skill-req");
    const res = await skill("/api/skill/requests", t.token, {
      method: "POST",
      body: { instruction: "  CTR を中心に  " },
    });
    expect(res.status).toBe(201);
    const body = await json<RequestView>(res);
    expect(body).toMatchObject({
      status: "実行中",
      createdVia: "skill",
      instruction: "CTR を中心に",
    });
    expect(body.requestId).toMatch(/^A-\d{4,}$/);
    expect(await auditCount(t.owner.tenantId, "analysis.request")).toBe(1);
    // そのまま結果を送れば完了になる
    expect((await postReport(t, sampleReport(body.requestId, 1))).status).toBe(201);
  });

  it("viewer のトークンは 403、チャンネル未連携は 409、画面と合算で11件目は 429", async () => {
    const t = await skillTenant("scr-skill-req-perm");
    const viewer = await addMember(t.owner, "viewer");
    const viewerToken = await (async () => {
      const r = await call("/api/skill-tokens", {
        method: "POST",
        cookie: viewer.cookie,
        body: { name: "閲覧PC" },
      });
      return r.status === 201 ? ((await r.json()) as { token: string }).token : null;
    })();
    if (viewerToken)
      await expectError(
        await skill("/api/skill/requests", viewerToken, { method: "POST", body: {} }),
        403,
        "FORBIDDEN",
      );

    // 発行後に viewer へ降格した editor のトークンも、呼出し時の役割で 403 になる
    const editor = await addMember(t.owner, "editor");
    const editorToken = await issueToken(editor);
    await env.DB.prepare(
      "UPDATE tenant_members SET role = 'viewer' WHERE tenant_id = ?1 AND user_id = ?2",
    )
      .bind(t.owner.tenantId, editor.userId)
      .run();
    await expectError(
      await skill("/api/skill/requests", editorToken, { method: "POST", body: {} }),
      403,
      "FORBIDDEN",
    );

    const owner = await newOwner("scr-skill-nochan");
    const r = await call("/api/skill-tokens", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "PC" },
    });
    const token = ((await r.json()) as { token: string }).token;
    await expectError(
      await skill("/api/skill/requests", token, { method: "POST", body: {} }),
      409,
      "CHANNEL_NOT_CONNECTED",
    );
    await connectChannel(owner);

    for (let i = 0; i < 5; i++) await createRequest(t.owner);
    for (let i = 0; i < 5; i++)
      expect(
        (await skill("/api/skill/requests", t.token, { method: "POST", body: {} })).status,
      ).toBe(201);
    await expectError(
      await skill("/api/skill/requests", t.token, { method: "POST", body: {} }),
      429,
      "RATE_LIMITED",
    );
  });
});
