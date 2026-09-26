import { createMessageBatch, createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { CleanupMessage } from "../../src/env";
import worker from "../../src/index";
import wrangler from "../../wrangler.toml?raw";

describe("チャンネル削除ジョブの起動", () => {
  it("収集・削除・サムネイル Queue と日次 Cron を構成する", () => {
    expect(wrangler).toContain('binding = "COLLECT_QUEUE"');
    expect(wrangler).toContain('binding = "CLEANUP_QUEUE"');
    expect(wrangler).toContain('queue = "channel-cleanup-queue"');
    expect(wrangler).toContain('queue = "collect-queue"');
    expect(wrangler).toMatch(/queue = "collect-queue"[\s\S]*?max_retries = 3\s+retry_delay = 600/);
    expect(wrangler).toContain("max_concurrency = 1");
    expect(wrangler).toContain('crons = ["0 18 * * *"]');
    expect(worker.queue).toEqual(expect.any(Function));
    expect(worker.scheduled).toEqual(expect.any(Function));
  });

  it("削除 Queue のメッセージを処理し、再実行でも失敗しない", async () => {
    const batch = createMessageBatch<CleanupMessage>("channel-cleanup-queue", [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        attempts: 1,
        body: { kind: "cleanup" as const },
      },
    ]);
    await expect(worker.queue(batch, env)).resolves.toBeUndefined();
    await expect(worker.queue(batch, env)).resolves.toBeUndefined();
  });

  it("収集 Queue の異種メッセージは成功扱いにしない", async () => {
    const batch = createMessageBatch<CleanupMessage>("collect-queue", [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        attempts: 1,
        body: { kind: "cleanup" as const },
      },
    ]);
    await expect(worker.queue(batch, env)).rejects.toThrow("Unexpected collect message");
  });

  it("Cron は専用 Queue に実行要求を送る", async () => {
    const send = vi.spyOn(env.CLEANUP_QUEUE, "send");
    try {
      await worker.scheduled(createScheduledController({ cron: "0 18 * * *" }), env);
      expect(send).toHaveBeenCalledWith({ kind: "cleanup" });
      expect(send).toHaveBeenCalledWith({ kind: "retention" });
    } finally {
      send.mockRestore();
    }
  });
});
