import { describe, expect, it } from "vitest";
import { ANALYTICS_DIMENSION_KEYS } from "../../src/adapters/google-analytics-dimensions";
import {
  fixedDailyOps,
  maxConnectionsWithinBudget,
  QUEUE_DAILY_SAFE_OPS,
  QUEUE_MESSAGES_PER_CONNECTION,
  QUEUE_OPS_PER_MESSAGE,
  THUMBNAIL_SENDS_PER_DAY_MAX,
  thumbnailSendsPerDay,
} from "../../src/usecases/queue-budget";
import { CAPTION_DAILY_LIMIT } from "../../src/usecases/settings-common";
import { THUMBNAIL_MESSAGES_PER_DAY } from "../../src/usecases/thumbnails";
import wrangler from "../../wrangler.toml?raw";

const thumbnailOps = (connections: number) =>
  thumbnailSendsPerDay(connections, THUMBNAIL_MESSAGES_PER_DAY) *
  THUMBNAIL_MESSAGES_PER_DAY *
  QUEUE_OPS_PER_MESSAGE;

describe("Queue の1日の操作予算", () => {
  it("収まる連携数までは 連携数 × 全通数 × 3 + thumbnail ≤ 8,000", () => {
    const max = maxConnectionsWithinBudget();
    for (const n of [0, 1, 10, max]) {
      expect(fixedDailyOps(n) + thumbnailOps(n)).toBeLessThanOrEqual(QUEUE_DAILY_SAFE_OPS);
    }
    expect(fixedDailyOps(max + 1)).toBeGreaterThan(QUEUE_DAILY_SAFE_OPS);
  });

  it("thumbnail は少数テナントでは従来の上限、固定分が予算を食うほど減り、超えたら0", () => {
    expect(thumbnailSendsPerDay(1, THUMBNAIL_MESSAGES_PER_DAY)).toBe(THUMBNAIL_SENDS_PER_DAY_MAX);
    const nearMax = maxConnectionsWithinBudget();
    expect(thumbnailSendsPerDay(nearMax, THUMBNAIL_MESSAGES_PER_DAY)).toBeLessThan(
      THUMBNAIL_SENDS_PER_DAY_MAX,
    );
    expect(thumbnailSendsPerDay(nearMax + 1, THUMBNAIL_MESSAGES_PER_DAY)).toBe(0);
  });

  // 1テナント1連携。上限いっぱいまでテナントが増えても固定分と thumbnail が安全予算に収まる
  it("wrangler.toml の MAX_TENANTS は予算に収まる連携数以下", () => {
    const maxTenants = Number(/^MAX_TENANTS = "(\d+)"$/m.exec(wrangler)?.[1]);
    expect(maxTenants).toBeGreaterThan(0);
    expect(maxTenants).toBeLessThanOrEqual(maxConnectionsWithinBudget());
    expect(fixedDailyOps(maxTenants) + thumbnailOps(maxTenants)).toBeLessThanOrEqual(
      QUEUE_DAILY_SAFE_OPS,
    );
  });

  it("見積もりの通数は各処理の上限の定数と一致する（片方だけ変えたら落ちる）", () => {
    expect(QUEUE_MESSAGES_PER_CONNECTION.dimensions).toBe(ANALYTICS_DIMENSION_KEYS.length);
    expect(QUEUE_MESSAGES_PER_CONNECTION.captions).toBe(CAPTION_DAILY_LIMIT);
  });
});
