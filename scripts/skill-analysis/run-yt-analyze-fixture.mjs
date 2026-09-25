#!/usr/bin/env node
// /yt-analyze の手順（依頼作成 → export → 進捗 → report-design-system init/build → 結果送信）をフィクスチャで通す。
//
//   node scripts/skill-analysis/run-yt-analyze-fixture.mjs tests/fixtures/skill-analysis-sample [--request-id A-0001]
//        [--base-url http://localhost:8791] [--token yta_...] [--with-stub[=201|403]] [--work-root <dir>]
//
// - 位置引数のフィクスチャフォルダの brief.json・analysis.mjs を雛形として使う（export は API から取得）。
// - --request-id を省くと POST /api/skill/requests で依頼を作る。403（権限なし）などは理由を表示して非0終了。
// - --with-stub は tests/skill-analysis/fixtures/skill-requests-stub-server.mjs を子プロセスで起動し、そこへ接続する
//   （=403 は依頼作成を 403 で断るモード）。
// 終了コード: 0=成功 / 1=その他 / 2=引数誤り / 3=接続不可 / 4=401・403 / 5=404 / 6=409（取消）
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL = join(REPO, ".claude", "skills", "yt-analyze");
const STUB = join(REPO, "tests", "skill-analysis", "fixtures", "skill-requests-stub-server.mjs");

function parseArgs(argv) {
  const o = { fixture: null, requestId: null, baseUrl: null, token: null, stub: null, workRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (name) => {
      if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
      if (i + 1 >= argv.length) throw new Error(`${name} に値がありません`);
      return argv[++i];
    };
    if (a === "--with-stub") o.stub = "201";
    else if (a.startsWith("--with-stub=")) o.stub = a.slice(12);
    else if (a === "--request-id" || a.startsWith("--request-id=")) o.requestId = val("--request-id");
    else if (a === "--base-url" || a.startsWith("--base-url=")) o.baseUrl = val("--base-url");
    else if (a === "--token" || a.startsWith("--token=")) o.token = val("--token");
    else if (a === "--work-root" || a.startsWith("--work-root=")) o.workRoot = val("--work-root");
    else if (a.startsWith("--")) throw new Error(`不明なオプション: ${a}`);
    else if (!o.fixture) o.fixture = a;
    else throw new Error(`余分な引数: ${a}`);
  }
  if (!o.fixture) throw new Error("フィクスチャフォルダを指定してください（例: tests/fixtures/skill-analysis-sample）");
  if (o.stub && !["201", "403"].includes(o.stub)) throw new Error(`--with-stub は 201・403 のどちらかです（指定: ${o.stub}）`);
  return o;
}

/** スタブを起動し、stdout の STUB_URL= 行を待つ */
function startStub(mode, exportPath) {
  return new Promise((ok, ng) => {
    const child = spawn(process.execPath, [STUB, "0", `--mode=${mode}`, "--export", exportPath], { stdio: ["ignore", "pipe", "inherit"] });
    const timer = setTimeout(() => ng(new Error("スタブが5秒以内に起動しませんでした")), 5000);
    child.once("exit", (c) => ng(new Error(`スタブが終了しました（${c}）`)));
    createInterface({ input: child.stdout }).on("line", (line) => {
      const m = line.match(/^STUB_URL=(\S+)/);
      if (m) {
        clearTimeout(timer);
        ok({ child, url: m[1] });
      }
    });
  });
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`引数の誤り: ${e.message}`);
    return 2;
  }
  const fixture = resolve(o.fixture);
  for (const f of ["brief.json", "analysis.mjs"])
    if (!existsSync(join(fixture, f))) {
      console.error(`フィクスチャに ${f} がありません: ${fixture}`);
      return 2;
    }
  const { createSkillClient, configFromEnv, SkillApiError } = await import(pathToFileURL(join(SKILL, "lib", "client.mjs")).href);
  const { runYtAnalyze } = await import(pathToFileURL(join(SKILL, "lib", "pipeline.mjs")).href);

  let stub = null;
  try {
    if (o.stub) {
      stub = await startStub(o.stub, join(fixture, "export-v1.json"));
      console.log(`スタブを起動しました: ${stub.url}（依頼作成モード ${o.stub}）`);
    }
    const cfg = configFromEnv(process.env, {
      ...(stub ? { baseUrl: stub.url } : o.baseUrl ? { baseUrl: o.baseUrl } : {}),
      // スタブもサーバと同じトークン形式（yta_ + 16〜200 文字）だけを受ける
      ...(o.token ? { token: o.token } : stub && !process.env.YTA_SKILL_TOKEN ? { token: "yta_fixture_token_for_stub" } : {}),
    });
    const workRoot = o.workRoot ? resolve(o.workRoot) : mkdtempSync(join(tmpdir(), "yt-analyze-fixture-"));
    const api = createSkillClient(cfg);
    const r = await runYtAnalyze({ api, requestId: o.requestId, workRoot, templateDir: fixture, quiet: true });
    console.log(`分析フォルダ: ${r.dir}`);
    console.log(`レポート HTML: ${r.htmlPath}`);
    console.log(`送信した結果 JSON: ${r.postedPath}`);
    console.log(`判定: ${r.report.results.status}／${r.report.conclusion}`);
    return 0;
  } catch (e) {
    if (e instanceof SkillApiError) {
      console.error(e.explain());
      return e.exitCode;
    }
    console.error(`失敗しました: ${e.message}`);
    return 1;
  } finally {
    stub?.child.kill("SIGTERM");
  }
}

process.exitCode = await main();
