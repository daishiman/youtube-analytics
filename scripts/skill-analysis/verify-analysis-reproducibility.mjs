#!/usr/bin/env node
// 同じ export から分析計算を別プロセスで2回行い、結果 JSON（report_html を除く）が完全一致するかを確かめる。
//
//   node scripts/skill-analysis/verify-analysis-reproducibility.mjs tests/fixtures/skill-analysis-sample
//   node scripts/skill-analysis/verify-analysis-reproducibility.mjs tests/fixtures/skill-analysis-sample --compare-with <posted-result.json>
//
// - フィクスチャフォルダの export-v1.json と brief.json を使う。
// - --compare-with を付けると、送信済みの結果 JSON とも突き合わせる。その結果 JSON と同じフォルダに export.json・brief.json が
//   あればそちらを入力にする（実行時の request_id・期間で再計算するため）。
// 終了コード: 0=完全一致 / 1=不一致 / 2=引数・入力の誤り
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SELF), "..", "..");
const COMPUTE = pathToFileURL(join(REPO, ".claude", "skills", "yt-analyze", "lib", "compute.mjs")).href;

/** 子プロセス側: export と brief から結果 JSON（HTML 以外）を正規化 JSON で stdout に出す */
async function child(exportPath, briefPath) {
  const { analyzeExport, buildReportJson, reproducibleView, canonicalJson } = await import(COMPUTE);
  const exp = JSON.parse(readFileSync(exportPath, "utf8"));
  const brief = JSON.parse(readFileSync(briefPath, "utf8"));
  // パイプラインと同じく、範囲 は依頼の期間で上書きする（計算には使わないが brief を同じ形にそろえる）
  brief.plan.範囲 = `${exp.request.period_start}〜${exp.request.period_end}`;
  process.stdout.write(canonicalJson(reproducibleView(buildReportJson(exp, brief, analyzeExport(exp, brief), null))));
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return `位置 ${i}: 「${a.slice(Math.max(0, i - 40), i + 40)}」 と 「${b.slice(Math.max(0, i - 40), i + 40)}」`;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--child") return child(argv[1], argv[2]).then(() => 0);
  let fixture = null;
  let compareWith = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--compare-with") compareWith = argv[++i];
    else if (a.startsWith("--compare-with=")) compareWith = a.slice(15);
    else if (a.startsWith("--")) {
      console.error(`不明なオプション: ${a}`);
      return 2;
    } else fixture = a;
  }
  if (!fixture) {
    console.error("フィクスチャフォルダを指定してください（例: tests/fixtures/skill-analysis-sample）");
    return 2;
  }
  let exportPath = join(resolve(fixture), "export-v1.json");
  let briefPath = join(resolve(fixture), "brief.json");
  if (compareWith) {
    const d = dirname(resolve(compareWith));
    if (existsSync(join(d, "export.json"))) exportPath = join(d, "export.json");
    if (existsSync(join(d, "brief.json"))) briefPath = join(d, "brief.json");
  }
  for (const p of [exportPath, briefPath, ...(compareWith ? [resolve(compareWith)] : [])])
    if (!existsSync(p)) {
      console.error(`入力がありません: ${p}`);
      return 2;
    }

  const runs = [1, 2].map((n) => {
    const r = spawnSync(process.execPath, [SELF, "--child", exportPath, briefPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`計算 ${n} 回目が失敗しました: ${r.stderr}`);
    return r.stdout;
  });
  console.log(`入力: ${exportPath}`);
  if (runs[0] !== runs[1]) {
    console.error(`不一致: 同じ export からの2回の計算結果が異なります（${firstDiff(runs[0], runs[1])}）`);
    return 1;
  }
  console.log(`一致: 別プロセスで2回計算した結果 JSON（report_html 除く・${runs[0].length}文字）が完全一致しました`);

  if (compareWith) {
    const { reproducibleView, canonicalJson } = await import(COMPUTE);
    const posted = canonicalJson(reproducibleView(JSON.parse(readFileSync(resolve(compareWith), "utf8"))));
    if (posted !== runs[0]) {
      console.error(`不一致: 送信済みの結果 JSON と再計算の結果が異なります（${firstDiff(posted, runs[0])}）`);
      return 1;
    }
    console.log(`一致: 送信済みの結果 JSON（${compareWith}）と再計算の結果が完全一致しました`);
  }
  return 0;
}

try {
  process.exitCode = await main();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
