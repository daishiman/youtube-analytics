import { queryChannelDaily, queryVideoDaily } from "../adapters/google-analytics";
import {
  channelCollectionDetails,
  listUploadPage,
  listVideoMetadata,
} from "../adapters/google-data-videos";
import { GoogleCollectionError } from "../adapters/google-youtube";
import { pacificDate } from "../domain/pacific-date";
import { DAY_MS } from "../domain/time";
import type { Bindings, CaptionMessage, CollectMessage } from "../env";
import { sendInBatches } from "../lib/queue";
import { YoutubeCollectorRepository } from "../repositories/youtube-collector-repository";
import { captionCandidates } from "./captions-collector";
import { getLinkAccessToken } from "./google-client";
import { enqueueThumbnailPasses } from "./thumbnails";

const COLLECTION_DAYS = 35;
// reports.query は指定範囲内で全 metric が揃った最終日までしか返さない。
// 昨日まで要求し、未返却日をゼロで埋めない。
const LATEST_REQUEST_OFFSET_DAYS = 1;

export function collectionDateRange(now: Date): { startDate: string; endDate: string } {
  // Analytics の day は Pacific Time。表示側の JST 日付に合わせて日境界をずらさない。
  const today = Date.parse(`${pacificDate(now)}T00:00:00.000Z`);
  const date = (offset: number) => new Date(today - offset * DAY_MS).toISOString().slice(0, 10);
  return {
    startDate: date(LATEST_REQUEST_OFFSET_DAYS + COLLECTION_DAYS - 1),
    endDate: date(LATEST_REQUEST_OFFSET_DAYS),
  };
}

/** 1日1通/連携の収集要求を送る。Cron が一覧を渡したときは D1 を読み直さない。 */
export async function enqueueDailyCollections(
  env: Bindings,
  cycleStartedAt = new Date().toISOString(),
  connections?: CollectMessage[],
): Promise<number> {
  const messages =
    connections ?? (await new YoutubeCollectorRepository(env.DB).listActiveConnections());
  await sendInBatches(
    env.COLLECT_QUEUE,
    messages.map((body) => ({ ...body, cycleStartedAt })),
  );
  return messages.length;
}

/** 世代確認を通信前と保存直前に行い、D1 の条件付き INSERT でも最終確認する。 */
export async function collectTenantDaily(
  env: Bindings,
  message: CollectMessage,
  now: Date,
): Promise<"collected" | "stale"> {
  const repository = new YoutubeCollectorRepository(env.DB);
  if (!(await repository.isCurrent(message))) return "stale";
  const accessToken = await getLinkAccessToken({ env, now }, { tenantId: message.tenantId });
  if (!accessToken) return "stale";
  const continuation = Boolean(message.uploadsPlaylistId && message.pageToken);
  if (
    (message.uploadsPlaylistId || message.pageToken) &&
    (!continuation || !message.startDate || !message.endDate)
  ) {
    throw new GoogleCollectionError(false, "Collection continuation malformed");
  }
  const dates =
    continuation && message.startDate && message.endDate
      ? { startDate: message.startDate, endDate: message.endDate }
      : collectionDateRange(now);
  const channelRows = continuation
    ? []
    : await queryChannelDaily({ accessToken, channelId: message.channelId, ...dates });
  const channelDetails = continuation
    ? null
    : await channelCollectionDetails(accessToken, message.channelId);
  const playlistId = continuation
    ? (message.uploadsPlaylistId as string)
    : (channelDetails?.uploadsPlaylistId as string);
  const page = await listUploadPage(accessToken, playlistId, message.pageToken);
  if (page.nextPageToken && page.nextPageToken === message.pageToken) {
    throw new GoogleCollectionError(false, "Uploads page did not advance");
  }
  const videos = await listVideoMetadata(accessToken, message.channelId, page.ids);
  const videoRows = await queryVideoDaily({
    accessToken,
    channelId: message.channelId,
    videoIds: videos.map((video) => video.videoId),
    ...dates,
  });
  if (!(await repository.isCurrent(message))) return "stale";
  if (channelDetails?.metadata) {
    await repository.saveChannelMetadata(message, channelDetails.metadata, now.toISOString());
  }
  if (channelRows.length) await repository.saveDaily(message, channelRows, now.toISOString());
  await repository.saveVideos(message, videos, now.toISOString());
  await repository.saveVideoDaily(message, videoRows, now.toISOString());
  if (page.nextPageToken) {
    await env.COLLECT_QUEUE.send({
      ...message,
      uploadsPlaylistId: playlistId,
      pageToken: page.nextPageToken,
      ...dates,
    });
  } else {
    await repository.markCompleted(message, now.toISOString());
    if (await repository.isCurrent(message)) {
      try {
        const candidates = await captionCandidates(env, message, now);
        if (candidates.videoIds.length > 0) {
          await sendInBatches(
            env.COLLECT_QUEUE,
            candidates.videoIds.map(
              (videoId): CaptionMessage => ({
                ...message,
                kind: "captions",
                quotaDate: candidates.quotaDate,
                videoId,
              }),
            ),
          );
        }
      } catch {
        // Analytics の再取得で字幕のクォータを消費しない。翌日の収集で候補を再投入する。
        console.warn("caption enqueue deferred", { tenantId: message.tenantId });
      }
      try {
        await enqueueThumbnailPasses({ env, now }, message.tenantId);
      } catch {
        // 画像キューの一時障害で成功済みの Analytics を取り直さない。翌日の収集で再試行する。
        console.warn("thumbnail enqueue deferred", { tenantId: message.tenantId });
      }
    }
  }
  return "collected";
}
