// Google OAuth（Authorization Code + PKCE・state・nonce）とセッション Cookie・同意・開発専用ログイン
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/index";
import { base64url, pkceChallenge } from "../../src/lib/crypto";
import { call, count, uniqueEmail } from "./helpers";

function fakeIdToken(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: "RS256" })}.${enc(claims)}.sig`;
}

async function startLogin(query = "consent=1") {
  const res = await call(`/api/auth/login?${query}`);
  const location = res.headers.get("location") ?? "";
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return { res, location, cookie, url: location.startsWith("http") ? new URL(location) : null };
}

afterEach(() => vi.restoreAllMocks());

describe("Google ログイン", () => {
  it("同意なしのログイン開始は同意を求めてログイン画面へ戻す", async () => {
    const { res, location } = await startLogin("");
    expect(res.status).toBe(302);
    expect(location).toBe("/login?error=CONSENT_REQUIRED");
  });

  it("ログイン開始は PKCE(S256)・state・nonce 付きで Google へ送り、署名付き短命 Cookie を置く", async () => {
    const { res, url } = await startLogin();
    expect(res.status).toBe(302);
    expect(url?.origin + (url?.pathname ?? "")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url?.searchParams.get("scope")).toBe("openid email");
    expect(url?.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url?.searchParams.get("response_type")).toBe("code");
    expect(url?.searchParams.get("state")?.length).toBeGreaterThanOrEqual(43);
    expect(url?.searchParams.get("redirect_uri")).toBe("http://localhost/api/auth/callback");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^yta_oauth=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\/api\/auth/);
  });

  it("state が一致しないコールバックは拒否する", async () => {
    const { cookie } = await startLogin();
    const res = await call("/api/auth/callback?code=abc&state=wrong", { cookie });
    expect(res.headers.get("location")).toBe("/login?error=OAUTH_STATE_MISMATCH");
  });

  it("Cookie がないコールバック（別ブラウザからの注入）は拒否する", async () => {
    const res = await call("/api/auth/callback?code=abc&state=abc");
    expect(res.headers.get("location")).toBe("/login?error=OAUTH_STATE_MISMATCH");
  });

  it("正しいコールバックでコードを交換し、初回テナントを作ってセッション Cookie を発行する", async () => {
    const { url, cookie } = await startLogin();
    const state = url?.searchParams.get("state") ?? "";
    const nonce = url?.searchParams.get("nonce") ?? "";
    const challenge = url?.searchParams.get("code_challenge") ?? "";
    const email = uniqueEmail("oauth");
    let sentVerifier = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://oauth2.googleapis.com/token");
      const form = new URLSearchParams(String(init?.body));
      sentVerifier = form.get("code_verifier") ?? "";
      expect(form.get("client_secret")).toBe(env.GOOGLE_CLIENT_SECRET);
      return Response.json({
        id_token: fakeIdToken({
          iss: "https://accounts.google.com",
          aud: env.GOOGLE_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          nonce,
          sub: `google-${email}`,
          email,
          email_verified: true,
        }),
      });
    });
    const res = await call(`/api/auth/callback?code=the-code&state=${state}`, {
      cookie,
      env: { MAX_TENANTS: "1000000" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    // PKCE: 送った verifier から計算した challenge が、認可要求の challenge と一致する
    expect(await pkceChallenge(sentVerifier)).toBe(challenge);
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("yta_session=")) ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=2592000/);
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = ?1", email)).toBe(1);
    const me = await call("/api/me", { cookie: setCookie.split(";")[0] });
    expect(me.status).toBe(200);
  });

  it("aud が違う・nonce が違う・メール未確認の ID トークンは受け付けない", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ aud: "other-client" }, "OAUTH_FAILED"],
      [{ nonce: "other-nonce" }, "OAUTH_FAILED"],
      [{ exp: 1 }, "OAUTH_FAILED"],
      [{ email_verified: false }, "EMAIL_NOT_VERIFIED"],
    ];
    for (const [override, code] of cases) {
      const { url, cookie } = await startLogin();
      const email = uniqueEmail("bad");
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        Response.json({
          id_token: fakeIdToken({
            iss: "https://accounts.google.com",
            aud: env.GOOGLE_CLIENT_ID,
            exp: Math.floor(Date.now() / 1000) + 3600,
            nonce: url?.searchParams.get("nonce"),
            sub: `google-${email}`,
            email,
            email_verified: true,
            ...override,
          }),
        }),
      );
      const res = await call(`/api/auth/callback?code=c&state=${url?.searchParams.get("state")}`, {
        cookie,
      });
      expect(res.headers.get("location")).toBe(`/login?error=${code}`);
      expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = ?1", email)).toBe(0);
    }
  });

  it("token endpoint の通信失敗は OAUTH_FAILED としてログイン画面へ戻す", async () => {
    const { url, cookie } = await startLogin();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("network unavailable"));

    const res = await call(`/api/auth/callback?code=c&state=${url?.searchParams.get("state")}`, {
      cookie,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=OAUTH_FAILED");
  });

  it("token endpoint の不正 JSON は OAUTH_FAILED としてログイン画面へ戻す", async () => {
    const { url, cookie } = await startLogin();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    );

    const res = await call(`/api/auth/callback?code=c&state=${url?.searchParams.get("state")}`, {
      cookie,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=OAUTH_FAILED");
  });
});

describe("セッション Cookie（https）", () => {
  it("https では __Host- 接頭辞と Secure を付ける", async () => {
    const res = await app.request(
      "https://localhost/api/auth/dev-login",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-requested-with": "yta" },
        body: JSON.stringify({ email: uniqueEmail("https") }),
      },
      { ...env, DEV_LOGIN: "1", MAX_TENANTS: "1000000" },
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^__Host-yta_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/Path=\//);
  });
});

describe("開発専用ログイン", () => {
  it("DEV_LOGIN が無ければ 404（本番の既定）", async () => {
    const res = await call("/api/auth/dev-login", {
      method: "POST",
      body: { email: uniqueEmail("dev") },
    });
    expect(res.status).toBe(404);
  });

  it("DEV_LOGIN=1 でも localhost 以外のホストでは 404", async () => {
    const res = await app.request(
      "https://youtube-analytics.example.workers.dev/api/auth/dev-login",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-requested-with": "yta" },
        body: JSON.stringify({ email: uniqueEmail("dev") }),
      },
      { ...env, DEV_LOGIN: "1" },
    );
    expect(res.status).toBe(404);
  });

  it("DEV_LOGIN=1 かつ localhost ならログインできる", async () => {
    const res = await call("/api/auth/dev-login", {
      method: "POST",
      body: { email: uniqueEmail("dev") },
      env: { DEV_LOGIN: "1", MAX_TENANTS: "1000000" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "tenant_created", next: "/" });
  });
});
