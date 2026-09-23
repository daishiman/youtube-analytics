import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Workers ランタイム（Miniflare）上で D1/R2/Queues バインディング込みでテストする。
// migrations/ を Node 側で読み、テスト用バインディング TEST_MIGRATIONS として渡して setup で適用する
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
            GOOGLE_CLIENT_SECRET: "test-client-secret",
            TOKEN_ENC_KEY: "test-token-enc-key-000000000000000000000000",
            // 開発者の .dev.vars（DEV_LOGIN=1）がテストへ漏れないよう本番既定値に固定する
            DEV_LOGIN: "0",
          },
        },
      }),
    ],
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup.ts"],
    },
  };
});
