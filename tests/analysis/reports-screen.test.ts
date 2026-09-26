// AI分析画面のレポート API: 一覧（検索・アーカイブ・ページング）・詳細・版の比較・JSON取込・アクション登録
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { REPORT_BODY_MAX_BYTES } from "../../src/domain/analysis";
import { REPORT_HTML_MAX_BYTES } from "../../src/domain/report-schema";
import { REPORT_SEARCH_WINDOW } from "../../src/repositories/skill-analysis-repository";
import {
  addMember,
  auditCount,
  call,
  count,
  expectError,
  json,
  type Owner,
} from "../platform/helpers";
import {
  COMMENT_INSIGHTS,
  completeOneVersion,
  createRequest,
  REPORT_FIXTURE,
  sampleReport,
  skillTenant,
} from "../skill-analysis/helpers";

type ListBody = {
  items: { reportId: string; version: number; title: string; archived: boolean }[];
  nextCursor: string | null;
};

type Detail = {
  reportId: string;
  version: number;
  isLatest: boolean;
  archived: boolean;
  createdVia: string | null;
  candidate: { stage: string; metric: string } | null;
  findings: { kind: string; title: string }[];
  psych: unknown[];
  emotions: unknown[];
  actions: {
    key: string;
    title: string;
    primary: boolean;
    registered: { actionId: string; status: string } | null;
  }[];
  versions: { version: number; reportId: string }[];
  reportHtml: string;
};

const twoActions = {
  actions: [
    {
      title: "投稿時刻を揃える",
      stage: "露出",
      metric: "impressions",
      baseline_value: 1,
      target_value: 2,
    },
    {
      title: "サムネイルを差し替える",
      stage: "流入",
      metric: "ctr",
      baseline_value: 0.038,
      target_value: 0.05,
    },
  ],
};

describe("レポート一覧", () => {
  it("新しい版から並べ、名前・要約で部分一致検索できる（% と _ は文字として扱う）", async () => {
    const t = await skillTenant("rep-list");
    await completeOneVersion(t, 1, { title: "7月の振り返り" });
    await completeOneVersion(t, 2, { title: "CTR 100% 達成の週" });
    await completeOneVersion(t, 3, { title: "8月_週次" });
    const viewer = await addMember(t.owner, "viewer");
    const all = await json<ListBody>(await call("/api/reports", { cookie: viewer.cookie }));
    expect(all.items.map((r) => r.version)).toEqual([3, 2, 1]);
    const hit = await json<ListBody>(
      await call(`/api/reports?q=${encodeURIComponent("100%")}`, { cookie: viewer.cookie }),
    );
    expect(hit.items.map((r) => r.version)).toEqual([2]);
    const underscore = await json<ListBody>(
      await call(`/api/reports?q=${encodeURIComponent("_")}`, { cookie: viewer.cookie }),
    );
    expect(underscore.items.map((r) => r.version)).toEqual([3]);
    await expectError(
      await call(`/api/reports?q=${"あ".repeat(101)}`, { cookie: viewer.cookie }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("他テナントのレポートは出ない・開けない", async () => {
    const t = await skillTenant("rep-iso");
    const other = await skillTenant("rep-iso-other");
    const { reportId } = await completeOneVersion(other, 1);
    const list = await json<ListBody>(await call("/api/reports", { cookie: t.owner.cookie }));
    expect(list.items).toEqual([]);
    await expectError(
      await call(`/api/reports/${reportId}`, { cookie: t.owner.cookie }),
      404,
      "NOT_FOUND",
    );
  });

  it("50件ずつ返し、cursor で続きを取れる", async () => {
    const t = await skillTenant("rep-page");
    await insertBareReports(t.owner, t.channelId, versionsUpTo(52));
    const first = await json<ListBody>(await call("/api/reports", { cookie: t.owner.cookie }));
    expect(first.items).toHaveLength(50);
    expect(first.items[0]?.version).toBe(52);
    const second = await json<ListBody>(
      await call(`/api/reports?cursor=${first.nextCursor}`, { cookie: t.owner.cookie }),
    );
    expect(second.items.map((r) => r.version)).toEqual([2, 1]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("アーカイブ", () => {
  it("アーカイブした版は既定の一覧から消え、archived=1 で見える。版の行は変わらない", async () => {
    const t = await skillTenant("rep-arch");
    const { reportId } = await completeOneVersion(t, 1);
    await completeOneVersion(t, 2);
    const editor = await addMember(t.owner, "editor");
    const put = await call(`/api/reports/${reportId}/archive`, {
      method: "PUT",
      cookie: editor.cookie,
    });
    expect(put.status).toBe(200);
    // 2回目も成功（冪等）
    expect(
      (await call(`/api/reports/${reportId}/archive`, { method: "PUT", cookie: editor.cookie }))
        .status,
    ).toBe(200);
    const list = await json<ListBody>(await call("/api/reports", { cookie: editor.cookie }));
    expect(list.items.map((r) => r.version)).toEqual([2]);
    const withArchived = await json<ListBody>(
      await call("/api/reports?archived=1", { cookie: editor.cookie }),
    );
    expect(withArchived.items.map((r) => [r.version, r.archived])).toEqual([
      [2, false],
      [1, true],
    ]);
    expect(
      await count("SELECT COUNT(*) AS n FROM reports WHERE tenant_id = ?1", t.owner.tenantId),
    ).toBe(2);
    expect(await auditCount(t.owner.tenantId, "report.archive")).toBe(2);

    const del = await call(`/api/reports/${reportId}/archive`, {
      method: "DELETE",
      cookie: editor.cookie,
    });
    expect(del.status).toBe(200);
    const back = await json<ListBody>(await call("/api/reports", { cookie: editor.cookie }));
    expect(back.items.map((r) => r.version)).toEqual([2, 1]);
  });

  it("viewer は 403・無い版は 404", async () => {
    const t = await skillTenant("rep-arch-perm");
    const { reportId } = await completeOneVersion(t, 1);
    const viewer = await addMember(t.owner, "viewer");
    await expectError(
      await call(`/api/reports/${reportId}/archive`, { method: "PUT", cookie: viewer.cookie }),
      403,
      "FORBIDDEN",
    );
    await expectError(
      await call(`/api/reports/${crypto.randomUUID()}/archive`, {
        method: "PUT",
        cookie: t.owner.cookie,
      }),
      404,
      "NOT_FOUND",
    );
  });
});

describe("レポート詳細", () => {
  it("本文・発見・アクション（主対象付き）・版一覧を返し、version で別の版を開ける", async () => {
    const t = await skillTenant("rep-detail");
    const v1 = await completeOneVersion(t, 1);
    const v2 = await completeOneVersion(t, 2, { ...twoActions, ...COMMENT_INSIGHTS });
    const viewer = await addMember(t.owner, "viewer");
    const res = await call(`/api/reports/${v2.reportId}`, { cookie: viewer.cookie });
    expect(res.status).toBe(200);
    const d = await json<Detail>(res);
    expect(d.version).toBe(2);
    expect(d.isLatest).toBe(true);
    expect(d.createdVia).toBe("web");
    expect(d.candidate).toEqual({ stage: "流入", metric: "ctr" });
    expect(d.findings.map((f) => f.kind)).toEqual([
      "factor",
      "factor",
      "factor",
      "hypothesis",
      "hypothesis",
    ]);
    expect(d.psych).toHaveLength(1);
    expect(d.emotions).toHaveLength(1);
    // 主対象は改善候補（流入/ctr）に一致する2番目
    expect(d.actions.map((a) => [a.key, a.primary, a.registered])).toEqual([
      ["a1", false, null],
      ["a2", true, null],
    ]);
    expect(d.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(d.reportHtml).toContain("<h1>");

    const old = await json<Detail>(
      await call(`/api/reports/${v2.reportId}?version=1`, { cookie: viewer.cookie }),
    );
    expect(old.reportId).toBe(v1.reportId);
    expect(old.isLatest).toBe(false);
    await expectError(
      await call(`/api/reports/${v2.reportId}?version=9`, { cookie: viewer.cookie }),
      404,
      "NOT_FOUND",
    );
  });

  it("版一覧は同じチャンネルの版を件数で切らずに返す（他チャンネルの新しい版が多くても欠けない）", async () => {
    const t = await skillTenant("rep-versions");
    await completeOneVersion(t, 1);
    const v2 = await completeOneVersion(t, 2);
    await insertBareReports(
      t.owner,
      "UC_other",
      versionsUpTo(REPORT_SEARCH_WINDOW + 1),
      () => "2999-01-01T00:00:00.000Z",
    );
    const d = await json<Detail>(
      await call(`/api/reports/${v2.reportId}`, { cookie: t.owner.cookie }),
    );
    expect(d.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(d.isLatest).toBe(true);
  });
});

describe("版の比較", () => {
  it("要点の変化と、発見・アクションの増減を返す", async () => {
    const t = await skillTenant("rep-diff");
    const a = await completeOneVersion(t, 1);
    const b = await completeOneVersion(t, 2, {
      summary: "露出段の表示回数が目標を下回りました。",
      ...twoActions,
    });
    const res = await call(`/api/reports/diff?a=${a.reportId}&b=${b.reportId}`, {
      cookie: t.owner.cookie,
    });
    expect(res.status).toBe(200);
    const d = await json<{
      changed: Record<string, boolean>;
      actions: { added: string[]; removed: string[] };
      findings: { added: string[]; removed: string[] };
    }>(res);
    expect(d.changed.summary).toBe(true);
    expect(d.changed.title).toBe(true);
    expect(d.changed.candidate).toBe(false);
    expect(d.actions).toEqual({
      added: ["投稿時刻を揃える", "サムネイルを差し替える"],
      removed: [REPORT_FIXTURE.actions[0]?.title],
    });
    expect(d.findings).toEqual({ added: [], removed: [] });
  });

  it("同じ版・片方欠け・他テナントの版はエラー", async () => {
    const t = await skillTenant("rep-diff-bad");
    const other = await skillTenant("rep-diff-other");
    const a = await completeOneVersion(t, 1);
    const x = await completeOneVersion(other, 1);
    const get = (q: string) => call(`/api/reports/diff?${q}`, { cookie: t.owner.cookie });
    await expectError(await get(`a=${a.reportId}&b=${a.reportId}`), 400, "VALIDATION_FAILED");
    await expectError(await get(`a=${a.reportId}`), 400, "VALIDATION_FAILED");
    await expectError(await get(`a=${a.reportId}&b=${x.reportId}`), 404, "NOT_FOUND");
  });
});

describe("結果JSONの取込", () => {
  const importJson = (cookie: string, body: unknown) =>
    call("/api/reports/import", { method: "POST", cookie, body });

  it("request_id 無しなら完了済みの依頼を作って取り込む（created_via=import）", async () => {
    const t = await skillTenant("rep-import");
    const editor = await addMember(t.owner, "editor");
    const report = sampleReport("", 1);
    delete report.request_id;
    const res = await importJson(editor.cookie, {
      ...report,
      period_start: "2026-08-01",
      period_end: "2026-08-14",
    });
    expect(res.status).toBe(201);
    const body = await json<{ reportId: string; requestId: string; requestCreated: boolean }>(res);
    expect(body.requestCreated).toBe(true);
    const req = await env.DB.prepare(
      "SELECT status, created_via, period_start, period_end FROM analysis_requests WHERE tenant_id = ?1 AND request_id = ?2",
    )
      .bind(t.owner.tenantId, body.requestId)
      .first();
    expect(req).toEqual({
      status: "完了",
      created_via: "import",
      period_start: "2026-08-01",
      period_end: "2026-08-14",
    });
    expect(await auditCount(t.owner.tenantId, "analysis.import")).toBe(1);
    const d = await json<Detail>(
      await call(`/api/reports/${body.reportId}`, { cookie: editor.cookie }),
    );
    expect(d.createdVia).toBe("import");
  });

  it("request_id 付きならその依頼を完了にし、同じ内容の再取込は 200 で版を増やさない", async () => {
    const t = await skillTenant("rep-import-req");
    const requestId = await createRequest(t.owner);
    const report = sampleReport(requestId, 1);
    const first = await importJson(t.owner.cookie, report);
    expect(first.status).toBe(201);
    expect((await json<{ requestCreated: boolean }>(first)).requestCreated).toBe(false);
    expect((await importJson(t.owner.cookie, report)).status).toBe(200);
    expect(
      await count("SELECT COUNT(*) AS n FROM reports WHERE tenant_id = ?1", t.owner.tenantId),
    ).toBe(1);
  });

  it("形式・版番号の誤りは保存せず、依頼も残さない", async () => {
    const t = await skillTenant("rep-import-bad");
    const bad = sampleReport("", 1, { conclusion: "サムネイル変更が原因で再生が増えた" });
    delete bad.request_id;
    await expectError(await importJson(t.owner.cookie, bad), 422, "INVALID_REPORT_JSON");
    const conflict = sampleReport("", 5);
    delete conflict.request_id;
    await expectError(await importJson(t.owner.cookie, conflict), 409, "REPORT_VERSION_CONFLICT");
    const broken = await call("/api/reports/import", {
      method: "POST",
      cookie: t.owner.cookie,
      rawBody: '{\n  "version": 1,,\n}',
      headers: { "content-type": "application/json" },
    });
    expect(broken.status).toBe(422);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM analysis_requests WHERE tenant_id = ?1",
        t.owner.tenantId,
      ),
    ).toBe(0);
  });

  it("viewer は 403、上限を超える本文は 413、上限を超える HTML は 422", async () => {
    const t = await skillTenant("rep-import-perm");
    const viewer = await addMember(t.owner, "viewer");
    const report = sampleReport("", 1);
    delete report.request_id;
    await expectError(await importJson(viewer.cookie, report), 403, "FORBIDDEN");
    await expectError(
      await importJson(t.owner.cookie, {
        ...report,
        report_html: "x".repeat(REPORT_BODY_MAX_BYTES),
      }),
      413,
      "PAYLOAD_TOO_LARGE",
    );
    await expectError(
      await importJson(t.owner.cookie, {
        ...report,
        report_html: "x".repeat(REPORT_HTML_MAX_BYTES + 1),
      }),
      422,
      "INVALID_REPORT_JSON",
    );
  });
});

describe("アクション登録", () => {
  it("選んだアクションだけを登録し、同じ版・同じキーは二重登録しない", async () => {
    const t = await skillTenant("rep-act");
    const { reportId } = await completeOneVersion(t, 1, twoActions);
    const editor = await addMember(t.owner, "editor");
    const reg = (keys: unknown) =>
      call(`/api/reports/${reportId}/actions`, {
        method: "POST",
        cookie: editor.cookie,
        body: { keys },
      });
    const res = await reg(["a2"]);
    expect(res.status).toBe(201);
    const body = await json<{
      created: string[];
      alreadyRegistered: string[];
      actions: { key: string; title: string; status: string }[];
    }>(res);
    expect(body.created).toEqual(["a2"]);
    expect(body.actions).toEqual([
      expect.objectContaining({ key: "a2", title: "サムネイルを差し替える", status: "未着手" }),
    ]);
    const again = await json<{ created: string[]; alreadyRegistered: string[] }>(
      await reg(["a2", "a1", "a1"]),
    );
    expect(again.created).toEqual(["a1"]);
    expect(again.alreadyRegistered).toEqual(["a2"]);
    expect(
      await count("SELECT COUNT(*) AS n FROM actions WHERE tenant_id = ?1", t.owner.tenantId),
    ).toBe(2);
    const d = await json<Detail>(await call(`/api/reports/${reportId}`, { cookie: editor.cookie }));
    expect(d.actions.every((a) => a.registered !== null)).toBe(true);
    expect(await auditCount(t.owner.tenantId, "report.actions")).toBe(2);
  });

  it("空・範囲外・形式違いのキーは 400、viewer は 403", async () => {
    const t = await skillTenant("rep-act-bad");
    const { reportId } = await completeOneVersion(t, 1);
    const viewer = await addMember(t.owner, "viewer");
    const reg = (cookie: string, keys: unknown) =>
      call(`/api/reports/${reportId}/actions`, { method: "POST", cookie, body: { keys } });
    for (const keys of [[], ["a2"], ["x1"], "a1", [1]])
      await expectError(await reg(t.owner.cookie, keys), 400, "VALIDATION_FAILED");
    await expectError(await reg(viewer.cookie, ["a1"]), 403, "FORBIDDEN");
    expect(
      await count("SELECT COUNT(*) AS n FROM actions WHERE tenant_id = ?1", t.owner.tenantId),
    ).toBe(0);
  });
});

const versionsUpTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** 結果 JSON を通さず版だけを直接用意する（1分10件のレート制限を避ける）。依頼と版を1回の batch で入れる */
async function insertBareReports(
  owner: Owner,
  channelId: string,
  versions: number[],
  createdAt = (v: number) => `2026-09-01T00:00:${String(v % 60).padStart(2, "0")}.000Z`,
) {
  await env.DB.batch(
    versions.flatMap((v) => {
      const requestId = `A-${String(9000 + v)}`;
      const now = createdAt(v);
      return [
        env.DB.prepare(
          `INSERT INTO analysis_requests (tenant_id, request_id, channel_id, period_start, period_end,
             instruction, status, progress, stage, created_by, created_at, updated_at)
           VALUES (?1, ?2, ?3, '2026-08-01', '2026-08-02', '', '完了', 100, 3, ?4, ?5, ?5)`,
        ).bind(owner.tenantId, requestId, channelId, owner.userId, now),
        env.DB.prepare(
          `INSERT INTO reports (tenant_id, report_id, channel_id, request_id, version, title, summary,
             conclusion, outcome, period_start, period_end, brief_json, results_json, history_review_json,
             ideas_json, actions_json, history_versions_used, report_html, idempotency_key, created_by, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, '要約', '結論', '改善候補あり', '2026-08-01', '2026-08-02',
             '{}', '{}', '{}', '[]', '[]', '[]', '<p></p>', ?7, ?8, ?9)`,
        ).bind(
          owner.tenantId,
          crypto.randomUUID(),
          channelId,
          requestId,
          v,
          `版${v}`,
          `${requestId}:v${v}`,
          owner.userId,
          now,
        ),
      ];
    }),
  );
}
