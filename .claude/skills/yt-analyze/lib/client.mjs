// /yt-analyze のスキル連携 API クライアント（正本 system-spec/backend.md の /api/skill/*）。
// Node 標準の fetch だけを使う。トークンは Authorization ヘッダにだけ載せ、ログ・例外文に出さない。
//
//   const api = createSkillClient({ baseUrl, token });
//   const { requestId } = await api.createRequest();            // POST /api/skill/requests（request_id 無し起動）
//   const exp = await api.getExport(requestId);                  // GET  /api/skill/export?request_id=
//   await api.patchRequest(requestId, { progress: 10, stage: 1 }); // PATCH /api/skill/requests/:id
//   const r = await api.postReport(report, exp.idempotency_key); // POST /api/skill/reports（Idempotency-Key 付き）

export const SKILL_API_VERSION = "1";
export const DEFAULT_BASE_URL = "http://localhost:8791";
const CREATE_REQUEST = "依頼の作成 (POST /api/skill/requests)";

/** 環境変数から接続設定を作る（YTA_BASE_URL 既定 http://localhost:8791、YTA_SKILL_TOKEN 必須） */
export function configFromEnv(env = process.env, overrides = {}) {
  const baseUrl = (overrides.baseUrl ?? env.YTA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const token = overrides.token ?? env.YTA_SKILL_TOKEN ?? "";
  return { baseUrl, token };
}

/** API 呼出しの失敗。exitCode はスキル・runner がそのまま終了コードに使う（常に非0） */
export class SkillApiError extends Error {
  constructor({ status, code, message, hint, operation }) {
    super(message);
    this.name = "SkillApiError";
    this.status = status;
    this.code = code ?? null;
    this.hint = hint ?? null;
    this.operation = operation;
    this.exitCode = status === 0 ? 3 : status === 401 || status === 403 ? 4 : status === 404 ? 5 : status === 409 ? 6 : 1;
  }
  /** 利用者に見せる1〜2行（トークンは含めない） */
  explain() {
    return [`${this.operation} に失敗しました（HTTP ${this.status || "接続不可"}${this.code ? ` ${this.code}` : ""}）: ${this.message}`, this.hint ? `対処: ${this.hint}` : null]
      .filter(Boolean)
      .join("\n");
  }
}

/** 状態コードごとの既定の理由と対処（サーバが {error:{message,hint}} を返せばそちらを優先する） */
function defaultReason(operation, status) {
  if (operation === CREATE_REQUEST && status === 403)
    return {
      message: "このトークンの持ち主には依頼を作る権限（content.write: オーナー/編集者）がありません",
      hint: "閲覧者のトークンでは実行できません。オーナーか編集者のトークンを設定画面で発行して使ってください",
    };
  switch (status) {
    case 0:
      return { message: "サーバに接続できません", hint: "YTA_BASE_URL とサーバの起動状態を確認してください" };
    case 400:
      return { message: "リクエストの形式が正しくありません", hint: "X-Skill-Api-Version と送信内容を確認してください" };
    case 401:
      return { message: "トークンが無効か失効しています", hint: "設定画面で個人トークンを発行し直し、YTA_SKILL_TOKEN に設定してください" };
    case 403:
      return { message: "このトークンでは実行できません", hint: "トークンの持ち主の役割とテナントを確認してください" };
    case 404:
      return { message: "対象が見つかりません", hint: "request_id と接続先を確認してください" };
    case 409:
      return { message: "依頼が取消されたか、既に完了しています", hint: "取消されました。AI分析画面で新しい依頼を作ってください" };
    case 422:
      return { message: "結果 JSON が検証に通りません", hint: "エラー内容の項目を analysis.mjs 側で直してから再送してください" };
    case 429:
      return { message: "依頼が多すぎます", hint: "1分ほど待ってから再実行してください" };
    default:
      return { message: "サーバでエラーが起きました", hint: "時間をおいて再実行してください" };
  }
}

export function createSkillClient({ baseUrl = DEFAULT_BASE_URL, token, fetchImpl = globalThis.fetch } = {}) {
  if (!token || !/^yta_/.test(token))
    throw new SkillApiError({
      status: 401,
      code: "TOKEN_MISSING",
      message: "個人トークン（yta_ で始まる）が設定されていません",
      hint: "設定画面で発行したトークンを YTA_SKILL_TOKEN に設定してください",
      operation: "設定の確認",
    });
  const root = String(baseUrl).replace(/\/+$/, "");

  async function call(operation, method, path, { body, headers = {} } = {}) {
    let res;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "x-skill-api-version": SKILL_API_VERSION,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const d = defaultReason(operation, 0);
      throw new SkillApiError({ status: 0, code: "NETWORK", message: `${d.message}（${err.cause?.code ?? err.message}）`, hint: d.hint, operation });
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const d = defaultReason(operation, res.status);
      const e = json?.error ?? {};
      // 依頼作成の 403 は、サーバの汎用の理由より「閲覧者のトークン」という具体的な理由を優先して表示する
      const preferDefault = operation === CREATE_REQUEST && res.status === 403;
      throw new SkillApiError({
        status: res.status,
        code: e.code ?? null,
        message: preferDefault ? `${d.message}${e.message ? `（サーバ: ${e.message}）` : ""}` : (e.message ?? d.message),
        hint: preferDefault ? d.hint : (e.hint ?? d.hint),
        operation,
      });
    }
    return { status: res.status, body: json };
  }

  return {
    baseUrl: root,
    /** request_id 無し起動の分岐: 個人トークンで依頼を作る（期間・指示は任意。既定はサーバ側で最新28日） */
    async createRequest(input = {}) {
      const body = {};
      for (const k of ["period_start", "period_end", "instruction"]) if (input[k]) body[k] = input[k];
      const r = await call(CREATE_REQUEST, "POST", "/api/skill/requests", { body });
      const requestId = r.body?.requestId;
      if (typeof requestId !== "string" || !requestId)
        throw new SkillApiError({ status: r.status, code: "BAD_RESPONSE", message: "応答に requestId がありません", operation: CREATE_REQUEST });
      return { requestId, body: r.body };
    },
    /** 書き出し。結果の送信に使う idempotency_key はサーバが決めるので、無ければここで止める */
    async getExport(requestId) {
      const operation = "書き出しの取得 (GET /api/skill/export)";
      const r = await call(operation, "GET", `/api/skill/export?request_id=${encodeURIComponent(requestId)}`);
      if (typeof r.body?.idempotency_key !== "string" || !r.body.idempotency_key)
        throw new SkillApiError({ status: r.status, code: "BAD_RESPONSE", message: "応答に idempotency_key がありません", operation });
      return r.body;
    },
    /** 進捗 {progress, stage} または失敗 {status:"失敗", error} */
    async patchRequest(requestId, body) {
      const r = await call("進捗の報告 (PATCH /api/skill/requests/:id)", "PATCH", `/api/skill/requests/${encodeURIComponent(requestId)}`, { body });
      return r.body;
    },
    /** 失敗の報告は本来のエラーを隠さないよう、報告自体の失敗は握りつぶして false を返す */
    async reportFailure(requestId, message) {
      try {
        await this.patchRequest(requestId, { status: "失敗", error: String(message).split("\n")[0].slice(0, 500) || "不明なエラー" });
        return true;
      } catch {
        return false;
      }
    },
    /** 結果 JSON を送る。idempotencyKey は export の idempotency_key。201=新しい版、200=同じキーの重複（版は増えない） */
    async postReport(report, idempotencyKey) {
      const r = await call("結果の送信 (POST /api/skill/reports)", "POST", "/api/skill/reports", {
        body: report,
        headers: { "idempotency-key": idempotencyKey },
      });
      return { created: r.status === 201, status: r.status, body: r.body, idempotencyKey };
    },
  };
}
