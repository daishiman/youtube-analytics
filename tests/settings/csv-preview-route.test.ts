import { describe, expect, it } from "vitest";
import { call, newOwner } from "../platform/helpers";
import { upload } from "./helpers";

describe("GET /api/imports/:importId/preview", () => {
  it("CSV原本の全列をページ単位で返す", async () => {
    const owner = await newOwner("csv-route");
    const uploaded = await upload(owner, "csv", {
      name: "custom.csv",
      body: "日付,独自の数値,新しい列\n2026-09-01,12,任意値\n2026-09-02,13,次の値",
    });
    const { importId } = (await uploaded.json()) as { importId: string };

    const response = await call(`/api/imports/${importId}/preview?offset=1&limit=1`, {
      cookie: owner.cookie,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      headers: ["日付", "独自の数値", "新しい列"],
      rows: [["2026-09-02", "13", "次の値"]],
      totalRows: 2,
      offset: 1,
      limit: 1,
      status: "処理待ち",
    });
  });

  it("別テナントのIDと不正なページ指定を拒否する", async () => {
    const owner = await newOwner("csv-route-owner");
    const other = await newOwner("csv-route-other");
    const uploaded = await upload(owner, "csv", { name: "a.csv", body: "列\n値" });
    const { importId } = (await uploaded.json()) as { importId: string };

    expect((await call(`/api/imports/${importId}/preview`, { cookie: other.cookie })).status).toBe(
      404,
    );
    expect(
      (await call(`/api/imports/${importId}/preview?offset=bad`, { cookie: owner.cookie })).status,
    ).toBe(400);
  });
});
