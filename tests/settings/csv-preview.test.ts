import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { parseCsvPage } from "../../src/domain/csv-table";
import type { TenantContext } from "../../src/domain/tenant-context";
import { previewCsvImport } from "../../src/usecases/csv-preview";
import { newOwner } from "../platform/helpers";
import { upload } from "./helpers";

async function storedCsv(owner: Awaited<ReturnType<typeof newOwner>>, body: string) {
  const response = await upload(owner, "csv", { name: "studio.csv", body });
  expect(response.status).toBe(201);
  return ((await response.json()) as { importId: string }).importId;
}

function context(owner: Awaited<ReturnType<typeof newOwner>>): TenantContext {
  return { tenantId: owner.tenantId, userId: owner.userId, role: "owner" };
}

describe("CSV原本のプレビュー", () => {
  it("BOM、引用符内の改行・カンマ、二重引用符を保持し、ページ単位で返す", async () => {
    const owner = await newOwner("csv-preview");
    const importId = await storedCsv(
      owner,
      '\uFEFF動画 ID,タイトル,メモ\r\na1,"A, B","1行目\r\n2行目"\r\na2,"引用符 ""あり""",\r\na3,末尾,値\r\n',
    );
    const deps = { env, now: new Date() };

    expect(await previewCsvImport(deps, context(owner), importId, 1, 1)).toMatchObject({
      importId,
      fileName: "studio.csv",
      headers: ["動画 ID", "タイトル", "メモ"],
      rows: [["a2", '引用符 "あり"', ""]],
      totalRows: 3,
      offset: 1,
      limit: 1,
    });
    expect(await previewCsvImport(deps, context(owner), importId, 3, 1)).toMatchObject({
      rows: [],
      totalRows: 3,
    });
    const row = await env.DB.prepare(
      "SELECT status FROM imports WHERE tenant_id = ?1 AND import_id = ?2",
    )
      .bind(owner.tenantId, importId)
      .first<{ status: string }>();
    expect(row?.status).toBe("処理待ち");
  });

  it("別テナントとCSV以外の原本を見せない", async () => {
    const owner = await newOwner("csv-preview-a");
    const other = await newOwner("csv-preview-b");
    const importId = await storedCsv(owner, "日付,視聴回数\n2026-09-01,12");
    const caption = await upload(owner, "caption", { name: "x.vtt", body: "WEBVTT\n" });
    const captionId = ((await caption.json()) as { importId: string }).importId;

    await expect(
      previewCsvImport({ env, now: new Date() }, context(other), importId, 0, 10),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      previewCsvImport({ env, now: new Date() }, context(owner), captionId, 0, 10),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("不正なCSVと不正なページ指定を分かるエラーにする", async () => {
    const owner = await newOwner("csv-preview-invalid");
    const importId = await storedCsv(owner, '列\n"閉じない');
    const deps = { env, now: new Date() };

    await expect(previewCsvImport(deps, context(owner), importId, 0, 10)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(previewCsvImport(deps, context(owner), importId, -1, 10)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(previewCsvImport(deps, context(owner), importId, 0, 0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("100行に制限し、ヘッダーと各行の列値を切り捨てない", () => {
    const csv = `A,B,C\n${Array.from({ length: 101 }, (_, i) => `${i},${i + 1},`).join("\n")}`;
    const page = parseCsvPage(csv, 0, 1000);
    expect(page.headers).toEqual(["A", "B", "C"]);
    expect(page.rows).toHaveLength(100);
    expect(page.rows[0]).toEqual(["0", "1", ""]);
    expect(page.totalRows).toBe(101);
    expect(page.limit).toBe(100);
  });

  it("データ中の空行も件数とページ位置に含める", () => {
    const page = parseCsvPage("A,B\n1,2\n\n3,4\n", 1, 1);
    expect(page.rows).toEqual([[""]]);
    expect(page.totalRows).toBe(3);
  });

  it("閉じた引用符、列数上限、ヘッダーより多いデータ列を拒否する", () => {
    const cases: [string, string][] = [
      ['列\n"値"追記', "引用符"],
      [`${Array.from({ length: 257 }, (_, i) => i).join(",")}\n`, "257列"],
      ["A,B\n1,2,3", "ヘッダーの2列"],
    ];
    for (const [csv, reason] of cases) {
      try {
        parseCsvPage(csv, 0, 10);
        expect.unreachable("不正なCSVを受け付けました");
      } catch (error) {
        expect(error).toMatchObject({
          code: "VALIDATION_FAILED",
          hint: expect.stringContaining(reason),
        });
      }
    }
  });

  it("UTF-8として読めない原本を拒否する", async () => {
    const owner = await newOwner("csv-preview-encoding");
    const response = await upload(owner, "csv", {
      name: "invalid.csv",
      body: new Uint8Array([0xff, 0xfe, 0x41, 0x00]),
    });
    const importId = ((await response.json()) as { importId: string }).importId;
    await expect(
      previewCsvImport({ env, now: new Date() }, context(owner), importId, 0, 10),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", hint: expect.stringContaining("UTF-8") });
  });
});
