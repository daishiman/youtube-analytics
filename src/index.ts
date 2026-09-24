import type { Bindings, CleanupMessage } from "./env";
import { app } from "./http/app";
import { processPendingChannelDeletions } from "./usecases/channel-cleanup";

async function runCleanup(env: Bindings, now: Date): Promise<void> {
  const result = await processPendingChannelDeletions(env, now);
  if (result.overdue > 0) {
    console.warn("channel cleanup overdue", { count: result.overdue });
  }
  if (result.remaining) await env.CLEANUP_QUEUE.send({ kind: "cleanup" }, { delaySeconds: 60 });
}

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<CleanupMessage>, env: Bindings) {
    // collect 専用のキューとは分離する。想定外のメッセージは成功扱いにしない。
    if (batch.queue !== "channel-cleanup-queue") throw new Error("Unexpected queue");
    for (const message of batch.messages) {
      if (message.body?.kind !== "cleanup") throw new Error("Unexpected cleanup message");
      await runCleanup(env, new Date());
    }
  },
  async scheduled(_event: ScheduledController, env: Bindings) {
    await env.CLEANUP_QUEUE.send({ kind: "cleanup" });
  },
} satisfies ExportedHandler<Bindings, CleanupMessage>;

export { app };
