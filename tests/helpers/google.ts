// テスト共通: Google（token / channels.list / revoke）の偽物と、YouTube 連携手続き（OAuth 開始 → 戻り → チャンネル選択）の一連の操作
import { expect, vi } from "vitest";
import {
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  YOUTUBE_CHANNELS_URL,
} from "../../src/adapters/google-youtube";
import { READONLY_SCOPES } from "../../src/domain/google-scopes";
import type { Bindings } from "../../src/env";
import { call, type LoggedIn } from "../platform/helpers";

export type Owner = LoggedIn & { tenantId: string };

export interface FakeChannel {
  id: string;
  title?: string;
  subscribers?: number;
}

export interface GoogleFake {
  channels: FakeChannel[];
  scopes: string[];
  refreshToken: string | null;
  revoked: string[];
  tokenCalls: number;
  /** token エンドポイントへ送られたフォーム（client_id / client_secret の確認用） */
  tokenRequests: URLSearchParams[];
  /** 指定すると token エンドポイントが 401 {error} を返す（例: invalid_client） */
  tokenError: string | null;
}

/** fetch を Google の偽物に差し替える。afterEach(vi.restoreAllMocks) で元に戻す */
export function fakeGoogle(init: Partial<GoogleFake> = {}): GoogleFake {
  const fake: GoogleFake = {
    channels: [{ id: "UC_default", title: "既定チャンネル", subscribers: 1200 }],
    scopes: [...READONLY_SCOPES],
    refreshToken: `refresh-${crypto.randomUUID()}`,
    revoked: [],
    tokenCalls: 0,
    tokenRequests: [],
    tokenError: null,
    ...init,
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, reqInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(GOOGLE_TOKEN_URL)) {
      fake.tokenCalls += 1;
      fake.tokenRequests.push(new URLSearchParams(String(reqInit?.body ?? "")));
      if (fake.tokenError) return Response.json({ error: fake.tokenError }, { status: 401 });
      return Response.json({
        access_token: "access-token",
        ...(fake.refreshToken ? { refresh_token: fake.refreshToken } : {}),
        scope: fake.scopes.join(" "),
        token_type: "Bearer",
        expires_in: 3599,
      });
    }
    if (url.startsWith(YOUTUBE_CHANNELS_URL)) {
      return Response.json({
        items: fake.channels.map((c) => ({
          id: c.id,
          snippet: {
            title: c.title ?? c.id,
            thumbnails: { default: { url: `https://yt3.example.com/${c.id}.jpg` } },
          },
          statistics: { subscriberCount: String(c.subscribers ?? 0) },
        })),
      });
    }
    if (url.startsWith(GOOGLE_REVOKE_URL)) {
      const body = new URLSearchParams(String(reqInit?.body ?? ""));
      fake.revoked.push(body.get("token") ?? "");
      return new Response(null, { status: 200 });
    }
    throw new Error(`想定外の外部呼び出し: ${url}`);
  });
  return fake;
}

/** テスト用のテナント Google クライアント（qa-087）。形式チェックを通る値 */
export const TEST_CLIENT = {
  clientId: "123456789012-testclient0a1b2c3d.apps.googleusercontent.com",
  clientSecret: "GOCSPX-test-secret-0123456789",
};

/**
 * 選択中のテナントに Google クライアントを登録する。同じクライアント ID の登録し直しは
 * 連携状態を変えないので、何度呼んでもよい
 */
export async function registerGoogleClient(user: LoggedIn, client = TEST_CLIENT) {
  const res = await call("/api/youtube/google-client", {
    method: "PUT",
    cookie: user.cookie,
    body: client,
  });
  expect(res.status).toBe(200);
}

/** POST で OAuth を始め、Google の同意画面 URL から state を取り出す（クライアント未登録なら先に登録する） */
export async function startOAuth(
  user: LoggedIn,
  path = "/api/youtube/connect",
  opts: { env?: Partial<Bindings>; body?: unknown; method?: string } = {},
) {
  await registerGoogleClient(user);
  const res = await call(path, {
    method: opts.method ?? "POST",
    cookie: user.cookie,
    body: opts.body ?? {},
    env: opts.env,
  });
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  const parsed = new URL(url);
  return { url: parsed, state: parsed.searchParams.get("state") ?? "" };
}

/** Google からの戻り（GET /api/oauth/callback）。リダイレクト先のパスを返す */
export async function callback(
  user: LoggedIn,
  query: Record<string, string>,
  env?: Partial<Bindings>,
): Promise<string> {
  const qs = new URLSearchParams(query).toString();
  const res = await call(`/api/oauth/callback?${qs}`, { cookie: user.cookie, env });
  expect(res.status).toBe(302);
  return res.headers.get("location") ?? "";
}

/** 連携開始 → 戻り → チャンネル選択までを通す */
export async function linkChannel(owner: Owner, channelId: string) {
  const { state } = await startOAuth(owner);
  expect(await callback(owner, { code: "code", state })).toBe("/settings?select=channel");
  return call("/api/youtube/channel", {
    method: "POST",
    cookie: owner.cookie,
    body: { channelId },
  });
}
