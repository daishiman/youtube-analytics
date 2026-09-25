// スキル連携 API（/api/skill/*）: Bearer 認証・テナント境界・export（source/履歴5版/初回）・進捗報告
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addMember, call, expectError } from "../platform/helpers";
import { SKILL_ROUTES } from "../platform/routes";
import {
  completeOneVersion,
  connectChannel,
  createRequest,
  issueToken,
  postReport,
  REPORT_FIXTURE,
  sampleReport,
  seedExportRows,
  skill,
  skillTenant,
} from "./helpers";

type ExportBody = {
  api_version: string;
  request: { request_id: string; status: string };
  channel: { channel_id: string };
  next_version: number;
  idempotency_key: string;
  rows: { source: string; metric: string; period: string }[];
  targets: unknown[];
  analysis_history: {
    version: number;
    request_id: string;
    candidate: unknown;
    hypotheses: unknown[];
    downstream: unknown;
  }[];
  action_effects: { stage: string; metric: string }[];
};

const exportOf = (token: string, requestId: string) =>
  skill(`/api/skill/export?request_id=${encodeURIComponent(requestId)}`, token);

describe("Bearer 個人トークン（受入8）", () => {
  it.each(SKILL_ROUTES)("$method $path はトークン無しで 401", async ({ method, path }) => {
    const res = await skill(path.replace(":id", "A-0001"), null, {
      method,
      body: method === "GET" ? undefined : {},
    });
    await expectError(res, 401, "UNAUTHENTICATED");
  });

  it("無い・形式違い・失効済み・未知のトークンは 401", async () => {
    const t = await skillTenant("sk-auth");
    const requestId = await createRequest(t.owner);
    await expectError(await exportOf("", requestId), 401, "UNAUTHENTICATED");
    await expectError(
      await skill(`/api/skill/export?request_id=${requestId}`, "abc"),
      401,
      "UNAUTHENTICATED",
    );
    await expectError(await exportOf(`yta_${"x".repeat(30)}`, requestId), 401, "UNAUTHENTICATED");

    const list = (await (await call("/api/skill-tokens", { cookie: t.owner.cookie })).json()) as {
      tokens: { token_id: string }[];
    };
    const tokenId = list.tokens[0]?.token_id ?? "";
    expect(
      (await call(`/api/skill-tokens/${tokenId}`, { method: "DELETE", cookie: t.owner.cookie }))
        .status,
    ).toBe(204);
    await expectError(await exportOf(t.token, requestId), 401, "UNAUTHENTICATED");
  });

  it("他テナントのトークンでは依頼を export できない（404）", async () => {
    const a = await skillTenant("sk-ten-a");
    const b = await skillTenant("sk-ten-b");
    const requestId = await createRequest(a.owner);
    // 同じ A-0001 でも B のテナントにある依頼しか見ない
    const res = await exportOf(b.token, requestId);
    await expectError(res, 404, "NOT_FOUND");
    await expectError(
      await skill(`/api/skill/requests/${requestId}`, b.token, {
        method: "PATCH",
        body: { progress: 10 },
      }),
      404,
      "NOT_FOUND",
    );
    // 自テナントのトークンなら通る
    expect((await exportOf(a.token, requestId)).status).toBe(200);
  });

  it("未対応の X-Skill-Api-Version は 400、応答には対応版を返す", async () => {
    const t = await skillTenant("sk-ver");
    const requestId = await createRequest(t.owner);
    const bad = await skill(`/api/skill/export?request_id=${requestId}`, t.token, {
      headers: { "x-skill-api-version": "2" },
    });
    await expectError(bad, 400, "VALIDATION_FAILED");
    const ok = await exportOf(t.token, requestId);
    expect(ok.headers.get("x-skill-api-version")).toBe("1");
  });

  it("viewer はトークンを発行できず、viewer へ降格した人のトークンは export だけ・書込みは 403", async () => {
    const t = await skillTenant("sk-viewer");
    const viewer = await addMember(t.owner, "viewer");
    const denied = await call("/api/skill-tokens", {
      method: "POST",
      cookie: viewer.cookie,
      body: { name: "x" },
    });
    await expectError(denied, 403, "FORBIDDEN");

    const editor = await addMember(t.owner, "editor");
    const editorToken = await issueToken(editor);
    // 役割は発行時ではなく呼出し時のメンバー情報で判定する
    await env.DB.prepare(
      "UPDATE tenant_members SET role = 'viewer' WHERE tenant_id = ?1 AND user_id = ?2",
    )
      .bind(t.owner.tenantId, editor.userId)
      .run();
    const requestId = await createRequest(t.owner);
    expect((await exportOf(editorToken, requestId)).status).toBe(200);
    await expectError(
      await skill(`/api/skill/requests/${requestId}`, editorToken, {
        method: "PATCH",
        body: { progress: 5 },
      }),
      403,
      "FORBIDDEN",
    );
    await expectError(
      await postReport({ ...t, token: editorToken }, sampleReport(requestId, 1)),
      403,
      "FORBIDDEN",
    );
  });

  it("セッション cookie では /api/skill/* を呼べない", async () => {
    const t = await skillTenant("sk-cookie");
    const requestId = await createRequest(t.owner);
    await expectError(
      await call(`/api/skill/export?request_id=${requestId}`, { cookie: t.owner.cookie }),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("メンバーから外れた人のトークンは使えない", async () => {
    const t = await skillTenant("sk-removed");
    const editor = await addMember(t.owner, "editor");
    const editorToken = await issueToken(editor);
    const requestId = await createRequest(t.owner);
    expect((await exportOf(editorToken, requestId)).status).toBe(200);
    await env.DB.prepare("DELETE FROM tenant_members WHERE tenant_id = ?1 AND user_id = ?2")
      .bind(t.owner.tenantId, editor.userId)
      .run();
    await expectError(await exportOf(editorToken, requestId), 401, "UNAUTHENTICATED");
  });
});

describe("export（受入9・3・4・5）", () => {
  it("各行が source（api|studio_csv|business_csv）を持ち、期間外・他チャンネルの行は含まない", async () => {
    const t = await skillTenant("sk-src");
    await seedExportRows(t.owner.tenantId, t.channelId, [
      { source: "api", period: "2026-08-03", metric: "impressions", value: 12000 },
      {
        source: "studio_csv",
        period: "2026-08-03",
        video_id: "vid_000001",
        metric: "ctr",
        value: 0.038,
      },
      { source: "business_csv", period: "2026-08-10", metric: "inquiries", value: 3 },
      { source: "api", period: "2026-07-01", metric: "impressions", value: 1 },
    ]);
    await seedExportRows(t.owner.tenantId, "UC_other_channel", [
      { source: "api", period: "2026-08-03", metric: "impressions", value: 999 },
    ]);
    const requestId = await createRequest(t.owner);
    const res = await exportOf(t.token, requestId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExportBody;
    expect(body.api_version).toBe("1");
    expect(body.channel.channel_id).toBe(t.channelId);
    expect(body.rows).toHaveLength(3);
    for (const row of body.rows)
      expect(["api", "studio_csv", "business_csv"]).toContain(row.source);
    expect(
      body.rows.map((r) => r.period).every((p) => p >= "2026-08-01" && p <= "2026-08-28"),
    ).toBe(true);
  });

  it("履歴0件でも初回分析として export でき、版1・キー request_id:v1 を返す", async () => {
    const t = await skillTenant("sk-first");
    const requestId = await createRequest(t.owner);
    const body = (await (await exportOf(t.token, requestId)).json()) as ExportBody;
    expect(body.analysis_history).toEqual([]);
    expect(body.action_effects).toEqual([]);
    expect(body.next_version).toBe(1);
    expect(body.idempotency_key).toBe(`${requestId}:v1`);
    const res = await postReport(t, sampleReport(requestId, 1));
    expect(res.status).toBe(201);
  });

  it("同じテナント・チャンネルの完了済み直近5版だけを新しい順に返す（他テナントは混ざらない）", async () => {
    const t = await skillTenant("sk-hist");
    const other = await skillTenant("sk-hist-other");
    await completeOneVersion(other, 1);
    for (let v = 1; v <= 6; v++) await completeOneVersion(t, v);
    // 失敗した依頼は履歴にならない
    const failed = await createRequest(t.owner);
    await skill(`/api/skill/requests/${failed}`, t.token, {
      method: "PATCH",
      body: { status: "失敗", error: "取得に失敗" },
    });
    const requestId = await createRequest(t.owner);
    const body = (await (await exportOf(t.token, requestId)).json()) as ExportBody;
    expect(body.analysis_history.map((h) => h.version)).toEqual([6, 5, 4, 3, 2]);
    expect(body.next_version).toBe(7);
    const h = body.analysis_history[0];
    expect(h?.candidate).toEqual({ stage: "流入", metric: "ctr" });
    expect(h?.hypotheses).toEqual([
      { hypothesis_id: "H1", title: expect.any(String), verdict: "採用" },
      { hypothesis_id: "H2", title: expect.any(String), verdict: "棄却" },
    ]);
    expect(h?.downstream).toEqual(REPORT_FIXTURE.results.downstream);
    expect(JSON.stringify(body)).not.toContain("<html");
  });

  it("アーカイブした版は analysis_history から外れ、戻すと再び入る", async () => {
    const t = await skillTenant("sk-hist-arch");
    await completeOneVersion(t, 1);
    const { reportId } = await completeOneVersion(t, 2);
    await completeOneVersion(t, 3);
    const archive = (method: "PUT" | "DELETE") =>
      call(`/api/reports/${reportId}/archive`, { method, cookie: t.owner.cookie });
    const history = async () => {
      const requestId = await createRequest(t.owner);
      const body = (await (await exportOf(t.token, requestId)).json()) as ExportBody;
      return body.analysis_history.map((h) => h.version);
    };
    expect((await archive("PUT")).status).toBe(200);
    expect(await history()).toEqual([3, 1]);
    expect((await archive("DELETE")).status).toBe(200);
    expect(await history()).toEqual([3, 2, 1]);
  });

  it("改善アクションの効果比較は対象ファネル段と指標・下流結果を持つ（受入5）", async () => {
    const t = await skillTenant("sk-effect");
    const { reportId } = await completeOneVersion(t, 1);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO actions (tenant_id, action_id, channel_id, report_id, title, stage, metric,
         baseline_value, target_value, result_value, status, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'サムネイル差替', '流入', 'ctr', 0.038, 0.05, 0.043, '効果測定中', ?5, ?6, ?6)`,
    )
      .bind(t.owner.tenantId, crypto.randomUUID(), t.channelId, reportId, t.owner.userId, now)
      .run();
    const requestId = await createRequest(t.owner);
    const body = (await (await exportOf(t.token, requestId)).json()) as ExportBody;
    expect(body.action_effects).toEqual([
      expect.objectContaining({
        stage: "流入",
        metric: "ctr",
        baseline_value: 0.038,
        result_value: 0.043,
      }),
    ]);
    expect(body.analysis_history[0]).toMatchObject({
      actions: [expect.objectContaining({ stage: "流入", baseline: 0.038, result: 0.043 })],
      // 同じ版の下流結果（問い合わせ・成約）と並べて比べられる
      downstream: REPORT_FIXTURE.results.downstream,
    });
  });

  it("request_id 無し・完了済みの依頼は export できない", async () => {
    const t = await skillTenant("sk-exp-err");
    await expectError(await skill("/api/skill/export", t.token), 400, "VALIDATION_FAILED");
    const { requestId } = await completeOneVersion(t, 1);
    await expectError(await exportOf(t.token, requestId), 409, "REQUEST_STATE_CONFLICT");
  });

  it("依頼後に連携チャンネルが変わっていたら export しない", async () => {
    const t = await skillTenant("sk-chan-change");
    const requestId = await createRequest(t.owner);
    await env.DB.prepare("DELETE FROM channels WHERE tenant_id = ?1").bind(t.owner.tenantId).run();
    await connectChannel(t.owner);
    await expectError(await exportOf(t.token, requestId), 409, "CHANNEL_NOT_CONNECTED");
  });
});

describe("PATCH /api/skill/requests/:id（進捗の報告）", () => {
  it("待機中 → 実行中（進捗・段階）→ 失敗 の一方向で、終端後は 409", async () => {
    const t = await skillTenant("sk-patch");
    const requestId = await createRequest(t.owner);
    const running = await skill(`/api/skill/requests/${requestId}`, t.token, {
      method: "PATCH",
      body: { progress: 40, stage: 2 },
    });
    expect(running.status).toBe(200);
    expect(await running.json()).toMatchObject({ status: "実行中", progress: 40, stage: 2 });

    const failed = await skill(`/api/skill/requests/${requestId}`, t.token, {
      method: "PATCH",
      body: { status: "失敗", error: "YouTube API の上限に達しました" },
    });
    expect(await failed.json()).toMatchObject({
      status: "失敗",
      error: "YouTube API の上限に達しました",
    });
    await expectError(
      await skill(`/api/skill/requests/${requestId}`, t.token, {
        method: "PATCH",
        body: { progress: 50 },
      }),
      409,
      "REQUEST_STATE_CONFLICT",
    );
  });

  it.each([
    [{ progress: 101 }],
    [{ progress: 1.5 }],
    [{ stage: 4 }],
    [{ status: "完了" }],
    [{ status: "失敗" }],
    [{ error: "x".repeat(501) }],
  ])("誤った報告は 400（%j）", async (body) => {
    const t = await skillTenant("sk-patch-bad");
    const requestId = await createRequest(t.owner);
    await expectError(
      await skill(`/api/skill/requests/${requestId}`, t.token, { method: "PATCH", body }),
      400,
      "VALIDATION_FAILED",
    );
  });
});
