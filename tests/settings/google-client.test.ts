// qa-087: テナントごとに Google Cloud OAuth クライアントを持ち込む（登録は必須・シークレットは返さない）
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addMember, call, count, expectError, newOwner } from "../platform/helpers";
import {
  auditCount,
  callback,
  fakeGoogle,
  linkChannel,
  registerGoogleClient,
  startOAuth,
  TEST_CLIENT,
} from "./helpers";

afterEach(() => vi.restoreAllMocks());

const uniqueChannel = () => `UC_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
const OTHER_CLIENT = {
  clientId: "987654321098-otherclient9z8y7x.apps.googleusercontent.com",
  clientSecret: "GOCSPX-other-secret-9876543210",
};

interface GoogleClientBody {
  configured: boolean;
  clientId: string | null;
  updatedAt: string | null;
}

async function settingsOf(cookie: string) {
  const res = await call("/api/settings", { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    youtube: { status: string; googleClient: GoogleClientBody };
  };
}

async function storedClient(tenantId: string) {
  return env.DB.prepare(
    "SELECT client_id, client_secret_enc FROM tenant_google_clients WHERE tenant_id = ?1",
  )
    .bind(tenantId)
    .first<{ client_id: string; client_secret_enc: string }>();
}

describe("テナントの Google Cloud クライアント", () => {
  it("未登録のテナントは連携を始められない（409 GOOGLE_CLIENT_NOT_CONFIGURED）", async () => {
    const owner = await newOwner("gc-none");
    const settings = await settingsOf(owner.cookie);
    expect(settings.youtube.googleClient).toEqual({
      configured: false,
      clientId: null,
      updatedAt: null,
    });
    const res = await call("/api/youtube/connect", {
      method: "POST",
      cookie: owner.cookie,
      body: {},
    });
    await expectError(res, 409, "GOOGLE_CLIENT_NOT_CONFIGURED");
    // Google へ飛ばす前に止めるので、手続きの一時行も作らない
    expect(
      await count("SELECT COUNT(*) AS n FROM oauth_pending WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(0);
  });

  it("登録するとシークレットは暗号化して保存し、API の応答・設定・監査ログには出さない", async () => {
    const owner = await newOwner("gc-save");
    const res = await call("/api/youtube/google-client", {
      method: "PUT",
      cookie: owner.cookie,
      body: { clientId: ` ${TEST_CLIENT.clientId} `, clientSecret: TEST_CLIENT.clientSecret },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(TEST_CLIENT.clientSecret);
    expect(JSON.parse(text)).toMatchObject({ configured: true, clientId: TEST_CLIENT.clientId });

    const settings = await settingsOf(owner.cookie);
    expect(settings.youtube.googleClient.configured).toBe(true);
    expect(settings.youtube.googleClient.clientId).toBe(TEST_CLIENT.clientId);
    expect(JSON.stringify(settings)).not.toContain(TEST_CLIENT.clientSecret);

    const row = await storedClient(owner.tenantId);
    expect(row?.client_secret_enc.startsWith("v1.")).toBe(true);
    expect(row?.client_secret_enc).not.toContain(TEST_CLIENT.clientSecret);
    expect(await auditCount(owner.tenantId, "google_client.set")).toBe(1);
    const logged = await count(
      "SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ?1 AND detail LIKE ?2",
      owner.tenantId,
      `%${TEST_CLIENT.clientSecret}%`,
    );
    expect(logged).toBe(0);
  });

  it("形式が違うクライアント ID・短いシークレットは 400 VALIDATION_FAILED で保存しない", async () => {
    const owner = await newOwner("gc-invalid");
    for (const body of [
      { clientId: "not-a-client-id", clientSecret: TEST_CLIENT.clientSecret },
      { clientId: "123-abc.apps.googleusercontent.com.evil.example", clientSecret: "x".repeat(20) },
      { clientId: TEST_CLIENT.clientId, clientSecret: "short" },
      { clientId: TEST_CLIENT.clientId, clientSecret: "has space inside secret" },
      { clientId: TEST_CLIENT.clientId },
    ]) {
      const res = await call("/api/youtube/google-client", {
        method: "PUT",
        cookie: owner.cookie,
        body,
      });
      await expectError(res, 400, "VALIDATION_FAILED");
    }
    expect(await storedClient(owner.tenantId)).toBeNull();
  });

  it("編集者・閲覧者は登録も削除もできない（403）", async () => {
    const owner = await newOwner("gc-role");
    for (const role of ["editor", "viewer"] as const) {
      const member = await addMember(owner, role);
      const put = await call("/api/youtube/google-client", {
        method: "PUT",
        cookie: member.cookie,
        body: TEST_CLIENT,
      });
      await expectError(put, 403, "FORBIDDEN");
      const del = await call("/api/youtube/google-client", {
        method: "DELETE",
        cookie: member.cookie,
      });
      await expectError(del, 403, "FORBIDDEN");
    }
    expect(await storedClient(owner.tenantId)).toBeNull();
  });

  it("同意画面 URL とトークン交換には、そのテナントのクライアントを使う", async () => {
    const owner = await newOwner("gc-use");
    const google = fakeGoogle();
    await registerGoogleClient(owner, OTHER_CLIENT);
    const res = await call("/api/youtube/connect", {
      method: "POST",
      cookie: owner.cookie,
      body: {},
    });
    expect(res.status).toBe(200);
    const url = new URL(((await res.json()) as { url: string }).url);
    expect(url.searchParams.get("client_id")).toBe(OTHER_CLIENT.clientId);
    const state = url.searchParams.get("state") ?? "";
    expect(await callback(owner, { code: "c", state })).toBe("/settings?select=channel");
    expect(google.tokenRequests).toHaveLength(1);
    expect(google.tokenRequests[0]?.get("client_id")).toBe(OTHER_CLIENT.clientId);
    expect(google.tokenRequests[0]?.get("client_secret")).toBe(OTHER_CLIENT.clientSecret);
    // ログイン用のアプリ共通クライアントは使わない
    expect(google.tokenRequests[0]?.get("client_id")).not.toBe(env.GOOGLE_CLIENT_ID);
  });

  it("Google が invalid_client を返したら GOOGLE_CLIENT_REJECTED で設定画面へ戻す", async () => {
    const owner = await newOwner("gc-reject");
    fakeGoogle({ tokenError: "invalid_client" });
    const { state } = await startOAuth(owner);
    expect(await callback(owner, { code: "c", state })).toBe(
      "/settings?error=GOOGLE_CLIENT_REJECTED",
    );
  });

  it("シークレットだけの変更では連携はそのまま（要再連携にしない）", async () => {
    const owner = await newOwner("gc-secret");
    const channelId = uniqueChannel();
    const google = fakeGoogle({ channels: [{ id: channelId }] });
    expect((await linkChannel(owner, channelId)).status).toBe(201);
    await registerGoogleClient(owner, { ...TEST_CLIENT, clientSecret: "GOCSPX-rotated-secret-00" });
    expect((await settingsOf(owner.cookie)).youtube.status).toBe("正常");
    expect(google.revoked).toHaveLength(0);
  });

  it("クライアント ID を変えると、旧トークンを失効して要再連携にする", async () => {
    const owner = await newOwner("gc-change");
    const channelId = uniqueChannel();
    const google = fakeGoogle({ channels: [{ id: channelId }] });
    expect((await linkChannel(owner, channelId)).status).toBe(201);
    await registerGoogleClient(owner, OTHER_CLIENT);
    expect((await settingsOf(owner.cookie)).youtube.status).toBe("要再連携");
    expect(google.revoked).toEqual([google.refreshToken]);
    const token = await env.DB.prepare(
      "SELECT refresh_token_enc FROM channel_oauth_tokens WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ refresh_token_enc: string | null }>();
    expect(token?.refresh_token_enc).toBeNull();
    // 新しいクライアントで再連携できる
    const { url } = await startOAuth(owner, "/api/youtube/reconnect");
    expect(url.searchParams.get("client_id")).toBe(TEST_CLIENT.clientId);
  });

  it("旧クライアントで始めた手続きは、クライアント ID の変更後は使えない", async () => {
    const owner = await newOwner("gc-pending");
    fakeGoogle();
    const { state } = await startOAuth(owner);
    await registerGoogleClient(owner, OTHER_CLIENT);
    expect(await callback(owner, { code: "c", state })).toBe(
      "/settings?error=OAUTH_STATE_MISMATCH",
    );
  });

  it("削除すると未登録に戻り、連携中チャンネルは要再連携・監査ログ1件", async () => {
    const owner = await newOwner("gc-delete");
    const channelId = uniqueChannel();
    const google = fakeGoogle({ channels: [{ id: channelId }] });
    expect((await linkChannel(owner, channelId)).status).toBe(201);
    const res = await call("/api/youtube/google-client", {
      method: "DELETE",
      cookie: owner.cookie,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as GoogleClientBody).configured).toBe(false);
    const settings = await settingsOf(owner.cookie);
    expect(settings.youtube.googleClient.configured).toBe(false);
    expect(settings.youtube.status).toBe("要再連携");
    expect(google.revoked).toEqual([google.refreshToken]);
    expect(await auditCount(owner.tenantId, "google_client.delete")).toBe(1);
    const again = await call("/api/youtube/reconnect", {
      method: "POST",
      cookie: owner.cookie,
      body: {},
    });
    await expectError(again, 409, "GOOGLE_CLIENT_NOT_CONFIGURED");
  });

  it("未登録で削除すると 404", async () => {
    const owner = await newOwner("gc-del-none");
    const res = await call("/api/youtube/google-client", {
      method: "DELETE",
      cookie: owner.cookie,
    });
    await expectError(res, 404, "NOT_FOUND");
  });

  it("クライアントはテナントごと（別テナントの登録は見えない・使われない）", async () => {
    const a = await newOwner("gc-tenant-a");
    const b = await newOwner("gc-tenant-b");
    await registerGoogleClient(a, OTHER_CLIENT);
    expect((await settingsOf(b.cookie)).youtube.googleClient.configured).toBe(false);
    const res = await call("/api/youtube/connect", { method: "POST", cookie: b.cookie, body: {} });
    await expectError(res, 409, "GOOGLE_CLIENT_NOT_CONFIGURED");
  });
});
