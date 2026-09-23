// 認証ゲート（未ログイン 401）・CSRF 対策・TenantContext の組立て
import type { Context, MiddlewareHandler } from "hono";
import type { TenantContext } from "../domain/tenant-context";
import type { Bindings } from "../env";
import { AppError } from "../lib/errors";
import type { Deps } from "../usecases/common";
import { type CurrentSession, resolveSession } from "../usecases/session";
import { readSessionCookie } from "./cookies";

export type AppEnv = {
  Bindings: Bindings;
  Variables: { deps: Deps; session: CurrentSession };
};

/** ログイン不要の API。これ以外の /api/* はすべてセッション必須（受入 A1） */
export function isPublicApi(path: string): boolean {
  return path === "/api/health" || path.startsWith("/api/auth/");
}

export const depsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("deps", { env: c.env, now: new Date() });
  await next();
};

export const authGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (isPublicApi(c.req.path)) return next();
  const sessionId = readSessionCookie(c);
  const session = sessionId ? await resolveSession(c.get("deps"), sessionId) : null;
  if (!session) throw new AppError("UNAUTHENTICATED");
  c.set("session", session);
  await next();
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 状態を変える要求は、画面の fetch だけが付けるヘッダ X-Requested-With: yta を必須にし、
 * Origin / Sec-Fetch-Site がある場合は同一オリジンに限る（SameSite=Lax と二重の対策）
 */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header("origin");
  const site = c.req.header("sec-fetch-site");
  if (
    c.req.header("x-requested-with") !== "yta" ||
    (origin && origin !== new URL(c.req.url).origin) ||
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
