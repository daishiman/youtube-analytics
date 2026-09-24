import { defineConfig } from "@playwright/test";

// 正本 frontend 章の3サイズ（スマホ・タブレット・PC）で E2E を回す。
// E2E_PORT は別の worktree が 8791 を使っているときの逃げ道（既定 8791）
const port = process.env.E2E_PORT ?? "8791";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    // CI（.dev.vars なし）でも開発用ログインと seed アカウントで画面を回す。ローカルは起動中の pnpm dev を再利用する
    command: `pnpm db:migrate:local && pnpm db:seed:local && pnpm build:web && pnpm wrangler dev --port ${port} --var DEV_LOGIN:1 --var TOKEN_ENC_KEY:e2e-only-not-secret`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
