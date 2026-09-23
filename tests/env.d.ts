import type { D1Migration } from "cloudflare:test";
import type { Bindings } from "../src/env";

// テストの env（cloudflare:workers）に wrangler.toml のバインディングとテスト専用バインディングを載せる
declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
