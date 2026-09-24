// A2: 画面に出す権限一覧（/api/auth/config）と Google へ要求するスコープが同じ定義から出ること
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSIONS, SCOPE_SETS } from "../../src/usecases/login-consent";
import { call, issueInvite, newOwner, uniqueEmail } from "../platform/helpers";
import { startLogin, YT, YTA } from "./oauth";

interface Config {
  devLogin: boolean;
  mode: "signup" | "invite";
  scopes: { id: string; label: string; readOnly: true }[];
  termsVersion: string;
  privacyVersion: string;
  inviteTenantName?: string;
}

async function config(query = ""): Promise<Config> {
  const res = await call(`/api/auth/config${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Config;
}

afterEach(() => vi.restoreAllMocks());

describe("A2 権限表示と要求スコープの一致", () => {
  it("新規ログインの config は読み取り専用の3行と現行の規約の版を返す", async () => {
    const c = await config();
    expect(c.mode).toBe("signup");
    expect(c.devLogin).toBe(false);
    expect(c.scopes.map((s) => s.label)).toEqual([
      "YouTubeチャンネル情報の閲覧",
      "YouTube Analyticsレポートの閲覧",
      "メールアドレス",
    ]);
    expect(c.scopes.every((s) => s.readOnly === true)).toBe(true);
    expect(c.termsVersion).toBe(LEGAL_VERSIONS.terms);
    expect(c.privacyVersion).toBe(LEGAL_VERSIONS.privacy);
    expect(c.inviteTenantName).toBeUndefined();
  });

  it("新規ログインで Google へ要求するスコープは config の行と同じ組で、オフライン・同意画面・追加許可を指定する", async () => {
    const c = await config();
    const { url } = await startLogin();
    const requested = (url?.searchParams.get("scope") ?? "").split(" ");
    expect(requested).toEqual(["openid", "email", YT, YTA]);
    expect(requested.filter((s) => s !== "openid").sort()).toEqual(
      c.scopes.map((s) => s.id).sort(),
    );
    expect(url?.searchParams.get("access_type")).toBe("offline");
    expect(url?.searchParams.get("prompt")).toBe("consent");
    expect(url?.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("招待の config はメールアドレス1行だけで、招待元のテナント名を返す", async () => {
    const owner = await newOwner();
    const { token } = await issueInvite(owner, uniqueEmail("inv"), "viewer");
    const c = await config(`?invite=${token}`);
    expect(c.mode).toBe("invite");
    expect(c.scopes).toEqual([{ id: "email", label: "メールアドレス", readOnly: true }]);
    expect(c.inviteTenantName).toEqual(expect.any(String));
  });

  it("招待でのログインは YouTube のスコープを要求しない（openid email のみ・オフラインなし）", async () => {
    const owner = await newOwner();
    const { token } = await issueInvite(owner, uniqueEmail("inv"), "editor");
    const { url } = await startLogin(`&invite=${token}`);
    expect(url?.searchParams.get("scope")).toBe("openid email");
    expect(url?.searchParams.get("access_type")).toBeNull();
    expect(SCOPE_SETS.invite.scopes).toEqual(["openid", "email"]);
  });

  it("使えない招待トークンでも招待の組で表示し、テナント名は出さない", async () => {
    const c = await config("?invite=not-a-real-token-000000000000");
    expect(c.mode).toBe("invite");
    expect(c.scopes).toHaveLength(1);
    expect(c.inviteTenantName).toBeUndefined();
  });
});
