#!/usr/bin/env node
// /yt-analyze の実行入口（Claude Code のスキル手順・launchd の週次起動の両方から呼ぶ）。
//
//   node .claude/skills/yt-analyze/scripts/yt-analyze.mjs [--request-id A-0001] [--work-root <dir>]
//        [--period-start YYYY-MM-DD --period-end YYYY-MM-DD] [--instruction "..."]
//
// 環境変数: YTA_BASE_URL（既定 http://localhost:8791）、YTA_SKILL_TOKEN（yta_ で始まる個人トークン。必須）、
//          YTA_WORK_ROOT（分析フォルダの置き場。既定 ~/.youtube-analytics/yt-analyze-runs）
// --request-id を省くと POST /api/skill/requests で依頼を作る（403=権限なし などは理由を表示して非0終了）。
// 終了コード: 0=成功 / 1=その他 / 2=引数誤り / 3=接続不可 / 4=401・403 / 5=404 / 6=409（取消）
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { configFromEnv, createSkillClient, SkillApiError } from "../lib/client.mjs";
import { DEFAULT_TEMPLATE_DIR, runYtAnalyze } from "../lib/pipeline.mjs";

function parseArgs(argv) {
  const o = { requestId: null, workRoot: null, createInput: {} };
  const keys = { "--request-id": "requestId", "--work-root": "workRoot", "--period-start": "period_start", "--period-end": "period_end", "--instruction": "instruction" };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const key = keys[flag];
    if (!key) throw new Error(`不明な引数: ${argv[i]}`);
    const v = inline ?? argv[++i];
    if (v === undefined || v === "") throw new Error(`${flag} に値がありません`);
    if (key === "requestId" || key === "workRoot") o[key] = v;
    else o.createInput[key] = v;
  }
  for (const k of ["period_start", "period_end"])
    if (o.createInput[k] && !/^\d{4}-\d{2}-\d{2}$/.test(o.createInput[k])) throw new Error(`${k} は YYYY-MM-DD で指定してください`);
  return o;
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`引数の誤り: ${e.message}`);
    return 2;
  }
  try {
    const api = createSkillClient(configFromEnv());
    const workRoot = resolve(o.workRoot ?? process.env.YTA_WORK_ROOT ?? join(homedir(), ".youtube-analytics", "yt-analyze-runs"));
    const r = await runYtAnalyze({ api, requestId: o.requestId, workRoot, templateDir: DEFAULT_TEMPLATE_DIR, createInput: o.createInput });
    console.log(`分析フォルダ: ${r.dir}`);
    console.log(`レポート HTML: ${r.htmlPath}`);
    console.log(`判定: ${r.report.results.status}／${r.report.conclusion}`);
    return 0;
  } catch (e) {
    if (e instanceof SkillApiError) {
      console.error(e.explain());
      return e.exitCode;
    }
    console.error(`失敗しました: ${e.message}`);
    return 1;
  }
}

process.exitCode = await main();
