// 受入 7: データ取込（ファイルを R2 に置いて処理待ちで記録・形式違反は失敗理由付きで記録・履歴は最新20件）
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addMember, call, expectError, newOwner } from "../platform/helpers";
import { upload } from "./helpers";

type ImportRes = { importId: string; status: string; error: string | null };
type ImportRow = { import_id: string; file_name: string; status: string; error: string | null };

afterEach(() => vi.restoreAllMocks());

async function reserveDeletion(tenantId: string, userId: string, scope: "channel" | "tenant") {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO data_deletions (deletion_id, tenant_id, scope, requested_by, requested_at, due_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(crypto.randomUUID(), tenantId, scope, userId, now, now)
    .run();
}

describe("データ取込の受付", () => {
  it.each(["channel", "tenant"] as const)(
    "%s の削除予約中は原本も履歴も追加しない",
    async (scope) => {
      const owner = await newOwner(`imp-deleting-${scope}`);
      await reserveDeletion(owner.tenantId, owner.userId, scope);
      await expectError(
        await upload(owner, "csv", { name: "late.csv", body: "date,views\n2026-09-01,1" }),
        409,
        "IMPORT_DELETION_PENDING",
      );
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM imports WHERE tenant_id = ?1")
        .bind(owner.tenantId)
        .first<{ n: number }>();
      expect(row?.n).toBe(0);
      expect((await env.MEDIA.list({ prefix: `tenants/${owner.tenantId}/` })).objects).toHaveLength(
        0,
      );
    },
  );

  it("事前確認後に削除予約が入る競合でも DB が拒否し、R2 原本を回収する", async () => {
    const owner = await newOwner("imp-inflight");
    const originalPut = env.MEDIA.put.bind(env.MEDIA);
    vi.spyOn(env.MEDIA, "put").mockImplementationOnce(async (key, value, options) => {
      await reserveDeletion(owner.tenantId, owner.userId, "channel");
      return originalPut(key, value, options);
    });
    await expectError(
      await upload(owner, "csv", { name: "racing.csv", body: "date,views\n2026-09-01,1" }),
      409,
      "IMPORT_DELETION_PENDING",
    );
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM imports WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
    expect((await env.MEDIA.list({ prefix: `tenants/${owner.tenantId}/` })).objects).toHaveLength(
      0,
    );
  });

  it("アップロード中の削除予約が完了済みでも旧世代を拒否する", async () => {
    const owner = await newOwner("imp-generation");
    const originalPut = env.MEDIA.put.bind(env.MEDIA);
    vi.spyOn(env.MEDIA, "put").mockImplementationOnce(async (key, value, options) => {
      const active = await env.DB.prepare("SELECT r2_key FROM import_uploads WHERE tenant_id = ?1")
        .bind(owner.tenantId)
        .first<{ r2_key: string }>();
      expect(active?.r2_key).toBe(key);
      await reserveDeletion(owner.tenantId, owner.userId, "channel");
      await env.DB.prepare(
        "UPDATE data_deletions SET done_at = ?2 WHERE tenant_id = ?1 AND scope = 'channel'",
      )
        .bind(owner.tenantId, new Date().toISOString())
        .run();
      return originalPut(key, value, options);
    });
    await expectError(
      await upload(owner, "csv", { name: "old.csv", body: "date,views\n2026-09-01,1" }),
      409,
      "IMPORT_DELETION_PENDING",
    );
    const generation = await env.DB.prepare(
      "SELECT import_generation FROM tenants WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ import_generation: number }>();
    expect(generation?.import_generation).toBe(1);
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM imports WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
    expect(
      (await env.MEDIA.list({ prefix: `tenants/${owner.tenantId}/generations/g0/` })).objects,
    ).toHaveLength(0);
    const fresh = await upload(owner, "csv", { name: "new.csv", body: "date,views\n2026-09-02,2" });
    expect(fresh.status).toBe(201);
    const freshBody = (await fresh.json()) as ImportRes;
    const freshRow = await env.DB.prepare("SELECT r2_key FROM imports WHERE import_id = ?1")
      .bind(freshBody.importId)
      .first<{ r2_key: string }>();
    expect(freshRow?.r2_key).toContain("/generations/g1/imports/");
  });

  it("原本の補償削除に失敗した場合は台帳を残し、削除ジョブから再回収できる", async () => {
    const owner = await newOwner("imp-compensation");
    const originalPut = env.MEDIA.put.bind(env.MEDIA);
    vi.spyOn(env.MEDIA, "put").mockImplementationOnce(async (key, value, options) => {
      await reserveDeletion(owner.tenantId, owner.userId, "channel");
      return originalPut(key, value, options);
    });
    vi.spyOn(env.MEDIA, "delete").mockRejectedValueOnce(new Error("temporary R2 failure"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expectError(
      await upload(owner, "csv", { name: "orphan.csv", body: "date,views\n2026-09-01,1" }),
      409,
      "IMPORT_DELETION_PENDING",
    );
    const ledger = await env.DB.prepare("SELECT r2_key FROM import_uploads WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .first<{ r2_key: string }>();
    expect(ledger?.r2_key).toContain("/generations/g0/imports/");
    expect(await env.MEDIA.get(ledger?.r2_key ?? "")).not.toBeNull();
  });

  it("直接 INSERT でも削除予約中の取込は DB で拒否する", async () => {
    const owner = await newOwner("imp-db-gate");
    await reserveDeletion(owner.tenantId, owner.userId, "channel");
    await expect(
      env.DB.prepare(
        `INSERT INTO imports (tenant_id, import_id, kind, file_name, status, created_by, created_at)
         VALUES (?1, ?2, 'csv', 'late.csv', '処理待ち', ?3, ?4)`,
      )
        .bind(owner.tenantId, crypto.randomUUID(), owner.userId, new Date().toISOString())
        .run(),
    ).rejects.toThrow("IMPORT_DELETION_PENDING");
  });

  it("CSV は R2 のテナント配下に保存され、処理待ちで履歴に出る", async () => {
    const owner = await newOwner("imp-csv");
    const res = await upload(owner, "csv", {
      name: "analytics.csv",
      body: "date,views\n2026-09-01,10\n",
      type: "text/csv",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ImportRes;
    expect(body.status).toBe("処理待ち");

    const row = await env.DB.prepare("SELECT r2_key FROM imports WHERE import_id = ?1")
      .bind(body.importId)
      .first<{ r2_key: string }>();
    expect(row?.r2_key).toBe(
      `tenants/${owner.tenantId}/generations/g0/imports/${body.importId}/analytics.csv`,
    );
    const obj = await env.MEDIA.get(row?.r2_key ?? "");
    expect(await obj?.text()).toContain("2026-09-01");

    const list = (await (await call("/api/imports", { cookie: owner.cookie })).json()) as {
      imports: ImportRow[];
    };
    expect(list.imports[0]).toMatchObject({
      file_name: "analytics.csv",
      status: "処理待ち",
      has_original: 1,
    });
  });

  it("字幕（.vtt）・画像（.webp）も受け付ける", async () => {
    const owner = await newOwner("imp-kinds");
    expect((await upload(owner, "caption", { name: "ep1.vtt", body: "WEBVTT\n" })).status).toBe(
      201,
    );
    expect(
      (await upload(owner, "image", { name: "thumb.webp", body: new Uint8Array([1, 2, 3]) }))
        .status,
    ).toBe(201);
  });

  it("拡張子違い・空ファイル・サイズ超過は『失敗』として理由付きで記録し、R2 には置かない", async () => {
    const owner = await newOwner("imp-fail");
    const cases = [
      { kind: "csv", file: { name: "report.xlsx", body: "x" }, reason: ".csv" },
      { kind: "csv", file: { name: "empty.csv", body: "" }, reason: "空" },
      {
        kind: "caption",
        file: { name: "big.srt", body: new Uint8Array(1024 * 1024 + 1) },
        reason: "上限 1MB",
      },
    ];
    for (const c of cases) {
      const res = await upload(owner, c.kind, c.file);
      expect(res.status).toBe(201);
      const body = (await res.json()) as ImportRes;
      expect(body.status).toBe("失敗");
      expect(body.error).toContain(c.reason);
      const row = await env.DB.prepare("SELECT r2_key, error FROM imports WHERE import_id = ?1")
        .bind(body.importId)
        .first<{ r2_key: string | null; error: string }>();
      expect(row?.r2_key).toBeNull();
      expect(row?.error).toContain(c.reason);
    }
  });

  it("ファイル名のパス区切り・制御文字は _ に置き換える", async () => {
    const owner = await newOwner("imp-name");
    const res = await upload(owner, "csv", { name: "a\u0001b.csv", body: "x" });
    const { importId } = (await res.json()) as ImportRes;
    const row = await env.DB.prepare("SELECT file_name, r2_key FROM imports WHERE import_id = ?1")
      .bind(importId)
      .first<{ file_name: string; r2_key: string }>();
    expect(row?.file_name).toBe("a_b.csv");
    expect(row?.r2_key.endsWith("/a_b.csv")).toBe(true);
  });

  it("種類の指定が無い・ファイルが無いときは 400", async () => {
    const owner = await newOwner("imp-bad");
    await expectError(
      await upload(owner, "video", { name: "a.mp4", body: "x" }),
      400,
      "VALIDATION_FAILED",
    );
    await expectError(
      await call("/api/imports", { method: "POST", cookie: owner.cookie, body: {} }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("editor は取り込め、viewer は 403（履歴の閲覧はできる）", async () => {
    const owner = await newOwner("imp-role");
    const editor = await addMember(owner, "editor");
    const viewer = await addMember(owner, "viewer");
    expect((await upload(editor, "csv", { name: "e.csv", body: "x" })).status).toBe(201);
    await expectError(await upload(viewer, "csv", { name: "v.csv", body: "x" }), 403, "FORBIDDEN");
    expect((await call("/api/imports", { cookie: viewer.cookie })).status).toBe(200);
  });
});

describe("取込履歴", () => {
  it("新しい順に最新20件だけを返し、他テナントの履歴は混ざらない", async () => {
    const owner = await newOwner("imp-hist");
    const other = await newOwner("imp-hist-other");
    const stmt = env.DB.prepare(
      `INSERT INTO imports (tenant_id, import_id, kind, file_name, status, error, created_by, created_at)
       VALUES (?1, ?2, 'csv', ?3, ?4, ?5, ?6, ?7)`,
    );
    const rows = Array.from({ length: 22 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      const failed = i % 5 === 0;
      return stmt.bind(
        owner.tenantId,
        `imp-${n}`,
        `file-${n}.csv`,
        failed ? "失敗" : "完了",
        failed ? `列が足りません（${n}）` : null,
        owner.userId,
        `2026-09-${n}T00:00:00.000Z`,
      );
    });
    rows.push(
      stmt.bind(
        other.tenantId,
        "imp-x",
        "other.csv",
        "完了",
        null,
        other.userId,
        "2026-09-30T00:00:00.000Z",
      ),
    );
    await env.DB.batch(rows);

    const list = (await (await call("/api/imports", { cookie: owner.cookie })).json()) as {
      imports: ImportRow[];
    };
    expect(list.imports).toHaveLength(20);
    expect(list.imports[0]?.file_name).toBe("file-22.csv");
    expect(list.imports.at(-1)?.file_name).toBe("file-03.csv");
    expect(list.imports.some((r) => r.file_name === "other.csv")).toBe(false);
    const failed = list.imports.find((r) => r.file_name === "file-21.csv");
    expect(failed).toMatchObject({ status: "失敗", error: "列が足りません（21）" });
  });
});
