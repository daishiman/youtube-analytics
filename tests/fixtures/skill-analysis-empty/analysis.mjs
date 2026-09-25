// /yt-analyze の分析フォルダに置く再現計算（report-design-system の analysis.mjs）。
// report.mjs build がこのファイルを実行する。計算・判定・文言は /yt-analyze の lib（compute.mjs・render.mjs）に集約し、
// ここでは場所を解決して呼ぶだけにする（数字を手で書かない。同じ export.json から何度でも同じ結果になる）。
//   yt-analyze の場所: 環境変数 YT_ANALYZE_HOME → このフォルダまたは作業ディレクトリから上へ .claude/skills/yt-analyze を探す
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function locateSkillHome() {
  if (process.env.YT_ANALYZE_HOME) return resolve(process.env.YT_ANALYZE_HOME);
  for (const start of [HERE, process.cwd()]) {
    for (let d = start; ; d = dirname(d)) {
      const cand = join(d, ".claude", "skills", "yt-analyze");
      if (existsSync(join(cand, "lib", "render.mjs"))) return cand;
      if (dirname(d) === d) break;
    }
  }
  throw new Error(
    "yt-analyze の場所が分かりません。YT_ANALYZE_HOME に .claude/skills/yt-analyze の絶対パスを設定してください",
  );
}

const { runAnalysis } = await import(
  pathToFileURL(join(locateSkillHome(), "lib", "render.mjs")).href
);
await runAnalysis({ dir: HERE });
