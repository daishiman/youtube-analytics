// D1 マイグレーションの適用検証（CI と手元の両方で使う。Cloudflare へは送らない）
//   1. 空の local D1 へ migrations/ を全件適用する
//   2. 既存 DB 相当（--base までを適用済み）へ残りの差分だけを適用する
// 使い方: node scripts/check-migrations.mjs [--base 0007]
// 一時フォルダ（local D1 と一時設定）は、成功しても失敗しても最後に消す
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseArg = process.argv.indexOf("--base");
// 既定の 0007 は main にある最後の migration（このブランチは 0008 以降を足す）。意図して固定している
const base = baseArg > 0 ? process.argv[baseArg + 1] : "0007";
const all = readdirSync(join(root, "migrations"))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
const before = all.filter((f) => f.slice(0, 4) <= base);
if (before.length === 0 || before.length === all.length)
  throw new Error(`--base ${base} では差分適用を確かめられません（全${all.length}件）`);

function wrangler(args) {
  return execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
  });
}

function applied(persist, config) {
  const out = wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    persist,
    ...(config ? ["--config", config] : []),
    "--json",
    "--command",
    "SELECT name FROM d1_migrations ORDER BY id",
  ]);
  return JSON.parse(out)[0].results.map((r) => r.name);
}

function expectNames(label, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want))
    throw new Error(`${label}: 適用済みが一致しません\n  期待: ${want.join(", ")}\n  実際: ${got.join(", ")}`);
  console.log(`OK ${label}: ${got.length}件`);
}

const work = mkdtempSync(join(tmpdir(), "d1-migrations-"));
try {
  // 1. 空 DB へ全件
  const empty = join(work, "empty");
  wrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", empty]);
  expectNames("空DBへ全件適用", applied(empty), all);

  // 2. --base までを入れた DB を作る（migrations_dir だけを差し替えた一時設定）
  const subset = join(work, "subset");
  mkdirSync(subset);
  for (const f of before) copyFileSync(join(root, "migrations", f), join(subset, f));
  const config = join(work, "wrangler.base.toml");
  writeFileSync(
    config,
    readFileSync(join(root, "wrangler.toml"), "utf8")
      .replace(/^main = .*$/m, `main = ${JSON.stringify(join(root, "src/index.ts"))}`)
      .replace(/^directory = .*$/m, `directory = ${JSON.stringify(join(root, "dist/web"))}`)
      .replace(/^migrations_dir = .*$/m, `migrations_dir = ${JSON.stringify(subset)}`),
  );
  const existing = join(work, "existing");
  wrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", existing, "--config", config]);
  expectNames(`既存DB（${base}まで）`, applied(existing, config), before);

  // 3. 本来の設定で残りだけを当てる
  wrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", existing]);
  expectNames(`差分適用（${all.length - before.length}件）`, applied(existing), all);
} finally {
  rmSync(work, { recursive: true, force: true });
}
