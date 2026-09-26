// 受入 4: 字幕の自動取得トグル（ON で force-ssl を追加同意・OFF で失効して読み取り専用へ戻す・運営者以外は準備中）
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { READONLY_SCOPES, SCOPE_FORCE_SSL } from "../../src/domain/google-scopes";
import { call, expectError, newOwner } from "../platform/helpers";
import { auditCount, callback, fakeGoogle, linkChannel, type Owner } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const uniqueChannel = () => `UC_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

async function linkNew(owner: Owner) {
  const id = uniqueChannel();
  vi.restoreAllMocks();
  const google = fakeGoogle({ channels: [{ id }] });
  expect((await linkChannel(owner, id)).status).toBe(201);
  return google;
}

const toggle = (owner: Owner, enabled: unknown, envOverride?: Record<string, string>) =>
  call("/api/youtube/captions-auto", {
    method: "PUT",
    cookie: owner.cookie,
    body: { enabled },
    env: envOverride,
  });

async function settingsOf(owner: Owner, envOverride?: Record<string, string>) {
  const res = await call("/api/settings", { cookie: owner.cookie, env: envOverride });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    youtube: {
      status: string;
      scopes: string[];
      captions: { enabled: boolean; availability: string; dailyLimit: number };
    };
  };
}

describe("字幕トグルの公開範囲（機能フラグ）", () => {
  it("運営者テナント以外のオーナーには『準備中』で、切り替えは 403 FEATURE_NOT_READY", async () => {
    const owner = await newOwner("cap-other");
    await linkNew(owner);
    const s = await settingsOf(owner, { OPERATOR_TENANT_ID: "someone-else" });
    expect(s.youtube.captions).toEqual({
      enabled: false,
      availability: "preparing",
      dailyLimit: 4,
    });
    await expectError(
      await toggle(owner, true, { OPERATOR_TENANT_ID: "someone-else" }),
      403,
      "FEATURE_NOT_READY",
    );
  });

  it("OPERATOR_TENANT_ID 未設定なら全員『準備中』", async () => {
    const owner = await newOwner("cap-unset");
    await linkNew(owner);
    expect((await settingsOf(owner)).youtube.captions.availability).toBe("preparing");
    await expectError(await toggle(owner, true), 403, "FEATURE_NOT_READY");
  });

  it("運営者テナントのオーナーは利用できる", async () => {
    const owner = await newOwner("cap-op");
    await linkNew(owner);
    const op = { OPERATOR_TENANT_ID: owner.tenantId, CAPTIONS_COLLECTION_READY: "1" };
    expect((await settingsOf(owner, op)).youtube.captions.availability).toBe("available");
  });

  it("収集処理が未実装なら運営テナント・Google検証済みでも準備中", async () => {
    const owner = await newOwner("cap-not-ready");
    await linkNew(owner);
    const flags = { OPERATOR_TENANT_ID: owner.tenantId, FORCE_SSL_VERIFIED: "1" };
    expect((await settingsOf(owner, flags)).youtube.captions.availability).toBe("preparing");
    await expectError(await toggle(owner, true, flags), 403, "FEATURE_NOT_READY");
  });

  it("FORCE_SSL_VERIFIED=1（Google 検証済み）なら全テナントのオーナーへ開放", async () => {
    const owner = await newOwner("cap-verified");
    await linkNew(owner);
    const verified = { FORCE_SSL_VERIFIED: "1", CAPTIONS_COLLECTION_READY: "1" };
    expect((await settingsOf(owner, verified)).youtube.captions.availability).toBe("available");
    const res = await toggle(owner, true, verified);
    expect(res.status).toBe(200);
  });

  it("enabled が真偽値でなければ 400", async () => {
    const owner = await newOwner("cap-bad");
    await linkNew(owner);
    await expectError(
      await toggle(owner, "yes", { OPERATOR_TENANT_ID: owner.tenantId }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("未連携なら CHANNEL_NOT_CONNECTED", async () => {
    const owner = await newOwner("cap-none");
    await expectError(
      await toggle(owner, true, {
        OPERATOR_TENANT_ID: owner.tenantId,
        CAPTIONS_COLLECTION_READY: "1",
      }),
      409,
      "CHANNEL_NOT_CONNECTED",
    );
  });
});

describe("字幕 ON / OFF", () => {
  it("ON は追加の同意（include_granted_scopes + force-ssl）へ進み、戻ると ON・スコープ追加・監査1件", async () => {
    const owner = await newOwner("cap-on");
    const linkedGoogle = await linkNew(owner);
    const op = { OPERATOR_TENANT_ID: owner.tenantId, CAPTIONS_COLLECTION_READY: "1" };
    vi.restoreAllMocks();
    fakeGoogle({ channels: linkedGoogle.channels, scopes: [...READONLY_SCOPES, SCOPE_FORCE_SSL] });

    const res = await toggle(owner, true, op);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { captionsAuto: boolean; url: string };
    expect(body.captionsAuto).toBe(false);
    const url = new URL(body.url);
    expect(url.searchParams.get("scope")).toBe(SCOPE_FORCE_SSL);
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");

    const state = url.searchParams.get("state") ?? "";
    expect(await callback(owner, { code: "c", state }, op)).toBe("/settings?done=captions_on");
    const s = await settingsOf(owner, op);
    expect(s.youtube.captions.enabled).toBe(true);
    expect(s.youtube.scopes).toContain("youtube.force-ssl");
    expect(await auditCount(owner.tenantId, "captions.on")).toBe(1);

    // すでに ON なら何もしない
    const again = (await (await toggle(owner, true, op)).json()) as { url: string | null };
    expect(again.url).toBeNull();
    expect(await auditCount(owner.tenantId, "captions.on")).toBe(1);
  });

  it("同意画面で force-ssl が外されたら SCOPE_NOT_GRANTED で OFF のまま", async () => {
    const owner = await newOwner("cap-deny");
    await linkNew(owner);
    const op = { OPERATOR_TENANT_ID: owner.tenantId, CAPTIONS_COLLECTION_READY: "1" };
    vi.restoreAllMocks();
    const google = fakeGoogle({ scopes: [...READONLY_SCOPES] });
    const { url } = (await (await toggle(owner, true, op)).json()) as { url: string };
    const state = new URL(url).searchParams.get("state") ?? "";
    expect(await callback(owner, { code: "c", state }, op)).toBe(
      "/settings?error=SCOPE_NOT_GRANTED",
    );
    expect(google.revoked).toEqual([google.refreshToken]);
    expect((await settingsOf(owner, op)).youtube.captions.enabled).toBe(false);
  });

  it("追加同意したアカウントが連携中のチャンネルを管理しなければトークンを保存しない", async () => {
    const owner = await newOwner("cap-other-channel");
    await linkNew(owner);
    const op = { OPERATOR_TENANT_ID: owner.tenantId, CAPTIONS_COLLECTION_READY: "1" };
    vi.restoreAllMocks();
    const google = fakeGoogle({
      channels: [{ id: uniqueChannel() }],
      scopes: [...READONLY_SCOPES, SCOPE_FORCE_SSL],
    });
    const before = await env.DB.prepare(
      "SELECT refresh_token_enc, granted_scopes FROM channel_oauth_tokens WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ refresh_token_enc: string; granted_scopes: string }>();
    const { url } = (await (await toggle(owner, true, op)).json()) as { url: string };
    const state = new URL(url).searchParams.get("state") ?? "";
    expect(await callback(owner, { code: "c", state }, op)).toBe(
      "/settings?error=CHANNEL_MISMATCH",
    );
    expect(google.revoked).toEqual([google.refreshToken]);
    const after = await env.DB.prepare(
      "SELECT refresh_token_enc, granted_scopes FROM channel_oauth_tokens WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ refresh_token_enc: string; granted_scopes: string }>();
    expect(after).toEqual(before);
    expect((await settingsOf(owner, op)).youtube.captions.enabled).toBe(false);
  });

  it("追加同意で refresh token が得られなければ ON にしない", async () => {
    const owner = await newOwner("cap-no-refresh");
    const linkedGoogle = await linkNew(owner);
    const op = { OPERATOR_TENANT_ID: owner.tenantId, CAPTIONS_COLLECTION_READY: "1" };
    vi.restoreAllMocks();
    fakeGoogle({
      channels: linkedGoogle.channels,
      scopes: [...READONLY_SCOPES, SCOPE_FORCE_SSL],
      refreshToken: null,
    });
    const { url } = (await (await toggle(owner, true, op)).json()) as { url: string };
    const state = new URL(url).searchParams.get("state") ?? "";
    expect(await callback(owner, { code: "c", state }, op)).toBe("/settings?error=OAUTH_FAILED");
    expect((await settingsOf(owner, op)).youtube.captions.enabled).toBe(false);
  });

  it("追加同意中に公開ゲートを閉じたら戻りでもONにしない", async () => {
    const owner = await newOwner("cap-gate-closed");
    await linkNew(owner);
    const op = { OPERATOR_TENANT_ID: owner.tenantId, CAPTIONS_COLLECTION_READY: "1" };
    const { url } = (await (await toggle(owner, true, op)).json()) as { url: string };
    const state = new URL(url).searchParams.get("state") ?? "";
    expect(
      await callback(owner, { code: "c", state }, { OPERATOR_TENANT_ID: owner.tenantId }),
    ).toBe("/settings?error=FEATURE_NOT_READY");
    expect((await settingsOf(owner)).youtube.captions.enabled).toBe(false);
  });

  it("OFF は Google の許可を失効し、要再連携にして読み取り専用の再連携 URL を返す", async () => {
    const owner = await newOwner("cap-off");
    const linkedGoogle = await linkNew(owner);
    const op = { OPERATOR_TENANT_ID: owner.tenantId, CAPTIONS_COLLECTION_READY: "1" };
    vi.restoreAllMocks();
    const google = fakeGoogle({
      channels: linkedGoogle.channels,
      scopes: [...READONLY_SCOPES, SCOPE_FORCE_SSL],
    });
    const { url } = (await (await toggle(owner, true, op)).json()) as { url: string };
    await callback(owner, { code: "c", state: new URL(url).searchParams.get("state") ?? "" }, op);

    // 公開ゲートを閉じた後でも、既存の追加許可を取り消せる。
    const res = await toggle(owner, false, { OPERATOR_TENANT_ID: owner.tenantId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { captionsAuto: boolean; url: string };
    expect(body.captionsAuto).toBe(false);
    const scope = new URL(body.url).searchParams.get("scope") ?? "";
    expect(scope).not.toContain("force-ssl");
    expect(scope).toContain("youtube.readonly");
    expect(google.revoked).toEqual([google.refreshToken]);

    const s = await settingsOf(owner, op);
    expect(s.youtube.status).toBe("要再連携");
    expect(s.youtube.captions.enabled).toBe(false);
    expect(await auditCount(owner.tenantId, "captions.off")).toBe(1);
    const row = await env.DB.prepare(
      "SELECT refresh_token_enc FROM channel_oauth_tokens WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ refresh_token_enc: string | null }>();
    expect(row?.refresh_token_enc).toBeNull();
  });

  it("既存ONでGoogle接続情報が無くてもOFFは成功し、再連携URLは返さない", async () => {
    const owner = await newOwner("cap-off-no-client");
    const linkedGoogle = await linkNew(owner);
    const op = { OPERATOR_TENANT_ID: owner.tenantId, CAPTIONS_COLLECTION_READY: "1" };
    vi.restoreAllMocks();
    const google = fakeGoogle({
      channels: linkedGoogle.channels,
      scopes: [...READONLY_SCOPES, SCOPE_FORCE_SSL],
    });
    const { url } = (await (await toggle(owner, true, op)).json()) as { url: string };
    await callback(owner, { code: "c", state: new URL(url).searchParams.get("state") ?? "" }, op);
    await env.DB.prepare("DELETE FROM tenant_google_clients WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();

    const res = await toggle(owner, false);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ captionsAuto: false, url: null });
    expect(google.revoked).toEqual([google.refreshToken]);
    const s = await settingsOf(owner);
    expect(s.youtube.status).toBe("要再連携");
    expect(s.youtube.captions.enabled).toBe(false);
  });

  it("OFF のまま OFF にしても失効・監査は起きない", async () => {
    const owner = await newOwner("cap-offoff");
    const google = await linkNew(owner);
    const res = await toggle(owner, false, { OPERATOR_TENANT_ID: owner.tenantId });
    expect(((await res.json()) as { url: string | null }).url).toBeNull();
    expect(google.revoked).toEqual([]);
    expect(await auditCount(owner.tenantId, "captions.off")).toBe(0);
  });
});
