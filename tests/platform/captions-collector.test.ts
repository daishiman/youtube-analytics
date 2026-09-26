import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_TOKEN_URL } from "../../src/adapters/google-youtube";
import { SCOPE_FORCE_SSL } from "../../src/domain/google-scopes";
import type { Bindings } from "../../src/env";
import { CaptionsRepository } from "../../src/repositories/captions-repository";
import {
  captionCandidates,
  captionQuotaDate,
  collectCaptionForVideo,
  purgeExpiredCaptions,
  readCaptionForVideo,
} from "../../src/usecases/captions-collector";
import { newLinkedOwner } from "../helpers/channels";

afterEach(() => vi.restoreAllMocks());

const now = new Date();
const quotaDate = captionQuotaDate(now);
const testEnv = () => ({ ...env, CAPTIONS_COLLECTION_READY: "1" }) as Bindings;

async function setup(videoIds = ["video000001"]) {
  const { owner, channelId } = await newLinkedOwner("caption-collector");
  await env.DB.prepare("UPDATE tenants SET captions_auto = 1 WHERE tenant_id = ?1")
    .bind(owner.tenantId)
    .run();
  await env.DB.prepare(
    "UPDATE channel_oauth_tokens SET granted_scopes = granted_scopes || ?2 WHERE tenant_id = ?1",
  )
    .bind(owner.tenantId, ` ${SCOPE_FORCE_SSL}`)
    .run();
  for (const [index, videoId] of videoIds.entries()) {
    await env.DB.prepare(
      `INSERT INTO videos (tenant_id, video_id, channel_id, title, published_at, content_type, fetched_at)
       VALUES (?1, ?2, ?3, ?2, ?4, 'long', ?5)`,
    )
      .bind(
        owner.tenantId,
        videoId,
        channelId,
        new Date(now.getTime() - index * 1000).toISOString(),
        now.toISOString(),
      )
      .run();
  }
  const token = await env.DB.prepare(
    "SELECT updated_at FROM channel_oauth_tokens WHERE tenant_id = ?1",
  )
    .bind(owner.tenantId)
    .first<{ updated_at: string }>();
  const channel = await env.DB.prepare("SELECT connected_at FROM channels WHERE tenant_id = ?1")
    .bind(owner.tenantId)
    .first<{ connected_at: string }>();
  if (!token || !channel) throw new Error("missing connection");
  const base = {
    kind: "captions" as const,
    tenantId: owner.tenantId,
    channelId,
    connectedAt: channel.connected_at,
    tokenUpdatedAt: token.updated_at,
    quotaDate,
  };
  return { owner, base, message: { ...base, videoId: videoIds[0] as string } };
}

function captionGoogle() {
  const calls = { list: 0, download: 0 };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.href.startsWith(GOOGLE_TOKEN_URL))
      return Response.json({ access_token: "caption-token" });
    if (url.pathname === "/youtube/v3/captions") {
      calls.list += 1;
      return Response.json({
        items: [
          {
            id: `caption-${url.searchParams.get("videoId")}`,
            snippet: { language: "ja", status: "serving" },
          },
        ],
      });
    }
    if (url.pathname.startsWith("/youtube/v3/captions/")) {
      calls.download += 1;
      return new Response("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nこんにちは\n");
    }
    throw new Error(`Unexpected Google URL ${url}`);
  });
  return calls;
}

describe("字幕自動取得", () => {
  it("Google のクォータ日を DST 込みの PT 午前0時で切る", () => {
    expect(captionQuotaDate(new Date("2026-03-08T07:59:59Z"))).toBe("2026-03-07");
    expect(captionQuotaDate(new Date("2026-03-08T08:00:00Z"))).toBe("2026-03-08");
    expect(captionQuotaDate(new Date("2026-07-01T06:59:59Z"))).toBe("2026-06-30");
    expect(captionQuotaDate(new Date("2026-07-01T07:00:00Z"))).toBe("2026-07-01");
  });

  it("1動画を保存し、重複 Queue は外部APIを再送しない。OFF後は読まない", async () => {
    const { owner, message } = await setup();
    const calls = captionGoogle();
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("stored");
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("skipped");
    expect(calls).toEqual({ list: 1, download: 1 });
    const object = await readCaptionForVideo(testEnv(), message);
    expect(await object?.text()).toContain("こんにちは");
    await env.DB.prepare("UPDATE tenants SET captions_auto = 0 WHERE tenant_id = ?1")
      .bind(owner.tenantId)
      .run();
    expect(await readCaptionForVideo(testEnv(), message)).toBeNull();
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("skipped");
  });

  it("同一テナント・PT日付の並列予約は4件/1,000 unitsまで", async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `video00000${i}`);
    const { base } = await setup(ids);
    const repo = new CaptionsRepository(env.DB);
    const reservations = await Promise.all(
      ids.map((videoId) => repo.reserve({ ...base, videoId }, now.toISOString())),
    );
    expect(reservations.filter(Boolean)).toHaveLength(4);
    expect(await repo.reservedCount(base.tenantId, quotaDate)).toBe(4);
    const candidates = await captionCandidates(testEnv(), base, now);
    expect(candidates.videoIds).toEqual([]);
  });

  it("候補は新着順。force-ssl と機能フラグがなければ投入しない", async () => {
    const { base } = await setup(["video000001", "video000002", "video000003"]);
    expect((await captionCandidates(testEnv(), base, now)).videoIds).toEqual([
      "video000001",
      "video000002",
      "video000003",
    ]);
    expect((await captionCandidates(env, base, now)).videoIds).toEqual([]);
    await env.DB.prepare("UPDATE channel_oauth_tokens SET granted_scopes = '' WHERE tenant_id = ?1")
      .bind(base.tenantId)
      .run();
    expect((await captionCandidates(testEnv(), base, now)).videoIds).toEqual([]);
  });

  it("途中で字幕OFFにした場合は download と保存を止める", async () => {
    const { owner, message } = await setup();
    let downloads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.startsWith(GOOGLE_TOKEN_URL)) return Response.json({ access_token: "token" });
      if (url.pathname === "/youtube/v3/captions") {
        await env.DB.prepare("UPDATE tenants SET captions_auto = 0 WHERE tenant_id = ?1")
          .bind(owner.tenantId)
          .run();
        return Response.json({
          items: [{ id: "track1", snippet: { language: "ja", status: "serving" } }],
        });
      }
      downloads += 1;
      return new Response("WEBVTT\n");
    });
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("skipped");
    expect(downloads).toBe(0);
    expect(await readCaptionForVideo(testEnv(), message)).toBeNull();
  });

  it("R2保存後のD1失敗から原本だけで再開し、APIを再送しない", async () => {
    const { message } = await setup();
    const repo = new CaptionsRepository(env.DB);
    const attempt = await repo.reserve(message, now.toISOString());
    if (!attempt) throw new Error("missing attempt");
    expect(await repo.transition(message, "reserved", "listing", now.toISOString())).toBe(true);
    expect(
      await repo.transition(message, "listing", "listed", now.toISOString(), {
        id: "track1",
        language: "ja",
      }),
    ).toBe(true);
    expect(await repo.transition(message, "listed", "downloading", now.toISOString())).toBe(true);
    await env.MEDIA.put(attempt.r2_key, "WEBVTT\n\nrecover\n");
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("API must not be called");
    });
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("stored");
    expect(await (await readCaptionForVideo(testEnv(), message))?.text()).toContain("recover");
  });

  it("list結果確定後の再送はdownloadだけ進める", async () => {
    const { message } = await setup();
    const repo = new CaptionsRepository(env.DB);
    expect(await repo.reserve(message, now.toISOString())).not.toBeNull();
    expect(await repo.transition(message, "reserved", "listing", now.toISOString())).toBe(true);
    expect(
      await repo.transition(message, "listing", "listed", now.toISOString(), {
        id: "track1",
        language: "ja",
      }),
    ).toBe(true);
    let lists = 0;
    let downloads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.startsWith(GOOGLE_TOKEN_URL)) return Response.json({ access_token: "token" });
      if (url.pathname === "/youtube/v3/captions") {
        lists += 1;
        throw new Error("list must not be called");
      }
      downloads += 1;
      return new Response("WEBVTT\n\nresumed\n");
    });
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("stored");
    expect({ lists, downloads }).toEqual({ lists: 0, downloads: 1 });
  });

  it("download中にOFFへ変わればD1・R2へ保存しない", async () => {
    const { owner, message } = await setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.startsWith(GOOGLE_TOKEN_URL)) return Response.json({ access_token: "token" });
      if (url.pathname === "/youtube/v3/captions") {
        return Response.json({
          items: [{ id: "track1", snippet: { language: "ja", status: "serving" } }],
        });
      }
      await env.DB.prepare("UPDATE tenants SET captions_auto = 0 WHERE tenant_id = ?1")
        .bind(owner.tenantId)
        .run();
      return new Response("WEBVTT\n");
    });
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("skipped");
    const attempt = await new CaptionsRepository(env.DB).attempt(message);
    expect(attempt).not.toBeNull();
    expect(await env.MEDIA.get(attempt?.r2_key ?? "missing")).toBeNull();
    expect(await readCaptionForVideo(testEnv(), message)).toBeNull();
  });

  it("list が失敗した予約は同日再送しない", async () => {
    const { message } = await setup();
    let lists = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.startsWith(GOOGLE_TOKEN_URL)) return Response.json({ access_token: "token" });
      lists += 1;
      return new Response("error", { status: 503 });
    });
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("failed");
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("skipped");
    expect(lists).toBe(1);
  });

  it("30日を超えた字幕は即時読取停止し、R2とD1から削除する", async () => {
    const { message } = await setup();
    captionGoogle();
    expect(await collectCaptionForVideo(testEnv(), message, now, fetch, () => now)).toBe("stored");
    const future = new Date(now.getTime() + 31 * 86_400_000);
    expect(await readCaptionForVideo(testEnv(), message, future)).toBeNull();
    const attempt = await new CaptionsRepository(env.DB).attempt(message);
    expect(attempt).not.toBeNull();
    const result = await purgeExpiredCaptions(testEnv(), future);
    expect(result.records).toBeGreaterThanOrEqual(1);
    expect(await env.MEDIA.get(attempt?.r2_key ?? "missing")).toBeNull();
    expect(await readCaptionForVideo(testEnv(), message, now)).toBeNull();
  });

  it("D1に結び付かなかった古いR2原本を掃除し、当日の予約は残す", async () => {
    const { message } = await setup();
    const repo = new CaptionsRepository(env.DB);
    const attempt = await repo.reserve(message, now.toISOString());
    if (!attempt) throw new Error("missing attempt");
    await env.MEDIA.put(attempt.r2_key, "WEBVTT\n\norphan\n");
    const old = new Date(now.getTime() - 3 * 86_400_000).toISOString();
    await env.DB.prepare(
      "UPDATE caption_attempts SET updated_at = ?4 WHERE tenant_id = ?1 AND quota_date = ?2 AND video_id = ?3",
    )
      .bind(message.tenantId, message.quotaDate, message.videoId, old)
      .run();
    expect((await purgeExpiredCaptions(testEnv(), now)).orphans).toBe(0);
    expect(await env.MEDIA.get(attempt.r2_key)).not.toBeNull();
    const future = new Date(now.getTime() + 3 * 86_400_000);
    expect((await purgeExpiredCaptions(testEnv(), future)).orphans).toBeGreaterThanOrEqual(1);
    expect(await env.MEDIA.get(attempt.r2_key)).toBeNull();
    expect(await repo.attempt(message)).toBeNull();
  });
});
