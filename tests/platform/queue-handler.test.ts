import { describe, expect, it } from "vitest";
import worker from "../../src/index";
import wrangler from "../../wrangler.toml?raw";

describe("未実装の日次収集", () => {
  it("処理と終端契約が揃うまで Cron と consumer を構成にも handler にも公開しない", () => {
    expect(wrangler).toContain("[[queues.producers]]");
    expect(wrangler).not.toContain("[triggers]");
    expect(wrangler).not.toContain("[[queues.consumers]]");
    expect("scheduled" in worker).toBe(false);
    expect("queue" in worker).toBe(false);
  });
});
