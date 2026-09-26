#!/usr/bin/env node
// .claude/skills/report-design-system（無改変 vendoring）が取込後に変更されていないことを確かめる。
//
//   node scripts/skill-analysis/check-rds-unmodified.mjs
//
// 判定の順番:
//   1. 取込元（env RDS_ORIGIN、無ければ .claude/report-design-system.ORIGIN.md の「取込元:」行のバッククォート内パス）が
//      手元にあれば `diff -r` で比べる。一致なら 0、差分があれば 1。
//   2. 取込元が無く git 管理下なら、`git log` で取込後の変更コミットの有無を見て、
//      `git diff --exit-code HEAD -- .claude/skills/report-design-system` と未追跡ファイルの有無で判定する。
//   3. 未追跡（まだコミットされていない）なら比べられないので 3 で止める（fail-closed）。
//      比較できないことを承知で進めるときだけ --allow-unverifiable を付け、0 にする。
// 終了コード: 0=無改変（--allow-unverifiable 時は比較不能も）/ 1=変更あり / 2=対象が無い・git が使えない / 3=比較不能
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REL = ".claude/skills/report-design-system";
const RDS = join(REPO, REL);
const ORIGIN_MD = join(REPO, ".claude", "report-design-system.ORIGIN.md");

const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const git = (...args) => run("git", ["-C", REPO, ...args]);

function originPath() {
  if (process.env.RDS_ORIGIN) return { path: resolve(process.env.RDS_ORIGIN), from: "環境変数 RDS_ORIGIN" };
  if (!existsSync(ORIGIN_MD)) return null;
  const m = readFileSync(ORIGIN_MD, "utf8").match(/取込元:\s*`([^`]+)`/);
  return m ? { path: m[1], from: ".claude/report-design-system.ORIGIN.md" } : null;
}

function main() {
  if (!existsSync(RDS) || !statSync(RDS).isDirectory()) {
    console.error(`対象がありません: ${RDS}`);
    return 2;
  }

  // 1. 取込元と diff -r
  const origin = originPath();
  if (origin && existsSync(origin.path)) {
    const r = run("diff", ["-r", origin.path, RDS]);
    if (r.status === 0) {
      console.log(`無改変: 取込元（${origin.from}）と diff -r で一致しました\n  取込元: ${origin.path}`);
      return 0;
    }
    if (r.status === 1) {
      console.error(`変更あり: 取込元（${origin.path}）と差分があります。取込元側が更新された場合は、無改変のまま丸ごと差し替えてください`);
      console.error(r.stdout.split("\n").slice(0, 40).join("\n"));
      return 1;
    }
    console.error(`diff を実行できませんでした: ${r.stderr}`);
    return 2;
  }
  if (origin) console.log(`取込元が手元にありません（${origin.path}）。git で判定します`);

  // 2. git 管理下か
  if (git("rev-parse", "--is-inside-work-tree").status !== 0) {
    console.error("git 管理下ではないため判定できません。RDS_ORIGIN に取込元を指定してください");
    return 2;
  }
  const tracked = git("ls-files", "--", REL).stdout.trim();
  const status = git("status", "--porcelain", "--untracked-files=all", "--", REL).stdout.trim();
  if (!tracked) {
    // 3. 未追跡
    if (status) {
      const msg = `比較不能: ${REL} は未追跡（まだコミットされていない）ため、取込時点と比べられません。RDS_ORIGIN に取込元を指定するか、コミット後に再実行してください`;
      if (process.argv.includes("--allow-unverifiable")) {
        console.log(`${msg}（--allow-unverifiable のため 0 で終了）`);
        return 0;
      }
      console.error(msg);
      return 3;
    }
    console.error(`${REL} が git に見えません`);
    return 2;
  }
  const commits = git("log", "--format=%h %ad %s", "--date=short", "--", REL).stdout.trim().split("\n").filter(Boolean);
  const problems = [];
  if (commits.length > 1) problems.push(`取込後に ${commits.length - 1} 件の変更コミットがあります:\n    ${commits.slice(0, -1).join("\n    ")}`);
  const diff = git("diff", "--exit-code", "--stat", "HEAD", "--", REL);
  if (diff.status !== 0) problems.push(`作業ツリーに未コミットの変更があります:\n${diff.stdout}`);
  const untracked = status.split("\n").filter((l) => l.startsWith("??"));
  if (untracked.length) problems.push(`未追跡のファイルが増えています:\n    ${untracked.join("\n    ")}`);
  if (problems.length) {
    console.error(`変更あり: ${REL}\n  ${problems.join("\n  ")}`);
    return 1;
  }
  console.log(`無改変: 取込コミット（${commits[0]}）以降の変更はありません（git log / git diff --exit-code）`);
  return 0;
}

process.exitCode = main();
