// テスト共通: API 呼び出しと、ログイン済み利用者・テナント・メンバーの用意
import { env } from "cloudflare:workers";
import { expect } from "vitest";
import type { Bindings } from "../../src/env";
import { app } from "../../src/index";
import { loginWithIdentity } from "../../src/usecases/session";

export const ORIGIN = "http://localhost";

export interface CallOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  /** false で CSRF 用ヘッダを付けない */
  csrf?: boolean;
  env?: Partial<Bindings>;
}

export async function call(path: string, opts: CallOptions = {}): Promise<Response> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && opts.csrf !== false) headers["x-requested-with"] = "yta";
  return app.request(
    `${ORIGIN}${path}`,
    { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) },
    { ...env, ...opts.env },
  );
}

export async function expectError(res: Response, status: number, code: string): Promise<void> {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error: { code: string; message: string; hint: string } };
  expect(body.error.code).toBe(code);
  expect(body.error.message).toEqual(expect.any(String));
  expect(body.error.hint).toEqual(expect.any(String));
}

let seq = 0;
export function uniqueEmail(prefix = "user"): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

export interface LoggedIn {
  cookie: string;
  userId: string;
  tenantId: string | null;
  email: string;
  outcome: string;
  inviteError?: string;
}

export async function login(
  email: string,
  opts: { inviteToken?: string; env?: Partial<Bindings>; emailVerified?: boolean } = {},
): Promise<LoggedIn> {
  const result = await loginWithIdentity(
    { env: { ...env, ...opts.env }, now: new Date() },
    { sub: `test:${email}`, email, emailVerified: opts.emailVerified ?? true },
    { inviteToken: opts.inviteToken },
  );
  return {
    cookie: `yta_session=${result.sessionId}`,
    userId: result.userId,
    tenantId: result.tenantId,
    email,
    outcome: result.outcome,
    inviteError: result.inviteError,
  };
}

/** 初回ログインで自分のテナントを持つ owner（上限は十分大きくする） */
export async function newOwner(prefix = "owner"): Promise<LoggedIn & { tenantId: string }> {
  const user = await login(uniqueEmail(prefix), { env: { MAX_TENANTS: "1000000" } });
  if (!user.tenantId) throw new Error("テナントが作られませんでした");
  return { ...user, tenantId: user.tenantId };
}

export async function issueInvite(
  owner: LoggedIn & { tenantId: string },
  email: string,
  role: "editor" | "viewer",
) {
  const res = await call(`/api/tenants/${owner.tenantId}/invites`, {
    method: "POST",
    cookie: owner.cookie,
    body: { email, role },
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { inviteId: string; url: string; expiresAt: string };
  const token = new URL(body.url).searchParams.get("token");
  if (!token) throw new Error("招待 URL に token がありません");
  return { ...body, token };
}

/** owner のテナントへ招待経由でメンバーを追加し、そのメンバーのログイン状態を返す */
export async function addMember(owner: LoggedIn & { tenantId: string }, role: "editor" | "viewer") {
  const email = uniqueEmail(role);
  const { token } = await issueInvite(owner, email, role);
  const member = await login(email, { inviteToken: token });
  expect(member.outcome).toBe("invite_accepted");
  expect(member.tenantId).toBe(owner.tenantId);
  return member as LoggedIn & { tenantId: string };
}

export async function count(sql: string, ...params: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
