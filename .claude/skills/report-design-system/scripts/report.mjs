#!/usr/bin/env node
// レポート1本を作る入口。SKILL.md の Quickstart にある機械の段を、それぞれ1コマンドにまとめる。前の段が不合格なら止まる。
//
//   node scripts/report.mjs init  <出力ルート> <YYYY-MM> <slug> <データ...>   フォルダと analysis.mjs の雛形 + profile.json
//   node scripts/report.mjs check <フォルダ>                                  brief.json の早期検査 (任意)
//   node scripts/report.mjs build <フォルダ>                                  計算 → HTML → 数値・依存検査 (通常の最短経路)
//   node scripts/report.mjs verify <フォルダ>                                 build → 4幅描画 → 証跡記録 (厳格検証を頼まれたときだけ)
//   node scripts/report.mjs done  <フォルダ>                                  build 証跡 → 判定と要因 → 独立レビューの検査 (厳格検証の完了)
// 終了コード: 0=合格 1=不合格 2=入力エラー
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NAME_RE } from "./new-report.mjs";
import { clearBuildState } from "./build-state.mjs";

const S = dirname(fileURLToPath(import.meta.url));
const USAGE = "使い方: node scripts/report.mjs <init <出力ルート> <YYYY-MM> <slug> <データ...> | check|build|verify|done <フォルダ>>";

// 段を順に実行し、最初に 0 以外を返した段の終了コードで止まる
function run(steps, cwd) {
  for (const [script, ...args] of steps) {
    const file = script.startsWith("./") ? script : join(S, script);
    const r = spawnSync(process.execPath, [file, ...args], { cwd, stdio: "inherit" });
    if (r.status !== 0) return r.status ?? 1;
  }
  return 0;
}

/** build と verify の差を1か所で定義する。通常 build はブラウザを起動しない。 */
export function pipelineSteps(mode, dir, name) {
  if (!["build", "verify"].includes(mode)) throw new TypeError(`未知の生成モード: ${mode}`);
  const content = [
    ["./analysis.mjs"],
    ["build-report.mjs", `${name}.src.html`],
    ["check-llm.mjs", "results", dir],
  ];
  return mode === "build" ? content : [
    ...content,
    ["verify-render.mjs", `${name}.html`, "screens"],
    ["build-state.mjs", "record", dir, name],
  ];
}

function main([cmd, ...rest]) {
  if (cmd === "init") {
    const [root, month, slug, ...data] = rest;
    const name = `${month}-${slug}`;
    if (!root || !month || !slug || !data.length || !NAME_RE.test(name)) return console.error(USAGE), 2;
    const rootDir = resolve(root);
    const dir = join(rootDir, name);
    if (existsSync(dir)) return console.error(`入力エラー: ${dir} は既にあります (上書きしない。analysis.mjs を編集して再実行する)`), 2;
    const tmp = mkdtempSync(join(tmpdir(), "report-profile-"));
    const profile = join(tmp, "profile.json");
    try {
      const profiled = run([["profile-data.mjs", profile, ...data.map((f) => resolve(f))]]);
      if (profiled !== 0) return profiled;
      return run([["new-report.mjs", rootDir, month, slug, "--profile", profile, ...data.map((file) => resolve(file))]]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  const dir = rest[0] && resolve(rest[0]);
  if (!["check", "build", "verify", "done"].includes(cmd) || !dir || !existsSync(dir)) return console.error(USAGE), 2;
  const name = basename(dir);
  if (cmd === "check") {
    const researched = readdirSync(dir).some((f) => /^背景データ.*\.csv$/.test(f));
    return run([["check-llm.mjs", "brief", dir, ...(researched ? [] : ["--pre"])]], dir);
  }
  if (["build", "verify"].includes(cmd)) {
    clearBuildState(dir); // Node subprocessを増やさず、古い厳格検証だけ無効化する
    return run(pipelineSteps(cmd, dir, name), dir);
  }
  return run([
    ["build-state.mjs", "verify", dir, name],
    ["check-llm.mjs", "results", dir],
    ["check-llm.mjs", "review", dir],
  ], dir);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
