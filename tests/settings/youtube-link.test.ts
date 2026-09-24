// 受入 2・3・9: チャンネル選択（別テナント連携済みは 409）・同一チャンネルだけの再連携・解除→削除予約→再連携
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCOPE_FORCE_SSL } from "../../src/adapters/google-youtube";
import { SettingsRepository } from "../../src/repositories/settings-repository";
import { addMember, call, count, expectError, newOwner } from "../platform/helpers";
import {
  auditCount,
  callback,
  fakeGoogle,
  linkChannel,
  startOAuth,
  tenantName,
  upload,
} from "./helpers";

afterEach(() => vi.restoreAllMocks());

const uniqueChannel = () => `UC_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

describe("YouTube チャンネルの紐付け", () => {
  it("同意画面 URL は読み取り専用スコープ・PKCE・オフライン・アカウント選択付き", async () => {
    const owner = await newOwner("yt-url");
    const { url } = await startOAuth(owner);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toContain("youtube.readonly");
    expect(url.searchParams.get("scope")).toContain("yt-analytics.readonly");
    expect(url.searchParams.get("scope")).not.toContain("force-ssl");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toContain("select_account");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost/api/oauth/callback");
  });

  it("候補から1チャンネルを選ぶと連携され、トークンは暗号化して保存・監査ログ1件", async () => {
    const owner = await newOwner("yt-link");
    const a = uniqueChannel();
    const b = uniqueChannel();
    const google = fakeGoogle({ channels: [{ id: a, title: "チャンネルA" }, { id: b }] });
    const { state } = await startOAuth(owner);
    expect(await callback(owner, { code: "c", state })).toBe("/settings?select=channel");

    const list = await call("/api/youtube/channel-candidates", { cookie: owner.cookie });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      candidates: { channelId: string; linkedElsewhere: boolean }[];
    };
    expect(body.candidates.map((c) => c.channelId)).toEqual([a, b]);
    expect(body.candidates.every((c) => !c.linkedElsewhere)).toBe(true);

    const res = await call("/api/youtube/channel", {
      method: "POST",
      cookie: owner.cookie,
      body: { channelId: a },
    });
    expect(res.status).toBe(201);

    const settings = (await (await call("/api/settings", { cookie: owner.cookie })).json()) as {
      youtube: { status: string; channel: { title: string }; scopes: string[] };
    };
    expect(settings.youtube.status).toBe("正常");
    expect(settings.youtube.channel.title).toBe("チャンネルA");
    expect(settings.youtube.scopes).toEqual(["youtube.readonly", "yt-analytics.readonly"]);

    const token = await env.DB.prepare(
      "SELECT refresh_token_enc FROM oauth_tokens WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ refresh_token_enc: string }>();
    expect(token?.refresh_token_enc.startsWith("v1.")).toBe(true);
    expect(token?.refresh_token_enc).not.toContain(google.refreshToken);
    expect(await auditCount(owner.tenantId, "youtube.connect")).toBe(1);
    // 手続きの一時行は確定時に消える
    expect(
      await count("SELECT COUNT(*) AS n FROM oauth_pending WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(0);
  });

  it("別テナントで連携済みのチャンネルは候補で印が付き、選ぶと 409 CHANNEL_ALREADY_LINKED", async () => {
    const shared = uniqueChannel();
    const first = await newOwner("yt-first");
    fakeGoogle({ channels: [{ id: shared }] });
    expect((await linkChannel(first, shared)).status).toBe(201);

    const second = await newOwner("yt-second");
    const { state } = await startOAuth(second);
    await callback(second, { code: "c", state });
    const list = (await (
      await call("/api/youtube/channel-candidates", { cookie: second.cookie })
    ).json()) as { candidates: { linkedElsewhere: boolean }[] };
    expect(list.candidates[0]?.linkedElsewhere).toBe(true);

    await expectError(
      await call("/api/youtube/channel", {
        method: "POST",
        cookie: second.cookie,
        body: { channelId: shared },
      }),
      409,
      "CHANNEL_ALREADY_LINKED",
    );
    expect(
      await count("SELECT COUNT(*) AS n FROM channels WHERE tenant_id = ?1", second.tenantId),
    ).toBe(0);
  });

  it("候補に無いチャンネル ID は選べない（400）", async () => {
    const owner = await newOwner("yt-notcand");
    fakeGoogle({ channels: [{ id: uniqueChannel() }] });
    const { state } = await startOAuth(owner);
    await callback(owner, { code: "c", state });
    await expectError(
      await call("/api/youtube/channel", {
        method: "POST",
        cookie: owner.cookie,
        body: { channelId: "UC_not_in_list" },
      }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("連携済みのテナントは新しい連携を始められない（409 CHANNEL_ALREADY_CONNECTED）", async () => {
    const owner = await newOwner("yt-twice");
    fakeGoogle({ channels: [{ id: uniqueChannel() }] });
    const ch = uniqueChannel();
    fakeGoogle({ channels: [{ id: ch }] });
    expect((await linkChannel(owner, ch)).status).toBe(201);
    await expectError(
      await call("/api/youtube/connect", { method: "POST", cookie: owner.cookie, body: {} }),
      409,
      "CHANNEL_ALREADY_CONNECTED",
    );
  });

  it("チャンネルの無いアカウントは NO_CHANNEL、同意拒否は SCOPE_NOT_GRANTED で設定画面へ戻る", async () => {
    const owner = await newOwner("yt-nochan");
    fakeGoogle({ channels: [] });
    let { state } = await startOAuth(owner);
    expect(await callback(owner, { code: "c", state })).toBe("/settings?error=NO_CHANNEL");

    ({ state } = await startOAuth(owner));
    expect(await callback(owner, { error: "access_denied", state })).toBe(
      "/settings?error=SCOPE_NOT_GRANTED",
    );
  });

  it("読み取りスコープの一部だけ許可されたら SCOPE_NOT_GRANTED", async () => {
    const owner = await newOwner("yt-partial");
    fakeGoogle({ scopes: ["https://www.googleapis.com/auth/youtube.readonly"] });
    const { state } = await startOAuth(owner);
    expect(await callback(owner, { code: "c", state })).toBe("/settings?error=SCOPE_NOT_GRANTED");
  });

  it("別の人が始めた state・期限切れの state は受け付けない", async () => {
    const owner = await newOwner("yt-state");
    const other = await newOwner("yt-state-other");
    const google = fakeGoogle();
    const { state } = await startOAuth(owner);
    expect(await callback(other, { code: "c", state })).toBe(
      "/settings?error=OAUTH_STATE_MISMATCH",
    );
    expect(await callback(owner, { code: "c", state: "unknown-state" })).toBe(
      "/settings?error=OAUTH_STATE_MISMATCH",
    );
    await env.DB.prepare(
      "UPDATE oauth_pending SET expires_at = '2000-01-01T00:00:00.000Z' WHERE state = ?1",
    )
      .bind(state)
      .run();
    expect(await callback(owner, { code: "c", state })).toBe(
      "/settings?error=OAUTH_PENDING_EXPIRED",
    );
    expect(google.tokenCalls).toBe(0);
  });

  it("選択待ちが無いときの候補取得は OAUTH_PENDING_EXPIRED", async () => {
    const owner = await newOwner("yt-nopending");
    await expectError(
      await call("/api/youtube/channel-candidates", { cookie: owner.cookie }),
      400,
      "OAUTH_PENDING_EXPIRED",
    );
  });
});

describe("再連携と連携解除", () => {
  it("解除予約が保存された後の Queue 障害でも成功応答し、Cron 用の予約を残す", async () => {
    const owner = await newOwner("yt-queue-fallback");
    const channelId = uniqueChannel();
    fakeGoogle({ channels: [{ id: channelId }] });
    expect((await linkChannel(owner, channelId)).status).toBe(201);
    const queueSend = vi
      .spyOn(env.CLEANUP_QUEUE, "send")
      .mockRejectedValueOnce(new Error("queue unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("/api/youtube/connection", {
      method: "DELETE",
      cookie: owner.cookie,
      body: { confirmName: await tenantName(owner.tenantId) },
    });
    expect(res.status).toBe(200);
    expect(queueSend).toHaveBeenCalledWith({ kind: "cleanup" });
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM data_deletions WHERE tenant_id = ?1 AND scope = 'channel' AND done_at IS NULL",
    )
      .bind(owner.tenantId)
      .first<{ n: number }>();
    expect(pending?.n).toBe(1);
  });

  it("再連携は同じチャンネルなら成功し、要再連携から正常に戻る", async () => {
    const owner = await newOwner("yt-re");
    const ch = uniqueChannel();
    fakeGoogle({ channels: [{ id: ch }] });
    expect((await linkChannel(owner, ch)).status).toBe(201);
    await env.DB.prepare("UPDATE channels SET status = '要再連携' WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();

    const { state } = await startOAuth(owner, "/api/youtube/reconnect");
    expect(await callback(owner, { code: "c", state })).toBe("/settings?done=reconnected");
    const row = await env.DB.prepare("SELECT status FROM channels WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .first<{ status: string }>();
    expect(row?.status).toBe("正常");
    expect(await auditCount(owner.tenantId, "youtube.reconnect")).toBe(1);
  });

  it("再連携で別チャンネルを選ぶと CHANNEL_MISMATCH、新しい許可は即失効して元の連携は変わらない", async () => {
    const owner = await newOwner("yt-mismatch");
    const ch = uniqueChannel();
    fakeGoogle({ channels: [{ id: ch }] });
    expect((await linkChannel(owner, ch)).status).toBe(201);
    const before = await env.DB.prepare(
      "SELECT refresh_token_enc FROM oauth_tokens WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ refresh_token_enc: string }>();

    vi.restoreAllMocks();
    const google = fakeGoogle({
      channels: [{ id: uniqueChannel() }],
      refreshToken: "other-refresh",
    });
    const { state } = await startOAuth(owner, "/api/youtube/reconnect");
    expect(await callback(owner, { code: "c", state })).toBe("/settings?error=CHANNEL_MISMATCH");
    expect(google.revoked).toEqual(["other-refresh"]);
    const after = await env.DB.prepare(
      "SELECT o.refresh_token_enc, c.channel_id FROM oauth_tokens o JOIN channels c USING (tenant_id) WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ refresh_token_enc: string; channel_id: string }>();
    expect(after?.channel_id).toBe(ch);
    expect(after?.refresh_token_enc).toBe(before?.refresh_token_enc);
  });

  it("未連携での再連携は CHANNEL_NOT_CONNECTED", async () => {
    const owner = await newOwner("yt-re-none");
    await expectError(
      await call("/api/youtube/reconnect", { method: "POST", cookie: owner.cookie, body: {} }),
      409,
      "CHANNEL_NOT_CONNECTED",
    );
  });

  it("解除はテナント名の入力で確認し、Google の許可を失効・7日後期限の削除予約・監査ログ1件", async () => {
    const owner = await newOwner("yt-disc");
    const ch = uniqueChannel();
    const google = fakeGoogle({ channels: [{ id: ch }] });
    expect((await linkChannel(owner, ch)).status).toBe(201);

    const imported = await upload(owner, "csv", {
      name: "old-channel.csv",
      body: "date,views\n2026-09-01,10\n",
      type: "text/csv",
    });
    expect(imported.status).toBe(201);
    const oldImport = await env.DB.prepare(
      "SELECT r2_key FROM imports WHERE tenant_id = ?1 AND file_name = 'old-channel.csv'",
    )
      .bind(owner.tenantId)
      .first<{ r2_key: string }>();
    expect(oldImport?.r2_key).toBeTruthy();
    await env.DB.prepare(
      "UPDATE imports SET status = '完了', rows = 1 WHERE tenant_id = ?1 AND file_name = 'old-channel.csv'",
    )
      .bind(owner.tenantId)
      .run();

    await expectError(
      await call("/api/youtube/connection", {
        method: "DELETE",
        cookie: owner.cookie,
        body: { confirmName: "違う名前" },
      }),
      400,
      "CONFIRM_MISMATCH",
    );

    const res = await call("/api/youtube/connection", {
      method: "DELETE",
      cookie: owner.cookie,
      body: { confirmName: await tenantName(owner.tenantId) },
    });
    expect(res.status).toBe(200);
    const { deletionDueAt } = (await res.json()) as { deletionDueAt: string };
    const days = (Date.parse(deletionDueAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    expect(google.revoked).toEqual([google.refreshToken]);
    expect(
      await count("SELECT COUNT(*) AS n FROM channels WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(0);
    expect(
      await count("SELECT COUNT(*) AS n FROM oauth_tokens WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(0);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM data_deletions WHERE tenant_id = ?1 AND scope = 'channel' AND channel_id = ?2",
        owner.tenantId,
        ch,
      ),
    ).toBe(1);
    expect(await auditCount(owner.tenantId, "youtube.disconnect")).toBe(1);

    // 予約中は別チャンネルを連携できない。削除実行側が完了を記録してから再開できる。
    const next = uniqueChannel();
    vi.restoreAllMocks();
    fakeGoogle({ channels: [{ id: next }] });
    const blocked = await call("/api/youtube/connect", {
      method: "POST",
      cookie: owner.cookie,
      body: {},
    });
    await expectError(blocked.clone(), 409, "CHANNEL_DELETION_PENDING");
    const blockedBody = (await blocked.json()) as { error: { message: string; hint: string } };
    expect(blockedBody.error.message).toContain("削除が未完了");
    expect(blockedBody.error.hint).toContain("削除が完了してから");
    await expectError(
      await call("/api/youtube/reconnect", { method: "POST", cookie: owner.cookie, body: {} }),
      409,
      "CHANNEL_DELETION_PENDING",
    );
    const during = (await (await call("/api/settings", { cookie: owner.cookie })).json()) as {
      youtube: { pendingDeletionDueAt: string | null; lastCsvImportAt: string | null };
      imports: { file_name: string }[];
    };
    expect(during.youtube.pendingDeletionDueAt).toBe(deletionDueAt);
    expect(during.youtube.lastCsvImportAt).not.toBeNull();
    expect(during.imports.some((row) => row.file_name === "old-channel.csv")).toBe(true);
    // retention-ops が旧原本・履歴を削除してから done_at を記録する契約をここで模擬する。
    await env.MEDIA.delete(oldImport?.r2_key ?? "");
    await env.DB.prepare("DELETE FROM imports WHERE tenant_id = ?1").bind(owner.tenantId).run();
    await env.DB.prepare(
      "UPDATE data_deletions SET done_at = ?3 WHERE tenant_id = ?1 AND scope = 'channel' AND channel_id = ?2",
    )
      .bind(owner.tenantId, ch, new Date().toISOString())
      .run();
    const after = (await (await call("/api/settings", { cookie: owner.cookie })).json()) as {
      youtube: { pendingDeletionDueAt: string | null };
    };
    expect(after.youtube.pendingDeletionDueAt).toBeNull();
    expect(await env.MEDIA.get(oldImport?.r2_key ?? "")).toBeNull();
    expect((await linkChannel(owner, next)).status).toBe(201);
    const linked = (await (await call("/api/settings", { cookie: owner.cookie })).json()) as {
      youtube: { lastCsvImportAt: string | null };
      imports: { file_name: string }[];
    };
    expect(linked.youtube.lastCsvImportAt).toBeNull();
    expect(linked.imports).toEqual([]);
  });

  it("解除前に始めた OAuth の戻りは削除中に拒否し、Google のトークン交換を行わない", async () => {
    const owner = await newOwner("yt-stale-oauth");
    const ch = uniqueChannel();
    const google = fakeGoogle({ channels: [{ id: ch }] });
    expect((await linkChannel(owner, ch)).status).toBe(201);
    const { state } = await startOAuth(owner, "/api/youtube/reconnect");
    const calls = google.tokenCalls;
    expect(
      (
        await call("/api/youtube/connection", {
          method: "DELETE",
          cookie: owner.cookie,
          body: { confirmName: await tenantName(owner.tenantId) },
        })
      ).status,
    ).toBe(200);
    expect(await callback(owner, { code: "late-code", state })).toBe(
      "/settings?error=CHANNEL_DELETION_PENDING",
    );
    expect(google.tokenCalls).toBe(calls);
    expect(
      await count("SELECT COUNT(*) AS n FROM oauth_pending WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(0);
  });

  it("候補選択直前に削除予約ができても API と DB が新チャンネルの保存を拒否する", async () => {
    const owner = await newOwner("yt-race");
    const ch = uniqueChannel();
    fakeGoogle({ channels: [{ id: ch }] });
    const { state } = await startOAuth(owner);
    expect(await callback(owner, { code: "c", state })).toBe("/settings?select=channel");
    await env.DB.prepare(
      `INSERT INTO data_deletions (deletion_id, tenant_id, scope, channel_id, requested_by, requested_at, due_at)
       VALUES (?1, ?2, 'channel', ?3, ?4, ?5, ?6)`,
    )
      .bind(
        crypto.randomUUID(),
        owner.tenantId,
        uniqueChannel(),
        owner.userId,
        new Date().toISOString(),
        new Date(Date.now() + 7 * 86_400_000).toISOString(),
      )
      .run();
    const choose = () =>
      call("/api/youtube/channel", {
        method: "POST",
        cookie: owner.cookie,
        body: { channelId: ch },
      });
    await expectError(await choose(), 409, "CHANNEL_DELETION_PENDING");
    // 事前確認を通り抜ける競合でも、INSERT のトリガーが同じエラーで止める。
    vi.spyOn(SettingsRepository.prototype, "getPendingChannelDeletion").mockResolvedValueOnce(null);
    await expectError(await choose(), 409, "CHANNEL_DELETION_PENDING");
    expect(
      await count("SELECT COUNT(*) AS n FROM channels WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(0);
    expect(
      await count("SELECT COUNT(*) AS n FROM oauth_tokens WHERE tenant_id = ?1", owner.tenantId),
    ).toBe(0);
  });

  it("解除した旧チャンネルは別テナントが連携できる", async () => {
    const ch = uniqueChannel();
    const first = await newOwner("yt-release");
    fakeGoogle({ channels: [{ id: ch }] });
    expect((await linkChannel(first, ch)).status).toBe(201);
    await call("/api/youtube/connection", {
      method: "DELETE",
      cookie: first.cookie,
      body: { confirmName: await tenantName(first.tenantId) },
    });
    const second = await newOwner("yt-release2");
    expect((await linkChannel(second, ch)).status).toBe(201);
  });
});

describe("役割", () => {
  it("editor・viewer は連携の開始・解除・字幕切替・候補取得ができない（403）", async () => {
    const owner = await newOwner("yt-role");
    for (const role of ["editor", "viewer"] as const) {
      const member = await addMember(owner, role);
      for (const [method, path, body] of [
        ["POST", "/api/youtube/connect", {}],
        ["POST", "/api/youtube/reconnect", {}],
        ["GET", "/api/youtube/channel-candidates", undefined],
        ["POST", "/api/youtube/channel", { channelId: "UC_x" }],
        ["DELETE", "/api/youtube/connection", { confirmName: "x" }],
        ["PUT", "/api/youtube/captions-auto", { enabled: true }],
      ] as const) {
        await expectError(
          await call(path, { method, cookie: member.cookie, body }),
          403,
          "FORBIDDEN",
        );
      }
      // Google からの戻りも役割を確認し、設定画面へエラーで戻す
      expect(await callback(member, { code: "c", state: "s" })).toBe("/settings?error=FORBIDDEN");
    }
  });

  it("字幕 ON 済みのテナントの再連携は force-ssl も含めて要求する", async () => {
    const owner = await newOwner("yt-re-cap");
    const ch = uniqueChannel();
    fakeGoogle({ channels: [{ id: ch }] });
    expect((await linkChannel(owner, ch)).status).toBe(201);
    await env.DB.prepare("UPDATE tenants SET captions_auto = 1 WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    const { url } = await startOAuth(owner, "/api/youtube/reconnect");
    expect(url.searchParams.get("scope")).toContain(SCOPE_FORCE_SSL);
  });
});
