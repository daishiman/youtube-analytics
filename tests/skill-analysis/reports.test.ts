// POST /api/skill/reports（受入6・7・11・3）と transcripts / media
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { auditCount, count, expectError } from "../platform/helpers";
import {
  COMMENT_INSIGHTS,
  completeOneVersion,
  createRequest,
  historyReview,
  postReport,
  sampleReport,
  sampleResults,
  skill,
  skillTenant,
} from "./helpers";

describe("結果の反映", () => {
  it("版を追記して依頼を完了にし、findings・心理・感情を保存する", async () => {
    const t = await skillTenant("rp-save");
    const requestId = await createRequest(t.owner);
    const res = await postReport(t, sampleReport(requestId, 1, COMMENT_INSIGHTS));
    expect(res.status).toBe(201);
    const { reportId, version } = (await res.json()) as { reportId: string; version: number };
    expect(version).toBe(1);

    const req = await env.DB.prepare(
      "SELECT status, progress, stage, report_id FROM analysis_requests WHERE tenant_id = ?1 AND request_id = ?2",
    )
      .bind(t.owner.tenantId, requestId)
      .first();
    expect(req).toEqual({ status: "完了", progress: 100, stage: 3, report_id: reportId });

    const findings = await env.DB.prepare(
      "SELECT kind, fact, interpretation, falsifier, verdict FROM findings WHERE tenant_id = ?1 AND report_id = ?2 ORDER BY finding_no",
    )
      .bind(t.owner.tenantId, reportId)
      .all();
    // 受入11: 要因は事実と解釈を分け、仮説は反証条件と判定を持つ
    const factor = {
      kind: "factor",
      fact: expect.any(String),
      interpretation: expect.any(String),
      falsifier: null,
      verdict: null,
    };
    const hypothesis = (verdict: string) => ({
      kind: "hypothesis",
      fact: null,
      interpretation: null,
      falsifier: expect.any(String),
      verdict,
    });
    expect(findings.results).toEqual([
      factor,
      factor,
      factor,
      hypothesis("採用"),
      hypothesis("棄却"),
    ]);
    expect(
      await count("SELECT COUNT(*) AS n FROM psych_findings WHERE report_id = ?1", reportId),
    ).toBe(1);
    expect(
      await count("SELECT COUNT(*) AS n FROM comment_emotions WHERE report_id = ?1", reportId),
    ).toBe(1);
    expect(await auditCount(t.owner.tenantId, "analysis.report")).toBe(1);
  });

  it("同じ Idempotency-Key の二重送信で版が増えない（受入6）", async () => {
    const t = await skillTenant("rp-idem");
    const requestId = await createRequest(t.owner);
    const report = sampleReport(requestId, 1);
    const [a, b] = await Promise.all([postReport(t, report), postReport(t, report)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 201]);
    const again = await postReport(t, report);
    expect(again.status).toBe(200);
    const ids = new Set(
      await Promise.all(
        [a, b, again].map(async (r) => ((await r.json()) as { reportId: string }).reportId),
      ),
    );
    expect(ids.size).toBe(1);
    expect(
      await count("SELECT COUNT(*) AS n FROM reports WHERE tenant_id = ?1", t.owner.tenantId),
    ).toBe(1);
  });

  it("Idempotency-Key が request_id:v版 と食い違えば 400", async () => {
    const t = await skillTenant("rp-key");
    const requestId = await createRequest(t.owner);
    await expectError(
      await postReport(t, sampleReport(requestId, 1), "other:v1"),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("最新でない版番号は 409 REPORT_VERSION_CONFLICT", async () => {
    const t = await skillTenant("rp-conflict");
    await completeOneVersion(t, 1);
    const requestId = await createRequest(t.owner);
    await expectError(
      await postReport(t, sampleReport(requestId, 3)),
      409,
      "REPORT_VERSION_CONFLICT",
    );
    // 別依頼で同じ版番号 1 も衝突
    await expectError(
      await postReport(t, sampleReport(requestId, 1)),
      409,
      "REPORT_VERSION_CONFLICT",
    );
    expect((await postReport(t, sampleReport(requestId, 2))).status).toBe(201);
  });

  it("過去の版は書き換えられない（受入7。削除はテナント削除の掃除だけが行う）", async () => {
    const t = await skillTenant("rp-append");
    const { reportId } = await completeOneVersion(t, 1);
    await expect(
      env.DB.prepare("UPDATE reports SET title = 'x' WHERE report_id = ?1").bind(reportId).run(),
    ).rejects.toThrow(/append-only/);
    await expect(
      env.DB.prepare("UPDATE findings SET title = 'x' WHERE report_id = ?1").bind(reportId).run(),
    ).rejects.toThrow(/append-only/);
  });

  it("参照した版番号を保存し、存在しない版の参照は 422（受入3）", async () => {
    const t = await skillTenant("rp-used");
    await completeOneVersion(t, 1);
    await completeOneVersion(t, 2);
    const requestId = await createRequest(t.owner);
    const bad = await postReport(
      t,
      sampleReport(requestId, 3, { history_review: historyReview([1, 2, 9]) }),
    );
    expect(bad.status).toBe(422);
    const ok = await postReport(
      t,
      sampleReport(requestId, 3, { history_review: historyReview([1, 2]) }),
    );
    expect(ok.status).toBe(201);
    const row = await env.DB.prepare(
      "SELECT history_versions_used, history_review_json FROM reports WHERE tenant_id = ?1 AND version = 3",
    )
      .bind(t.owner.tenantId)
      .first<{ history_versions_used: string; history_review_json: string }>();
    expect(JSON.parse(row?.history_versions_used ?? "")).toEqual([1, 2]);
    expect(JSON.parse(row?.history_review_json ?? "{}").previous_hypotheses).toHaveLength(2);
  });

  it.each([
    ["conclusion", "サムネイル変更が原因で再生が増えた"],
    ["summary", "投稿時間を変えたため増えた"],
  ])("因果を断定する文は 422（%s）", async (key, text) => {
    const t = await skillTenant("rp-causal");
    const requestId = await createRequest(t.owner);
    const res = await postReport(t, sampleReport(requestId, 1, { [key]: text }));
    await expectError(res, 422, "INVALID_REPORT_JSON");
  });

  it("全指標目標達成・判定保留も受ける（受入2）", async () => {
    const t = await skillTenant("rp-outcome");
    const r1 = await createRequest(t.owner);
    expect(
      (
        await postReport(
          t,
          sampleReport(r1, 1, {
            results: sampleResults({ status: "全指標目標達成", candidate: null }),
          }),
        )
      ).status,
    ).toBe(201);
    const r2 = await createRequest(t.owner);
    expect(
      (
        await postReport(
          t,
          sampleReport(r2, 2, {
            results: sampleResults({
              status: "判定保留",
              candidate: null,
              pending_reasons: [{ metric: "ctr", reason: "サンプル不足" }],
            }),
          }),
        )
      ).status,
    ).toBe(201);
  });

  it("構文の誤りは 422 と行番号、形の誤りは issues を返す", async () => {
    const t = await skillTenant("rp-syntax");
    const requestId = await createRequest(t.owner);
    const broken = `{\n  "request_id": "${requestId}",\n  "version": 1,\n  "title": "x",,\n}`;
    const res = await skill("/api/skill/reports", t.token, { method: "POST", raw: broken });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; line: number; message: string } };
    expect(body.error.code).toBe("INVALID_REPORT_JSON");
    expect(body.error.line).toBe(4);
    expect(body.error.message).toContain("4行目");

    const shape = await postReport(
      t,
      sampleReport(requestId, 1, { actions: [{ title: "x", stage: "露出", metric: "ctr" }] }),
    );
    const err = (await shape.json()) as { error: { issues: { path: string }[] } };
    expect(shape.status).toBe(422);
    expect(err.error.issues.map((i) => i.path)).toContain("actions[0].stage");
  });

  it("旧形（週次の行だけの funnel・first_analysis の無い history_review）は 422 で保存しない", async () => {
    const t = await skillTenant("rp-legacy");
    const requestId = await createRequest(t.owner);
    const legacy = sampleReport(requestId, 1, {
      results: {
        status: "改善候補あり",
        candidate: { stage: "流入", metric: "ctr", target_gap: -0.012 },
        funnel: [{ week: "2026-W35", impressions: 12000, ctr: 0.038 }],
        downstream: { inquiries: 3, contracts: 1 },
      },
      history_review: { versions_used: [], previous_hypotheses: [] },
    });
    const res = await postReport(t, legacy);
    expect(res.status).toBe(422);
    const err = (await res.json()) as { error: { code: string; issues: { path: string }[] } };
    expect(err.error.code).toBe("INVALID_REPORT_JSON");
    expect(err.error.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["results.funnel[0].metric", "history_review.first_analysis"]),
    );
    expect(
      await count("SELECT COUNT(*) AS n FROM reports WHERE tenant_id = ?1", t.owner.tenantId),
    ).toBe(0);
  });

  it("完了・失敗した依頼には送れない", async () => {
    const t = await skillTenant("rp-done");
    const { requestId } = await completeOneVersion(t, 1);
    await expectError(
      await postReport(t, sampleReport(requestId, 2)),
      409,
      "REQUEST_STATE_CONFLICT",
    );
  });
});

describe("文字起こし・画像", () => {
  it("文字起こしを保存し、同じ取得元の再送は置き換える", async () => {
    const t = await skillTenant("tr-save");
    const segs = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        start_ms: i * 1000,
        end_ms: i * 1000 + 900,
        text: `行${i}`,
      }));
    const post = (n: number, source = "srt") =>
      skill("/api/skill/transcripts", t.token, {
        method: "POST",
        body: { video_id: "vid_abc123", source, segments: segs(n) },
      });
    expect((await post(3)).status).toBe(201);
    expect((await post(2)).status).toBe(201);
    expect((await post(4, "whisper")).status).toBe(201);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM transcripts WHERE tenant_id = ?1 AND source = 'srt'",
        t.owner.tenantId,
      ),
    ).toBe(2);
    expect(
      await count("SELECT COUNT(*) AS n FROM transcripts WHERE tenant_id = ?1", t.owner.tenantId),
    ).toBe(6);
    await expectError(
      await skill("/api/skill/transcripts", t.token, {
        method: "POST",
        body: {
          video_id: "vid_abc123",
          source: "srt",
          segments: [{ start_ms: 5, end_ms: 1, text: "x" }],
        },
      }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("画像は R2 のテナント配下に置き、中身が形式と違えば 400・2MB 超は 413", async () => {
    const t = await skillTenant("md-save");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const res = await skill("/api/skill/media", t.token, {
      method: "POST",
      body: {
        video_id: "vid_abc123",
        kind: "thumbnail",
        content_type: "image/png",
        data_base64: b64(png),
        width: 320,
      },
    });
    expect(res.status).toBe(201);
    const { r2Key } = (await res.json()) as { r2Key: string };
    expect(r2Key.startsWith(`tenants/${t.owner.tenantId}/media/vid_abc123/`)).toBe(true);
    expect(await env.MEDIA.get(r2Key)).not.toBeNull();
    expect(
      await count("SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id = ?1", t.owner.tenantId),
    ).toBe(1);

    await expectError(
      await skill("/api/skill/media", t.token, {
        method: "POST",
        body: {
          video_id: "vid_abc123",
          kind: "thumbnail",
          content_type: "image/jpeg",
          data_base64: b64(png),
        },
      }),
      400,
      "VALIDATION_FAILED",
    );
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(png);
    let bin = "";
    for (let i = 0; i < big.length; i += 8192)
      bin += String.fromCharCode(...big.subarray(i, i + 8192));
    await expectError(
      await skill("/api/skill/media", t.token, {
        method: "POST",
        body: {
          video_id: "vid_abc123",
          kind: "scene",
          content_type: "image/png",
          data_base64: btoa(bin),
        },
      }),
      413,
      "PAYLOAD_TOO_LARGE",
    );
  });
});
