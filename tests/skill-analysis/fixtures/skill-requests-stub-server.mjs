#!/usr/bin/env node
import { readFileSync } from "node:fs";
// /api/skill/* の最小スタブ（node:http のみ）。/yt-analyze のフィクスチャ実行・launchd 起動の検証に使う。
// 応答の形・状態コード・エラーコードは実サーバ（src/http/skill-routes.ts と usecase）に合わせる。
// エラーはサーバと同じ {error:{code,message,hint}}。
//
//   node tests/skill-analysis/fixtures/skill-requests-stub-server.mjs [port=0] [--mode=201|403] [--export <export.json>]
//   （モードは env STUB_REQUESTS_MODE でも指定可。既定 201）
//
// 起動すると 1 行目に `STUB_URL=http://127.0.0.1:<port>` を stdout へ出す。
//   POST  /api/skill/requests         201 依頼（requestView と同じ camelCase。status は実行中）/ 403 FORBIDDEN
//   GET   /api/skill/export           --export の JSON（request_id・idempotency_key を差し替え。export は snake_case）
//   PATCH /api/skill/requests/:id     progress/stage/status/error を検査し、更新した依頼を返す
//   POST  /api/skill/reports          Idempotency-Key（送られた場合）を検査し 201（新規）/ 200（重複）
//   GET   /__stub/log                 受けた呼出しの記録（トークンは記録しない）
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const args = process.argv.slice(2);
let port = 0;
let mode = process.env.STUB_REQUESTS_MODE ?? "201";
let exportPath = resolve(REPO, "tests/fixtures/skill-analysis-sample/export-v1.json");
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--mode=")) mode = a.slice(7);
  else if (a === "--mode") mode = args[++i];
  else if (a.startsWith("--export=")) exportPath = resolve(a.slice(9));
  else if (a === "--export") exportPath = resolve(args[++i]);
  else if (/^\d+$/.test(a)) port = Number(a);
  else {
    console.error(`不明な引数: ${a}`);
    process.exit(2);
  }
}
if (!["201", "403"].includes(mode)) {
  console.error(`--mode は 201・403 のどちらかです（指定: ${mode}）`);
  process.exit(2);
}

/** サーバの src/lib/errors.ts と同じ状態コードと既定の文言（このスタブが返すものだけ） */
const ERRORS = {
  UNAUTHENTICATED: [401, "ログインが必要です", "ログイン画面からGoogleでログインしてください"],
  FORBIDDEN: [
    403,
    "この操作を行う権限がありません",
    "チャンネル管理のオーナーに権限の変更を依頼してください",
  ],
  NOT_FOUND: [404, "対象が見つかりません", "URLや選択中のチャンネル管理を確認してください"],
  VALIDATION_FAILED: [400, "入力内容に誤りがあります", "入力内容を確認してください"],
  INVALID_REPORT_JSON: [
    422,
    "JSONの形式が正しくありません",
    "Claude Code が出力した結果JSONをそのまま貼り付けてください",
  ],
};
const TOKEN_RE = /^Bearer\s+yta_[A-Za-z0-9_-]{16,200}\s*$/;
const REQUEST_ID_RE = /^A-\d{4,}$/;
const keyOf = (requestId, version) => `${requestId}:v${version}`;

const baseExport = JSON.parse(readFileSync(exportPath, "utf8"));
const log = [];
const requests = new Map(); // requestId -> 依頼（requestView の形）
const posted = new Map(); // Idempotency-Key -> {reportId, version, requestId}
let requestSeq = 0;
let seq = 0;

const send = (res, status, body) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-skill-api-version": "1",
  });
  res.end(JSON.stringify(body));
};
const fail = (res, code, hint, extra = {}) => {
  const [status, message, defaultHint] = ERRORS[code];
  send(res, status, { error: { ...extra, code, message, hint: hint ?? defaultHint } });
};
/** 結果 JSON の検査に通らない（サーバの InvalidReport と同じ形） */
const invalid = (res, path, message) =>
  fail(res, "INVALID_REPORT_JSON", `${message}（${path || "全体"}）`, {
    issues: [{ path, message }],
  });

/** POST・PATCH の本文（サーバの readSkillJson と同じ検査）。通らなければ problem に理由（GET は読まない） */
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (req.method === "GET") return { body: null };
  let v;
  try {
    v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return { problem: "JSONの構文が正しくありません" };
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    return { problem: "JSONはオブジェクト（{...}）で送ってください" };
  return { body: v };
}

/** 依頼1件（requestView と同じ camelCase）。--request-id で渡された ID は書き出しの期間で作る */
function requestOf(requestId, input = {}) {
  if (!requests.has(requestId)) {
    const now = new Date().toISOString();
    const r = baseExport.request;
    requests.set(requestId, {
      requestId,
      channelId: baseExport.channel?.channel_id ?? null,
      periodStart: input.period_start ?? r.period_start,
      periodEnd: input.period_end ?? r.period_end,
      instruction: input.instruction ?? r.instruction ?? "",
      status: "実行中",
      progress: 0,
      stage: 0,
      error: null,
      reportId: null,
      createdBy: "stub-user",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      finishedAt: null,
      retryOf: null,
      canceledAt: null,
      canceledBy: null,
      createdVia: "skill",
    });
  }
  return requests.get(requestId);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://stub");
  const path = url.pathname;
  if (req.method === "GET" && path === "/__stub/log") return send(res, 200, { mode, calls: log });

  const { body, problem } = await readBody(req);
  const entry = {
    method: req.method,
    path,
    query: Object.fromEntries(url.searchParams),
    body:
      path === "/api/skill/reports"
        ? { request_id: body?.request_id, version: body?.version }
        : body,
  };
  log.push(entry);

  // サーバの skillAuth と同じ順（版ヘッダ → トークン）。版ヘッダは省略できる
  const apiVersion = req.headers["x-skill-api-version"];
  if (apiVersion !== undefined && apiVersion !== "1")
    return fail(
      res,
      "VALIDATION_FAILED",
      "X-Skill-Api-Version は 1 に対応しています。/yt-analyze を更新してください",
    );
  if (!TOKEN_RE.test(req.headers.authorization ?? ""))
    return fail(
      res,
      "UNAUTHENTICATED",
      "設定画面で発行した個人トークンを Authorization: Bearer で送ってください",
    );
  if (problem) return invalid(res, "", problem);

  if (req.method === "POST" && path === "/api/skill/requests") {
    if (mode === "403") return fail(res, "FORBIDDEN");
    const r = requestOf(`A-${String(++requestSeq).padStart(4, "0")}`, {
      period_start: body.period_start,
      period_end: body.period_end,
      instruction: typeof body.instruction === "string" ? body.instruction.trim() : "",
    });
    return send(res, 201, r);
  }

  if (req.method === "GET" && path === "/api/skill/export") {
    const rid = url.searchParams.get("request_id");
    if (!rid) return fail(res, "VALIDATION_FAILED", "request_id を指定してください");
    if (!REQUEST_ID_RE.test(rid)) return fail(res, "NOT_FOUND");
    const exp = structuredClone(baseExport);
    exp.request.request_id = rid;
    exp.idempotency_key = keyOf(rid, exp.next_version);
    return send(res, 200, exp);
  }

  const m = path.match(/^\/api\/skill\/requests\/([^/]+)$/);
  if (req.method === "PATCH" && m) {
    const rid = decodeURIComponent(m[1]);
    if (!REQUEST_ID_RE.test(rid)) return fail(res, "NOT_FOUND");
    const { progress, stage, status, error } = body;
    if (progress !== undefined && !(Number.isInteger(progress) && progress >= 0 && progress <= 100))
      return fail(res, "VALIDATION_FAILED", "progress は0〜100の整数にしてください");
    if (stage !== undefined && !(Number.isInteger(stage) && stage >= 1 && stage <= 3))
      return fail(
        res,
        "VALIDATION_FAILED",
        "stage は 1:データ取得 / 2:分析・HTML生成 / 3:反映 のどれかにしてください",
      );
    if (status !== undefined && status !== "実行中" && status !== "失敗")
      return fail(
        res,
        "VALIDATION_FAILED",
        "status は 実行中 か 失敗 にしてください（完了は POST /api/skill/reports で結果を送ると付きます）",
      );
    if (error != null && (typeof error !== "string" || Array.from(error).length > 500))
      return fail(res, "VALIDATION_FAILED", "error は500文字以内の文字列にしてください");
    if (status === "失敗" && (typeof error !== "string" || !error.trim()))
      return fail(res, "VALIDATION_FAILED", "失敗にするときは error に原因を1行で書いてください");
    const now = new Date().toISOString();
    const r = Object.assign(requestOf(rid), {
      status: status ?? "実行中",
      ...(progress !== undefined ? { progress } : {}),
      ...(stage !== undefined ? { stage } : {}),
      ...(status === "失敗" ? { error: error.trim(), finishedAt: now } : {}),
      updatedAt: now,
    });
    return send(res, 200, r);
  }

  if (req.method === "POST" && path === "/api/skill/reports") {
    const rid = body.request_id;
    if (typeof rid !== "string" || !rid)
      return invalid(res, "request_id", "request_id がありません");
    const key = keyOf(rid, body.version);
    if (Number.isInteger(body.version)) {
      const sent = req.headers["idempotency-key"];
      if (sent !== undefined && sent !== key)
        return fail(res, "VALIDATION_FAILED", `Idempotency-Key は ${key} にしてください`);
      if (posted.has(key)) return send(res, 200, posted.get(key));
    }
    if (!REQUEST_ID_RE.test(rid)) return fail(res, "NOT_FOUND");
    if (!Number.isInteger(body.version) || body.version < 1)
      return invalid(res, "version", "version は1以上の整数にしてください");
    if (typeof body.report_html !== "string" || !body.report_html)
      return invalid(res, "report_html", "report_html（build 合格の単一HTML）がありません");
    const out = {
      reportId: `R-${String(++seq).padStart(4, "0")}`,
      version: body.version,
      requestId: rid,
    };
    posted.set(key, out);
    return send(res, 201, out);
  }

  return fail(res, "NOT_FOUND");
});

server.listen(port, "127.0.0.1", () => {
  const { port: p } = server.address();
  process.stdout.write(`STUB_URL=http://127.0.0.1:${p}\n`);
});
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
