// 無料枠の使用状況。Cloudflare は全体、YouTube のプロジェクト別 quota はこのカウンタから推定しない
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CF_GRAPHQL_URL } from "../../src/adapters/cf-analytics";
import { getUsage, usageLevel } from "../../src/usecases/usage";
import { call, newOwner } from "../platform/helpers";

afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM usage_snapshots").run();
});

const CF_ENV = { CF_ACCOUNT_ID: "acc-test", CF_ANALYTICS_TOKEN: "cf-token" };

type Item = { key: string; used: number | null; limit: number; level: string };

function fakeCf(values: { d1: number; r2: number; req: number } | "fail") {
  const calls: RequestInit[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(CF_GRAPHQL_URL)) throw new Error(`想定外の外部呼び出し: ${url}`);
    calls.push(init ?? {});
    if (values === "fail") return new Response("boom", { status: 500 });
    return Response.json({
      data: {
        viewer: {
          accounts: [
            {
              // 同じ DB の複数日は最大値、DB をまたいで合計
              d1StorageAdaptiveGroups: [
                { max: { databaseSizeBytes: values.d1 }, dimensions: { databaseId: "a" } },
                {
                  max: { databaseSizeBytes: Math.floor(values.d1 / 2) },
                  dimensions: { databaseId: "a" },
                },
                { max: { databaseSizeBytes: 0 }, dimensions: { databaseId: "b" } },
              ],
              r2StorageAdaptiveGroups: [
                {
                  max: { payloadSize: values.r2, metadataSize: 0 },
                  dimensions: { bucketName: "m" },
                },
              ],
              workersInvocationsAdaptive: [{ sum: { requests: values.req } }],
            },
          ],
        },
      },
    });
  });
  return calls;
}

async function usageOf(cookie: string, envOverride?: Record<string, string>) {
  const res = await call("/api/usage", { cookie, env: envOverride });
  expect(res.status).toBe(200);
  const { usage } = (await res.json()) as { usage: Item[] };
  return Object.fromEntries(usage.map((u) => [u.key, u]));
}

describe("しきい値", () => {
  it("70% 未満は ok、70% 以上は warn、90% 以上は danger、値なしは unknown", () => {
    expect(usageLevel(69, 100)).toBe("ok");
    expect(usageLevel(70, 100)).toBe("warn");
    expect(usageLevel(89, 100)).toBe("warn");
    expect(usageLevel(90, 100)).toBe("danger");
    expect(usageLevel(120, 100)).toBe("danger");
    expect(usageLevel(null, 100)).toBe("unknown");
  });
});

describe("Cloudflare の使用量", () => {
  it("使用量DBの読取失敗でも設定表示に渡せる未取得の一覧を返す", async () => {
    const brokenDb = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === "prepare") {
          return () => {
            throw new Error("usage database unavailable");
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const usage = await getUsage({ env: { ...env, DB: brokenDb }, now: new Date() });
    expect(usage).toHaveLength(7);
    expect(usage.every((row) => row.used === null && row.level === "unknown")).toBe(true);
  });

  it("取得した値を表示し、1時間以内の再表示では Cloudflare を呼ばない", async () => {
    const owner = await newOwner("use-cache");
    const calls = fakeCf({ d1: 1000, r2: 2000, req: 95_000 });
    const first = await usageOf(owner.cookie, CF_ENV);
    expect(first.d1_storage?.used).toBe(1000);
    expect(first.r2_storage?.used).toBe(2000);
    expect(first.workers_requests).toMatchObject({ used: 95_000, level: "danger" });
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0]?.headers).get("authorization")).toBe("Bearer cf-token");

    await usageOf(owner.cookie, CF_ENV);
    expect(calls).toHaveLength(1);
  });

  it("1時間を過ぎたら取り直す", async () => {
    const owner = await newOwner("use-stale");
    fakeCf({ d1: 1, r2: 1, req: 1 });
    await usageOf(owner.cookie, CF_ENV);
    await env.DB.prepare("UPDATE usage_snapshots SET fetched_at = ?1")
      .bind(new Date(Date.now() - 61 * 60 * 1000).toISOString())
      .run();
    vi.restoreAllMocks();
    const calls = fakeCf({ d1: 5, r2: 5, req: 71_000 });
    const u = await usageOf(owner.cookie, CF_ENV);
    expect(calls).toHaveLength(1);
    expect(u.workers_requests).toMatchObject({ used: 71_000, level: "warn" });
  });

  it("取り直しに失敗したら古い値のまま表示する", async () => {
    const owner = await newOwner("use-fail");
    fakeCf({ d1: 10, r2: 20, req: 30 });
    await usageOf(owner.cookie, CF_ENV);
    await env.DB.prepare(
      "UPDATE usage_snapshots SET fetched_at = '2000-01-01T00:00:00.000Z'",
    ).run();
    vi.restoreAllMocks();
    fakeCf("fail");
    const u = await usageOf(owner.cookie, CF_ENV);
    expect(u.d1_storage?.used).toBe(10);
    expect(u.workers_requests?.used).toBe(30);
  });

  it("トークン未設定なら外部を呼ばず、値は unknown", async () => {
    const owner = await newOwner("use-none");
    const calls = fakeCf({ d1: 1, r2: 1, req: 1 });
    const u = await usageOf(owner.cookie);
    expect(calls).toHaveLength(0);
    expect(u.d1_storage).toMatchObject({ used: null, level: "unknown" });
  });
});

describe("表示範囲", () => {
  it("7項目の全体合計だけで、テナント ID やテナント別の値を含まない", async () => {
    const owner = await newOwner("use-scope");
    const res = await call("/api/usage", { cookie: owner.cookie });
    const text = await res.text();
    const { usage } = JSON.parse(text) as { usage: Item[] };
    expect(usage.map((u) => u.key)).toEqual([
      "youtube_units",
      "d1_writes",
      "d1_storage",
      "r2_storage",
      "workers_requests",
      "captions",
      "tenants",
    ]);
    expect(text).not.toContain(owner.tenantId);
    for (const u of usage) {
      expect(Object.keys(u).sort()).toEqual(["key", "label", "level", "limit", "unit", "used"]);
    }
    expect(usage.find((u) => u.key === "captions")?.limit).toBe(5);
  });

  it("計測できない値や全体カウンタを個別の上限と比較しない", async () => {
    const owner = await newOwner("use-yt");
    const day = new Date().toISOString().slice(0, 10);
    for (const [kind, value] of [
      ["youtube_units", 7000],
      ["d1_writes", 70_000],
      ["caption_count", 5],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO usage_counters (date, kind, value) VALUES (?1, ?2, ?3)
         ON CONFLICT (date, kind) DO UPDATE SET value = excluded.value`,
      )
        .bind(day, kind, value)
        .run();
    }
    const u = await usageOf(owner.cookie);
    expect(u.youtube_units).toMatchObject({
      used: null,
      limit: 10_000,
      level: "unknown",
    });
    expect(u.d1_writes).toMatchObject({ used: null, limit: 100_000, level: "unknown" });
    expect(u.captions).toMatchObject({ used: null, limit: 5, level: "unknown" });
  });
});
