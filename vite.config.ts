import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPA（React・qa-061）は web/ をルートにビルドし、wrangler.toml の [assets] directory へ出力する
// public/ の静的ページ（privacy.html・terms.html）はそのまま dist/web へコピーする
export default defineConfig({
  root: "web",
  publicDir: "../public",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8791" } },
});
