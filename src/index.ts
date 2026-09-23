import type { Bindings } from "./env";
import { app } from "./http/app";

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Bindings>;

export { app };
