// /yt-analyze の1回分の実行（依頼 → 書き出し → report-design-system init/build → 結果の送信）を手作業なしで行う。
// スキル本体の CLI（scripts/yt-analyze.mjs）と、フィクスチャ実行（scripts/skill-analysis/run-yt-analyze-fixture.mjs）が共用する。
//
//   request_id 無し: POST /api/skill/requests で依頼を作る（403=権限なし などは SkillApiError で非0終了）
//   → GET /api/skill/export → PATCH 進捗(stage1) → 週次ファネル CSV を作って report.mjs init
//   → brief.json・analysis.mjs を置く → PATCH(stage2) → report.mjs build → PATCH(stage3) → POST /api/skill/reports
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SkillApiError } from "./client.mjs";
import { funnelCsv } from "./compute.mjs";
import { weeklyFunnel } from "./funnel.mjs";
import { rdsScript, SKILL_HOME } from "./paths.mjs";

const RDS_REPORT = rdsScript("report.mjs");
export const DEFAULT_TEMPLATE_DIR = join(SKILL_HOME, "templates");

/** 分析フォルダ名（report-design-system の NAME_RE: YYYY-MM-slug、slug は英小文字・数字・ハイフン） */
export function folderParts(exp) {
  const month = String(exp.request?.period_end ?? exp.generated_at ?? "").slice(0, 7);
  const rid = String(exp.request?.request_id ?? "req").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { month, slug: `yt-${rid}-v${exp.next_version}` };
}

function runNode(args, { env, cwd, quiet } = {}) {
  const r = spawnSync(process.execPath, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8" });
  if (!quiet || r.status !== 0) {
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
  }
  return r.status ?? 1;
}

/**
 * @param {object} o
 * @param {ReturnType<import("./client.mjs").createSkillClient>} o.api
 * @param {string|null} o.requestId   省略時は POST /api/skill/requests で作る
 * @param {string} o.workRoot         分析フォルダを作る親（例: ~/yt-analyze-runs）
 * @param {string} [o.templateDir]    brief.json と analysis.mjs の雛形の場所
 * @param {object} [o.createInput]    依頼作成時の period_start/period_end/instruction（任意）
 * @param {(msg: string) => void} [o.log]
 */
export async function runYtAnalyze({ api, requestId = null, workRoot, templateDir = DEFAULT_TEMPLATE_DIR, createInput = {}, log = console.log, quiet = false }) {
  let rid = requestId;
  if (!rid) {
    log("依頼IDの指定がないため、個人トークンで依頼を作成します（POST /api/skill/requests）");
    rid = (await api.createRequest(createInput)).requestId;
    log(`依頼を作成しました: ${rid}`);
  }
  try {
    const exp = await api.getExport(rid);
    log(`書き出しを取得しました: ${exp.rows?.length ?? 0}行・履歴${exp.analysis_history?.length ?? 0}版・次の版 v${exp.next_version}`);
    await api.patchRequest(rid, { progress: 20, stage: 1 });

    const { month, slug } = folderParts(exp);
    const root = resolve(workRoot, `${rid}-v${exp.next_version}`);
    const inputDir = join(root, "inputs");
    mkdirSync(inputDir, { recursive: true });
    const csv = join(inputDir, "weekly-funnel.csv");
    writeFileSync(csv, funnelCsv(exp));
    writeFileSync(join(inputDir, "export.json"), `${JSON.stringify(exp, null, 2)}\n`);
    const dir = join(root, `${month}-${slug}`);
    if (!existsSync(dir)) {
      const code = runNode([RDS_REPORT, "init", root, month, slug, csv], { quiet });
      if (code !== 0) throw new Error(`report.mjs init が失敗しました（終了コード ${code}）`);
    }
    // YouTube 向けの差分は brief.json・analysis.mjs 側だけに置く（report-design-system は無改変）
    const brief = JSON.parse(readFileSync(join(templateDir, "brief.json"), "utf8"));
    brief.plan.範囲 = `${exp.request.period_start}〜${exp.request.period_end}`;
    // 週次ファネルが0週だと CSV は見出しだけになり、profile.json に列が無い。列を前提にする仮説は置けないので
    // 仮説0個の「単純な記述」にして判定保留の版を作る（収集が未実装・期間にデータが無いとき）
    if (weeklyFunnel(exp.rows ?? []).length === 0) {
      brief.hypotheses = [];
      log("対象期間の週次データがないため、仮説を置かずに判定保留のレポートを作ります");
    }
    writeFileSync(join(dir, "brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
    copyFileSync(join(templateDir, "analysis.mjs"), join(dir, "analysis.mjs"));
    copyFileSync(join(inputDir, "export.json"), join(dir, "export.json"));
    await api.patchRequest(rid, { progress: 50, stage: 2 });

    const code = runNode([RDS_REPORT, "build", dir], { env: { YT_ANALYZE_HOME: SKILL_HOME }, quiet });
    if (code !== 0) throw new Error(`report.mjs build が不合格です（終了コード ${code}）。analysis.mjs・brief.json を直して再実行してください`);
    const htmlPath = join(dir, `${month}-${slug}.html`);
    const report = JSON.parse(readFileSync(join(dir, "yt-result.json"), "utf8"));
    report.report_html = readFileSync(htmlPath, "utf8");
    await api.patchRequest(rid, { progress: 90, stage: 3 });

    const sent = await api.postReport(report, exp.idempotency_key);
    const postedPath = join(dir, "posted-result.json");
    writeFileSync(postedPath, `${JSON.stringify(report, null, 2)}\n`);
    log(`${sent.created ? "新しい版を保存しました" : "同じ版が保存済みでした（重複送信・版は増えていません）"}: ${rid} v${report.version}（HTTP ${sent.status}）`);
    return { requestId: rid, version: report.version, created: sent.created, status: sent.status, dir, htmlPath, postedPath, report };
  } catch (err) {
    // 取消（409）以外は依頼を「失敗」にして画面へ理由を残す
    if (!(err instanceof SkillApiError && (err.status === 409 || err.status === 401))) await api.reportFailure(rid, err.message);
    throw err;
  }
}
