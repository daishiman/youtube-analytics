// サムネイルの保存・配信・削除（qa-095・qa-098）。YouTube の画像は自サイト経由で配り、CSP img-src は 'self' data: のまま。
// サムネイルは Analytics 以外の認可データ（YouTube API Developer Policies III.E.4）なので、25日で取り直し、
// 30日を超えたものは配らず Cron 役割①で R2 と media_assets から消す
import { jstToday } from "../domain/dashboard-period";
import { API_DATA_MAX_AGE_DAYS, API_DATA_REFRESH_DAYS } from "../domain/data-retention";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { DAY_MS } from "../domain/time";
import type { Bindings, ThumbnailMessage } from "../env";
import { AppError } from "../lib/errors";
import { noPendingDeletion } from "../repositories/active-link";
import { DashboardRepository } from "../repositories/dashboard-repository";
import { controlDb } from "../repositories/db";
import { UsageRepository } from "../repositories/settings-repository";
import { YoutubeCollectorRepository } from "../repositories/youtube-collector-repository";
import { type Deps, iso } from "./common";
import { thumbnailSendsPerDay } from "./queue-budget";

export const THUMBNAIL_REFRESH_DAYS = API_DATA_REFRESH_DAYS;
export const THUMBNAIL_MAX_AGE_DAYS = API_DATA_MAX_AGE_DAYS;
/** 1通の件数。1件 = fetch 1 + R2 put 1 + D1 更新 1 で、15件 = 45 subrequest（Free は1実行50件） */
export const THUMBNAIL_ITEMS_PER_MESSAGE = 15;
export const THUMBNAIL_MESSAGES_PER_DAY = 3;
/** 動画が多いテナントは公開日の新しい順にこの本数だけ保存する（取り直しと削除の繰り返しを防ぐ） */
export const THUMBNAIL_TENANT_CAP = 1000;
export const THUMBNAIL_TENANT_CAP_THRESHOLD = 1100;
/** Cron 役割①で1回に扱うテナント数（1テナント R2 delete 1 + D1 削除 1。抽出1件と既存処理の14件を残す） */
export const THUMBNAIL_PURGE_TENANTS_PER_RUN = 12;
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
/** 画像1件の取得待ちの上限。遅いホストで1通の他の件と consumer の実行時間を止めない */
const THUMBNAIL_FETCH_TIMEOUT_MS = 10_000;
/** 取得を許すホスト（Data API の snippet.thumbnails が返す YouTube の画像ホストだけ。SSRF を防ぐ） */
const ALLOWED_THUMBNAIL_HOSTS = /^(i\d?\.ytimg\.com|yt\d\.ggpht\.com)$/;

export const thumbnailKey = (tenantId: string, videoId: string, generation?: number) =>
  generation === undefined
    ? `tenants/${tenantId}/thumbnails/${videoId}`
    : `tenants/${tenantId}/generations/g${generation}/thumbnails/${videoId}`;

interface ThumbnailConnection {
  channel_id: string;
  connected_at: string;
  import_generation: number;
}

async function currentConnection(
  db: D1Database,
  tenantId: string,
): Promise<ThumbnailConnection | null> {
  return db
    .prepare(
      `SELECT c.channel_id, c.connected_at, t.import_generation
       FROM channels c JOIN tenants t ON t.tenant_id = c.tenant_id
      WHERE c.tenant_id = ?1 AND c.status = '正常' AND t.deleted_at IS NULL
        AND ${noPendingDeletion("c.tenant_id")}`,
    )
    .bind(tenantId)
    .first<ThumbnailConnection>();
}

export function isAllowedThumbnailUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && ALLOWED_THUMBNAIL_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/** GET /api/media/thumbnails/:video_id。自テナントの行で30日以内のものだけ返す（他テナントや期限切れは 404） */
export async function getThumbnail(
  deps: Deps,
  ctx: TenantContext,
  videoId: string,
): Promise<{ body: ReadableStream; contentType: string }> {
  requirePermission(ctx, "tenant.read");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(videoId)) throw new AppError("NOT_FOUND");
  const row = await new DashboardRepository(controlDb(deps.env), ctx).thumbnail(videoId);
  if (!row) throw new AppError("NOT_FOUND");
  if (deps.now.getTime() - Date.parse(row.fetched_at) > THUMBNAIL_MAX_AGE_DAYS * DAY_MS) {
    throw new AppError("NOT_FOUND");
  }
  const obj = await deps.env.MEDIA.get(row.r2_key);
  if (!obj) throw new AppError("NOT_FOUND");
  return { body: obj.body, contentType: obj.httpMetadata?.contentType ?? "image/jpeg" };
}

/**
 * 取り直し対象を選んで thumbnail 通を送る。上流の毎日収集の通（collectTenantDaily）の最後に呼ぶ想定。
 * subrequest は D1 抽出1・有効連携数1・予算確認1・sendBatch 1 の4件。送った通数を返す
 */
export async function enqueueThumbnailPasses(
  deps: Deps,
  tenantId: string,
): Promise<{ sent: number; items: number; deferred: boolean }> {
  const db = controlDb(deps.env);
  const connection = await currentConnection(db, tenantId);
  if (!connection) return { sent: 0, items: 0, deferred: false };
  const refreshBefore = iso(new Date(deps.now.getTime() - THUMBNAIL_REFRESH_DAYS * DAY_MS));
  const limit = THUMBNAIL_ITEMS_PER_MESSAGE * THUMBNAIL_MESSAGES_PER_DAY;
  // 優先順: 未保存 → URL が変わった → 保存日の古い順。1,100本を超えるテナントは新しい1,000本だけ
  const { results } = await db
    .prepare(
      `WITH counted AS (SELECT COUNT(*) AS n FROM videos WHERE tenant_id = ?1),
            eligible AS (
              SELECT v.video_id, v.thumbnail_url, v.published_at FROM videos v
               WHERE v.tenant_id = ?1 AND v.channel_id = ?6 AND v.thumbnail_url IS NOT NULL
               ORDER BY v.published_at DESC
               LIMIT CASE WHEN (SELECT n FROM counted) > ?4 THEN ?5 ELSE -1 END)
       SELECT e.video_id, e.thumbnail_url,
              CASE WHEN m.fetched_at IS NULL THEN 0
                   WHEN m.source_url <> e.thumbnail_url THEN 1
                   ELSE 2 END AS priority
         FROM eligible e
         LEFT JOIN media_assets m ON m.tenant_id = ?1 AND m.asset_id = 'thumbnail:' || e.video_id
        WHERE m.fetched_at IS NULL OR m.source_url <> e.thumbnail_url OR m.fetched_at < ?2
        ORDER BY priority, m.fetched_at, e.published_at DESC
        LIMIT ?3`,
    )
    .bind(
      tenantId,
      refreshBefore,
      limit,
      THUMBNAIL_TENANT_CAP_THRESHOLD,
      THUMBNAIL_TENANT_CAP,
      connection.channel_id,
    )
    .all<{ video_id: string; thumbnail_url: string }>();
  if (results.length === 0) return { sent: 0, items: 0, deferred: false };

  // 全テナント合計の Queue 操作が1日の予算を超える見込みなら翌日に回す
  const activeConnections = await new YoutubeCollectorRepository(db).countActiveConnections();
  const allowed = await new UsageRepository(db).hit(
    `queue-ops:thumbnail:${jstToday(deps.now)}`,
    thumbnailSendsPerDay(activeConnections, THUMBNAIL_MESSAGES_PER_DAY),
    DAY_MS,
    deps.now,
  );
  if (!allowed) return { sent: 0, items: 0, deferred: true };

  const messages: { body: ThumbnailMessage }[] = [];
  for (let i = 0; i < results.length; i += THUMBNAIL_ITEMS_PER_MESSAGE) {
    messages.push({
      body: {
        kind: "thumbnail",
        tenantId,
        channelId: connection.channel_id,
        connectedAt: connection.connected_at,
        generation: connection.import_generation,
        items: results
          .slice(i, i + THUMBNAIL_ITEMS_PER_MESSAGE)
          .map((r) => ({ videoId: r.video_id, url: r.thumbnail_url })),
      },
    });
  }
  await deps.env.THUMBNAIL_QUEUE.sendBatch(messages);
  return { sent: messages.length, items: results.length, deferred: false };
}

/** thumbnail 通の consumer。1件ずつ fetch → R2 put → D1 upsert。失敗した件は次回の抽出で拾い直す */
export async function processThumbnailMessage(
  env: Bindings,
  message: ThumbnailMessage,
  now: Date,
  fetcher: typeof fetch = fetch,
): Promise<{ saved: number; skipped: number }> {
  const db = controlDb(env);
  let saved = 0;
  let skipped = 0;
  const connection = await currentConnection(db, message.tenantId);
  if (
    !connection ||
    connection.channel_id !== message.channelId ||
    connection.connected_at !== message.connectedAt ||
    connection.import_generation !== message.generation
  ) {
    return { saved: 0, skipped: Math.min(message.items.length, THUMBNAIL_ITEMS_PER_MESSAGE) };
  }
  const items = message.items.slice(0, THUMBNAIL_ITEMS_PER_MESSAGE);
  const { results: knownVideos } = await db
    .prepare(
      `SELECT video_id, thumbnail_url FROM videos WHERE tenant_id = ?1 AND channel_id = ?2
       AND video_id IN (SELECT value FROM json_each(?3))`,
    )
    .bind(message.tenantId, message.channelId, JSON.stringify(items.map((item) => item.videoId)))
    .all<{ video_id: string; thumbnail_url: string | null }>();
  const urls = new Map(knownVideos.map((row) => [row.video_id, row.thumbnail_url]));
  for (const item of items) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(item.videoId) || !isAllowedThumbnailUrl(item.url)) {
      skipped += 1;
      continue;
    }
    if (urls.get(item.videoId) !== item.url) {
      skipped += 1;
      continue;
    }
    let res: Response;
    try {
      res = await fetcher(item.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(THUMBNAIL_FETCH_TIMEOUT_MS),
      });
    } catch {
      // 時間切れ・通信失敗の件は飛ばし、次回の抽出で拾い直す（同じ通の他の件は続ける）
      skipped += 1;
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const length = Number(res.headers.get("content-length") ?? "0");
    if (!res.ok || !contentType.startsWith("image/") || length > THUMBNAIL_MAX_BYTES) {
      skipped += 1;
      continue;
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > THUMBNAIL_MAX_BYTES) {
      skipped += 1;
      continue;
    }
    const key = thumbnailKey(message.tenantId, item.videoId, message.generation);
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });
    const written = await db
      .prepare(
        `INSERT INTO media_assets (tenant_id, asset_id, video_id, kind, r2_key, content_type, bytes, source_url, fetched_at)
         SELECT ?1, ?2, ?3, 'thumbnail', ?4, ?5, ?6, ?7, ?8
          WHERE EXISTS (
            SELECT 1 FROM videos v JOIN channels c ON c.tenant_id = v.tenant_id
              AND c.channel_id = v.channel_id JOIN tenants t ON t.tenant_id = c.tenant_id
             WHERE v.tenant_id = ?1 AND v.video_id = ?3 AND v.thumbnail_url = ?7
               AND c.channel_id = ?9 AND c.connected_at = ?10 AND c.status = '正常'
               AND t.import_generation = ?11 AND t.deleted_at IS NULL
               AND ${noPendingDeletion("?1")})
         ON CONFLICT (tenant_id, asset_id) DO UPDATE SET
           r2_key = excluded.r2_key, content_type = excluded.content_type, bytes = excluded.bytes,
           source_url = excluded.source_url, fetched_at = excluded.fetched_at`,
      )
      .bind(
        message.tenantId,
        `thumbnail:${item.videoId}`,
        item.videoId,
        key,
        contentType,
        bytes.byteLength,
        item.url,
        iso(now),
        message.channelId,
        message.connectedAt,
        message.generation,
      )
      .run();
    if (written.meta.changes === 1) saved += 1;
    else skipped += 1;
  }
  return { saved, skipped };
}

/**
 * Cron 役割①: fetched_at が30日を超えたサムネイルを R2 と media_assets から消す。
 * D1 抽出1回 + テナントごとに R2 delete 1回（最大1,000キー）+ D1 削除1回。1実行12テナントまで。
 * 抽出結果も12,001行で止め、超過分は cleanup Queue の次の通で処理する。
 */
export async function purgeExpiredThumbnails(
  env: Bindings,
  now: Date,
): Promise<{ tenants: number; deleted: number; remaining: boolean }> {
  const db = controlDb(env);
  const before = iso(new Date(now.getTime() - THUMBNAIL_MAX_AGE_DAYS * DAY_MS));
  const { results } = await db
    .prepare(
      `SELECT tenant_id, asset_id, r2_key FROM media_assets
        WHERE kind = 'thumbnail' AND fetched_at < ?1
          AND tenant_id IN (SELECT DISTINCT tenant_id FROM media_assets
                             WHERE kind = 'thumbnail' AND fetched_at < ?1
                             ORDER BY tenant_id LIMIT ?2)
        ORDER BY tenant_id, fetched_at
        LIMIT ?3`,
    )
    .bind(before, THUMBNAIL_PURGE_TENANTS_PER_RUN + 1, THUMBNAIL_PURGE_TENANTS_PER_RUN * 1000 + 1)
    .all<{ tenant_id: string; asset_id: string; r2_key: string }>();

  const byTenant = new Map<string, { asset_id: string; r2_key: string }[]>();
  for (const r of results) {
    const list = byTenant.get(r.tenant_id) ?? [];
    list.push(r);
    byTenant.set(r.tenant_id, list);
  }
  const tenants = [...byTenant.keys()];
  let remaining = tenants.length > THUMBNAIL_PURGE_TENANTS_PER_RUN;
  let deleted = 0;
  for (const tenantId of tenants.slice(0, THUMBNAIL_PURGE_TENANTS_PER_RUN)) {
    const rows = byTenant.get(tenantId) ?? [];
    const batch = rows.slice(0, 1000);
    if (rows.length > batch.length) remaining = true;
    await env.MEDIA.delete(batch.map((r) => r.r2_key));
    await db
      .prepare(
        `DELETE FROM media_assets
          WHERE tenant_id = ?1 AND kind = 'thumbnail' AND fetched_at < ?2
            AND asset_id IN (SELECT value FROM json_each(?3))`,
      )
      .bind(tenantId, before, JSON.stringify(batch.map((r) => r.asset_id)))
      .run();
    deleted += batch.length;
  }
  return { tenants: Math.min(tenants.length, THUMBNAIL_PURGE_TENANTS_PER_RUN), deleted, remaining };
}
