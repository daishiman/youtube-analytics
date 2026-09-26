#!/usr/bin/env node
// 因果を断定する表現が、フィクスチャ・スキル文書・生成したレポートに無いことを確かめる。
// 判定パターンはスキルの lib/causal-language.mjs の CAUSAL_PATTERNS（report-schema.ts と同じ。一致はテストで確かめる）。
//
//   node scripts/skill-analysis/check-no-causal-language.mjs [ファイルまたはフォルダ ...]
//   （省略時: tests/fixtures と .claude/skills/yt-analyze）
// 対象拡張子: .json .html .md
// 終了コード: 0=検出なし / 1=検出あり / 2=対象が無い
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAUSAL_PATTERNS } from "../../.claude/skills/yt-analyze/lib/causal-language.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXTS = new Set([".json", ".html", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);

function* walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p).sort()) if (!SKIP_DIRS.has(name)) yield* walk(join(p, name));
  } else if (EXTS.has(extname(p).toLowerCase())) yield p;
}

function main() {
  const args = process.argv.slice(2);
  const targets = (args.length ? args : [join(REPO, "tests", "fixtures"), join(REPO, ".claude", "skills", "yt-analyze")]).map((t) => resolve(t));
  const missing = targets.filter((t) => !existsSync(t));
  if (missing.length) {
    console.error(`対象がありません: ${missing.join(", ")}`);
    return 2;
  }
  let files = 0;
  const hits = [];
  for (const t of targets)
    for (const f of walk(t)) {
      files++;
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const p of CAUSAL_PATTERNS) {
            const m = line.match(p);
            if (m) hits.push(`${relative(REPO, f).startsWith("..") ? f : relative(REPO, f)}:${i + 1}: 「${m[0]}」（${p}）`);
          }
        });
    }
  if (hits.length) {
    console.error(`因果を断定する表現が ${hits.length} 件あります（相関・目標差の表現に直してください）:`);
    for (const h of hits) console.error(`  ${h}`);
    return 1;
  }
  console.log(`検出なし: ${files}ファイルを CAUSAL_PATTERNS ${CAUSAL_PATTERNS.length}件で検査しました`);
  return 0;
}

process.exitCode = main();
