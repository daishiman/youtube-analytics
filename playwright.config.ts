import { defineConfig } from "@playwright/test";

// 正本 frontend 章の3サイズ（スマホ・タブレット・PC）で E2E を回す
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:8791" },
  webServer: {
    // CI（.dev.vars なし）でも開発用ログインと seed アカウントで画面を回す。ローカルは起動中の pnpm dev を再利用する
    command:
      "pnpm db:migrate:local && pnpm db:seed:local && pnpm build:web && pnpm wrangler dev --port 8791 --var DEV_LOGIN:1 --var TOKEN_ENC_KEY:e2e-only-not-secret",
    url: "http://localhost:8791/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
