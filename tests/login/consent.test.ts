// A3・A4: 同意の必須化・規約の版の照合・consent_records への追記
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSIONS } from "../../src/usecases/login-consent";
import { call, count, expectError, uniqueEmail } from "../platform/helpers";
import { finish, start, startLogin } from "./oauth";

afterEach(() => vi.restoreAllMocks());

async function consents(email: string) {
  const { results } = await env.DB.prepare(
    `SELECT c.terms_version, c.privacy_version, c.source FROM consent_records c
       JOIN users u ON u.user_id = c.user_id WHERE u.email = ?1 ORDER BY c.consented_at, c.rowid`,
  )
    .bind(email)
    .all<{ terms_version: string; privacy_version: string; source: string }>();
  return results;
}

describe("A3 同意してからログインする", () => {
  it("consent=1 がなければ CONSENT_REQUIRED でログイン画面へ戻す", async () => {
    const { location } = await start(`/api/auth/login?terms_version=${LEGAL_VERSIONS.terms}`);
    expect(location).toBe("/login?error=CONSENT_REQUIRED");
  });

  it("ログインが成功すると現行版の同意が1行追記され、2回目も追記される（更新しない）", async () => {
    const email = uniqueEmail("consent");
    const id = { sub: `g-${email}`, email };
    const first = await finish(await startLogin(), id, { scope: "openid email" });
    expect(first.headers.get("location")).toBe("/");
    expect(await consents(email)).toEqual([
      {
        terms_version: LEGAL_VERSIONS.terms,
        privacy_version: LEGAL_VERSIONS.privacy,
        source: "login",
      },
    ]);
    await finish(await startLogin(), id, { scope: "openid email" });
    const rows = await consents(email);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.source).toBe("login");
  });

  it("失敗したログイン（state 不一致）では同意を記録しない", async () => {
    const before = await count("SELECT COUNT(*) AS n FROM consent_records");
    const { cookie } = await startLogin();
    await call("/api/auth/callback?code=c&state=wrong", { cookie });
    expect(await count("SELECT COUNT(*) AS n FROM consent_records")).toBe(before);
  });
});

describe("A4 規約の版が変わったら再同意させる", () => {
  it("版がない・古い /login は CONSENT_OUTDATED でログイン画面へ戻す", async () => {
    for (const q of [
      "consent=1",
      `consent=1&terms_version=2000-01-01&privacy_version=${LEGAL_VERSIONS.privacy}`,
      `consent=1&terms_version=${LEGAL_VERSIONS.terms}&privacy_version=2000-01-01`,
    ]) {
      const { res, location } = await start(`/api/auth/login?${q}`);
      expect(res.status).toBe(302);
      expect(location).toBe("/login?error=CONSENT_OUTDATED");
    }
  });

  it("前回と違う版に同意した場合は source=reconsent で記録する", async () => {
    const email = uniqueEmail("reconsent");
    const id = { sub: `g-${email}`, email };
    await finish(await startLogin(), id, { scope: "openid email" });
    // 前回の同意が旧版だった状態を作る
    await env.DB.prepare(
      `UPDATE consent_records SET terms_version = '2000-01-01'
        WHERE user_id = (SELECT user_id FROM users WHERE email = ?1)`,
    )
      .bind(email)
      .run();
    await finish(await startLogin(), id, { scope: "openid email" });
    const rows = await consents(email);
    expect(rows.at(-1)).toEqual({
      terms_version: LEGAL_VERSIONS.terms,
      privacy_version: LEGAL_VERSIONS.privacy,
      source: "reconsent",
    });
  });
});

describe("開発用ログインでの同意", () => {
  const devEnv = { DEV_LOGIN: "1", MAX_TENANTS: "1000000" };

  it("画面から送られた現行版の同意を記録する", async () => {
    const email = uniqueEmail("devc");
    const res = await call("/api/auth/dev-login", {
      method: "POST",
      body: { email, termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy },
      env: devEnv,
    });
    expect(res.status).toBe(200);
    expect(await consents(email)).toHaveLength(1);
  });

  it("古い版は CONSENT_OUTDATED で拒否する", async () => {
    const res = await call("/api/auth/dev-login", {
      method: "POST",
      body: {
        email: uniqueEmail("devc"),
        termsVersion: "2000-01-01",
        privacyVersion: "2000-01-01",
      },
      env: devEnv,
    });
    await expectError(res, 400, "CONSENT_OUTDATED");
  });
});
