import { describe, expect, it } from "vitest";
import worker from "../../src/index";
import wrangler from "../../wrangler.toml?raw";

describe("未実装 Queue consumer", () => {
  it("処理と終端契約が揃うまで consumer を構成にも handler にも公開しない", () => {
    expect(wrangler).toContain("[[queues.producers]]");
    expect(wrangler).not.toContain("[[queues.consumers]]");
    expect("queue" in worker).toBe(false);
  });
});
