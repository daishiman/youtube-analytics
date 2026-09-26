import {
  type CaptionTrack,
  downloadCaptionTrack,
  listCaptionTracks,
  preferredCaptionTrack,
} from "../adapters/google-captions";
import { API_DATA_MAX_AGE_MS } from "../domain/data-retention";
import { pacificDate } from "../domain/pacific-date";
import { DAY_MS } from "../domain/time";
import type { Bindings, CaptionMessage, LinkGeneration } from "../env";
import { type CaptionAttempt, CaptionsRepository } from "../repositories/captions-repository";
import { getLinkAccessToken } from "./google-client";
import { CAPTION_DAILY_LIMIT } from "./settings-common";

/** YouTube Data API のクォータ日。DST を含め Google の Pacific Time 午前0時で切る。 */
export function captionQuotaDate(now: Date): string {
  return pacificDate(now);
}

/** Cron が新着順に送る候補を返す。予約数は送信後に変わり得るため consumer でも原子的に再判定する。 */
export async function captionCandidates(
  env: Bindings,
  connection: LinkGeneration,
  now: Date,
): Promise<{ quotaDate: string; videoIds: string[] }> {
  const quotaDate = captionQuotaDate(now);
  if (env.CAPTIONS_COLLECTION_READY !== "1") return { quotaDate, videoIds: [] };
  const repo = new CaptionsRepository(env.DB);
  const remaining = Math.max(
    0,
    CAPTION_DAILY_LIMIT - (await repo.reservedCount(connection.tenantId, quotaDate)),
  );
  if (remaining === 0) return { quotaDate, videoIds: [] };
  const videoIds = await repo.candidates({ ...connection, kind: "captions", quotaDate }, remaining);
  return { quotaDate, videoIds };
}

function sameAttempt(attempt: CaptionAttempt, message: CaptionMessage): boolean {
  return (
    attempt.channel_id === message.channelId &&
    attempt.connected_at === message.connectedAt &&
    attempt.token_updated_at === message.tokenUpdatedAt
  );
}

/** 外部APIを再送せず、既にR2へ着地した原本だけをD1へ確定できる。 */
async function finalizeStaged(
  env: Bindings,
  repo: CaptionsRepository,
  message: CaptionMessage,
  attempt: CaptionAttempt,
  now: Date,
): Promise<"stored" | "skipped"> {
  if (!(await repo.isCurrent(message))) return "skipped";
  const object = await env.MEDIA.get(attempt.r2_key);
  if (!object || object.size <= 0) return "skipped";
  return (await repo.saveRecord(message, attempt, object.size, now.toISOString()))
    ? "stored"
    : "skipped";
}

export type CaptionCollectionResult = "stored" | "no_track" | "failed" | "skipped";
const CAPTION_MAX_AGE_MS = API_DATA_MAX_AGE_MS;
const CAPTION_ORPHAN_AGE_MS = 2 * DAY_MS;
const CAPTION_PURGE_BATCH = 10;

/**
 * 字幕を1動画だけ試行する。予約は最大250 units として数え、list/download を送る直前に
 * 状態を進める。応答不明時の重複課金を避けるため、その日には外部APIを再送しない。
 */
export async function collectCaptionForVideo(
  env: Bindings,
  message: CaptionMessage,
  now: Date,
  fetcher: typeof fetch = fetch,
  clock: () => Date = () => new Date(),
): Promise<CaptionCollectionResult> {
  if (
    env.CAPTIONS_COLLECTION_READY !== "1" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(message.videoId) ||
    message.quotaDate !== captionQuotaDate(now) ||
    message.quotaDate !== captionQuotaDate(clock())
  )
    return "skipped";

  const repo = new CaptionsRepository(env.DB);
  if (!(await repo.isCurrent(message))) return "skipped";
  const attempt = await repo.reserve(message, now.toISOString());
  if (!attempt || !sameAttempt(attempt, message)) return "skipped";
  if (attempt.status === "downloading") {
    return finalizeStaged(env, repo, message, attempt, now);
  }
  if (attempt.status !== "reserved" && attempt.status !== "listed") return "skipped";

  const accessToken = await getLinkAccessToken({ env, now }, { tenantId: message.tenantId });
  if (!accessToken) return "skipped";
  let track: CaptionTrack | null;
  if (attempt.status === "reserved") {
    if (message.quotaDate !== captionQuotaDate(clock())) return "skipped";
    if (!(await repo.transition(message, "reserved", "listing", now.toISOString())))
      return "skipped";
    try {
      track = preferredCaptionTrack(await listCaptionTracks(accessToken, message.videoId, fetcher));
    } catch {
      await repo.fail(message, now.toISOString());
      return "failed";
    }
    if (!track) {
      await repo.transition(message, "listing", "no_track", now.toISOString());
      return "no_track";
    }
    if (!(await repo.transition(message, "listing", "listed", now.toISOString(), track))) {
      return "skipped";
    }
  } else {
    // list 結果はD1に確定済み。Queue 再送でも50 unitsを重複消費しない。
    if (!attempt.caption_id || !attempt.language) return "skipped";
    track = { id: attempt.caption_id, language: attempt.language };
  }
  if (message.quotaDate !== captionQuotaDate(clock())) return "skipped";
  if (!(await repo.transition(message, "listed", "downloading", now.toISOString()))) {
    return "skipped";
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await downloadCaptionTrack(accessToken, track.id, fetcher);
  } catch {
    await repo.fail(message, now.toISOString());
    return "failed";
  }
  const currentAttempt = await repo.attempt(message);
  if (!currentAttempt || !(await repo.isCurrent(message))) return "skipped";
  if (!(await repo.beginUpload(message, currentAttempt, now.toISOString()))) return "skipped";
  try {
    await env.MEDIA.put(currentAttempt.r2_key, bytes, {
      httpMetadata: { contentType: "text/vtt; charset=utf-8" },
    });
    if (await repo.saveRecord(message, currentAttempt, bytes.byteLength, now.toISOString())) {
      return "stored";
    }
    // OFF・解除が R2 put 中に入った場合、D1 は書かない。原本も即時消す。
    await env.MEDIA.delete(currentAttempt.r2_key);
    return "skipped";
  } finally {
    await repo.finishUpload(message);
  }
}

/** ON・現行 OAuth 世代を再確認した上でのみ、保存済み字幕を読む。 */
export async function readCaptionForVideo(
  env: Bindings,
  message: Pick<
    CaptionMessage,
    "tenantId" | "channelId" | "connectedAt" | "tokenUpdatedAt" | "videoId"
  >,
  now = new Date(),
): Promise<R2ObjectBody | null> {
  if (env.CAPTIONS_COLLECTION_READY !== "1") return null;
  const repo = new CaptionsRepository(env.DB);
  const row = await repo.readableRecord(message);
  if (!row) return null;
  if (
    !Number.isFinite(Date.parse(row.fetched_at)) ||
    Date.parse(row.fetched_at) <= now.getTime() - CAPTION_MAX_AGE_MS
  )
    return null;
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return null;
  return (await repo.readableRecord(message))?.r2_key === row.r2_key ? object : null;
}

/** 30日を超えた字幕と、失敗後に残ったR2原本を、各10件ずつR2先で掃除する。 */
export async function purgeExpiredCaptions(
  env: Bindings,
  now: Date,
): Promise<{ records: number; orphans: number; remaining: boolean }> {
  const recordCutoff = new Date(now.getTime() - CAPTION_MAX_AGE_MS).toISOString();
  const orphanCutoff = new Date(now.getTime() - CAPTION_ORPHAN_AGE_MS).toISOString();
  const { results: records } = await env.DB.prepare(
    `SELECT tenant_id, video_id, r2_key, fetched_at FROM caption_records
      WHERE fetched_at <= ?1 ORDER BY fetched_at LIMIT ?2`,
  )
    .bind(recordCutoff, CAPTION_PURGE_BATCH + 1)
    .all<{ tenant_id: string; video_id: string; r2_key: string; fetched_at: string }>();
  const { results: orphans } = await env.DB.prepare(
    `SELECT a.tenant_id, a.quota_date, a.video_id, a.r2_key, a.updated_at
      FROM caption_attempts a
      WHERE a.updated_at <= ?1
        AND a.quota_date < ?3
        AND NOT EXISTS (SELECT 1 FROM caption_records r WHERE r.tenant_id = a.tenant_id
                        AND r.r2_key = a.r2_key)
        AND NOT EXISTS (SELECT 1 FROM import_uploads u WHERE u.tenant_id = a.tenant_id
                        AND u.r2_key = a.r2_key)
      ORDER BY a.updated_at LIMIT ?2`,
  )
    .bind(orphanCutoff, CAPTION_PURGE_BATCH + 1, captionQuotaDate(now))
    .all<{
      tenant_id: string;
      quota_date: string;
      video_id: string;
      r2_key: string;
      updated_at: string;
    }>();

  for (const row of records.slice(0, CAPTION_PURGE_BATCH)) {
    await env.MEDIA.delete(row.r2_key);
    await env.DB.prepare(
      `DELETE FROM caption_records WHERE tenant_id = ?1 AND video_id = ?2
        AND r2_key = ?3 AND fetched_at = ?4 AND fetched_at <= ?5`,
    )
      .bind(row.tenant_id, row.video_id, row.r2_key, row.fetched_at, recordCutoff)
      .run();
  }
  for (const row of orphans.slice(0, CAPTION_PURGE_BATCH)) {
    await env.MEDIA.delete(row.r2_key);
    await env.DB.prepare(
      `DELETE FROM caption_attempts
        WHERE tenant_id = ?1 AND quota_date = ?2 AND video_id = ?3
          AND r2_key = ?4 AND updated_at = ?5 AND updated_at <= ?6 AND quota_date < ?7
          AND NOT EXISTS (SELECT 1 FROM caption_records r WHERE r.tenant_id = ?1
                          AND r.r2_key = ?4)
          AND NOT EXISTS (SELECT 1 FROM import_uploads u WHERE u.tenant_id = ?1
                          AND u.r2_key = ?4)`,
    )
      .bind(
        row.tenant_id,
        row.quota_date,
        row.video_id,
        row.r2_key,
        row.updated_at,
        orphanCutoff,
        captionQuotaDate(now),
      )
      .run();
  }
  return {
    records: Math.min(records.length, CAPTION_PURGE_BATCH),
    orphans: Math.min(orphans.length, CAPTION_PURGE_BATCH),
    remaining: records.length > CAPTION_PURGE_BATCH || orphans.length > CAPTION_PURGE_BATCH,
  };
}
