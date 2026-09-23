import type { Bindings, CollectMessage } from "./env";
import { app } from "./http/app";

export default {
  fetch: app.fetch,

  // Cron `0 18 * * *`: 収集と cleanup の通を collect-queue へ入れるだけ（feat-youtube-daily-collection で実装）
  async scheduled(_controller, _env, _ctx) {},

  // consumer（max_batch_size=1）: 1通=1テナントの処理（feat-youtube-daily-collection / feat-retention-ops で実装）
  async queue(batch, _env, _ctx) {
    for (const msg of batch.messages) msg.ack();
  },
} satisfies ExportedHandler<Bindings, CollectMessage>;

export { app };
