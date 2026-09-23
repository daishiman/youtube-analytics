#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateWorkerSecretListResult } from "./release-readiness-core.mjs";

const deployMode = process.argv.includes("--deploy");
const errors = [];
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const path of ["public/privacy.html", "public/terms.html"]) {
  const text = read(path);
  if (/草案|公開前に|記入します|（運営者/.test(text)) {
    errors.push(`${path}: 公開前の草案・未記入マーカーが残っています`);
  }
}

const wrangler = read("wrangler.toml");
const clientId = wrangler.match(/GOOGLE_CLIENT_ID\s*=\s*"([^"]+)"/)?.[1] ?? "";
if (!clientId.endsWith(".apps.googleusercontent.com") || /REPLACE|PLACEHOLDER/i.test(clientId)) {
  errors.push("wrangler.toml: GOOGLE_CLIENT_ID が本番形式ではありません");
}

if (deployMode) {
  for (const secret of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    if (!process.env[secret]) errors.push(`${secret}: GitHub repository secret が未設定です`);
  }
  if (errors.length === 0) {
    const result = spawnSync("pnpm", ["wrangler", "secret", "list", "--format", "json"], {
      encoding: "utf8",
      env: process.env,
    });
    errors.push(...validateWorkerSecretListResult(result));
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`release readiness: ${error}`);
  process.exit(1);
}
console.log(`release readiness: OK (${deployMode ? "deploy" : "repository"})`);
