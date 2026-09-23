import type { Bindings } from "./env";
import { app } from "./http/app";

export default {
  fetch: app.fetch,

  // Cron `0 18 * * *`: 収集と cleanup の通を collect-queue へ入れるだけ（feat-youtube-daily-collection で実装）
  async scheduled(_controller, _env, _ctx) {},

  // Queue consumer は処理実装と terminal failure 契約が揃う後続 feature で設定と同時に追加する。
} satisfies ExportedHandler<Bindings>;

export { app };
