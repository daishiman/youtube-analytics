// 認証ゲート（未ログイン 401）・CSRF 対策・TenantContext の組立てと、route 共通の本文の読み取り
import type { Context, MiddlewareHandler } from "hono";
import { REPORT_BODY_MAX_BYTES, SKILL_API_VERSION } from "../domain/analysis";
import type { TenantContext } from "../domain/tenant-context";
import type { Bindings } from "../env";
import { AppError } from "../lib/errors";
import { parseJsonText } from "../lib/json-text";
import { InvalidReport } from "../usecases/analysis-reports";
import type { Deps } from "../usecases/common";
import { type CurrentSession, resolveSession } from "../usecases/session";
import { resolveSkillToken } from "../usecases/skill-tokens";
import { readSessionCookie } from "./cookies";

export type AppEnv = {
  Bindings: Bindings;
  Variables: { deps: Deps; session: CurrentSession; skill: TenantContext };
};

/** ログイン不要の API。これ以外の /api/* はすべてセッション必須（受入 A1） */
export function isPublicApi(path: string): boolean {
  return path === "/api/health" || path.startsWith("/api/auth/");
}

/**
 * Claude Code スキル連携 API。セッションではなく Bearer 個人トークンで認証する（skillAuth）。
 * `/api/skill-tokens`（セッションで発行・失効する画面 API）とは別の経路なので末尾の / まで見る
 */
export function isSkillApi(path: string): boolean {
  return path.startsWith("/api/skill/");
}

export const depsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("deps", { env: c.env, now: new Date() });
  await next();
};

export const authGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (isPublicApi(c.req.path) || isSkillApi(c.req.path)) return next();
  const sessionId = readSessionCookie(c);
  const session = sessionId ? await resolveSession(c.get("deps"), sessionId) : null;
  if (!session) {
    // Google から戻ってきた時点でセッションが切れていたら、JSON ではなくログイン画面へ戻す
    if (c.req.path === "/api/oauth/callback")
      return c.redirect("/login?error=UNAUTHENTICATED", 302);
    throw new AppError("UNAUTHENTICATED");
  }
  c.set("session", session);
  await next();
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 状態を変える要求は、画面の fetch だけが付けるヘッダ X-Requested-With: yta を必須にし、
 * Origin / Sec-Fetch-Site がある場合は同一オリジンに限る（SameSite=Lax と二重の対策）
 */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Bearer トークンは Cookie と違いブラウザが自動送信しないため、CSRF の対象外
  if (SAFE_METHODS.has(c.req.method) || isSkillApi(c.req.path)) return next();
  const origin = c.req.header("origin");
  const site = c.req.header("sec-fetch-site");
  if (
    c.req.header("x-requested-with") !== "yta" ||
    (origin && origin !== requestOrigin(c)) ||
    (site && site !== "same-origin" && site !== "none")
  ) {
    throw new AppError("CSRF_REJECTED");
  }
  await next();
};

/**
 * パスの :id と、セッションで選択中のテナントが一致するときだけ TenantContext を作る。
 * 一致しない・所属していない場合は存在を明かさず 404（受入 A3 の越境防止）
 */
export function tenantContextFor(
  c: Context<AppEnv>,
  tenantIdParam: string | undefined,
): TenantContext {
  const session = c.get("session");
  if (!session.tenantId || !session.role || session.tenantId !== tenantIdParam) {
    throw new AppError("NOT_FOUND");
  }
  return { tenantId: session.tenantId, userId: session.userId, role: session.role };
}

/** 画面 API（パスにテナント ID を取らない）の、選択中のテナントの TenantContext。未選択は NO_TENANT */
export function sessionTenant(c: Context<AppEnv>): TenantContext {
  const session = c.get("session");
  if (!session.tenantId || !session.role) throw new AppError("NO_TENANT");
  return { tenantId: session.tenantId, userId: session.userId, role: session.role };
}

/** 要求を受けたオリジン（OAuth の戻り先・プロンプトの送信先・CSRF の同一オリジン判定） */
export function requestOrigin(c: Context<AppEnv>): string {
  return new URL(c.req.url).origin;
}

export async function readJson(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    throw new AppError("VALIDATION_FAILED", "JSON の本文を送ってください");
  }
}

/**
 * スキル API と画面の結果取込の本文を文字列で読み、大きさと JSON 構文を確かめる
 * （上限は REPORT_BODY_MAX_BYTES。構文の誤りは行番号付き 422）
 */
export async function readSkillJson(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > REPORT_BODY_MAX_BYTES) throw new AppError("PAYLOAD_TOO_LARGE");
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > REPORT_BODY_MAX_BYTES)
    throw new AppError("PAYLOAD_TOO_LARGE");
  const parsed = parseJsonText(text);
  if (!parsed.ok)
    throw new InvalidReport([{ path: "", message: "JSONの構文が正しくありません" }], parsed.line);
  const v = parsed.value;
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new InvalidReport(
      [{ path: "", message: "JSONはオブジェクト（{...}）で送ってください" }],
      1,
    );
  return v as Record<string, unknown>;
}

/** /api/skill/* の Bearer 個人トークン認証。版はヘッダ X-Skill-Api-Version で明示する */
export const skillAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const version = c.req.header("x-skill-api-version");
  c.header("X-Skill-Api-Version", SKILL_API_VERSION);
  if (version !== undefined && version !== SKILL_API_VERSION)
    throw new AppError(
      "VALIDATION_FAILED",
      `X-Skill-Api-Version は ${SKILL_API_VERSION} に対応しています。/yt-analyze を更新してください`,
    );
  c.set("skill", await resolveSkillToken(c.get("deps"), c.req.header("authorization")));
  await next();
};
