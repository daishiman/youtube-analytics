import type { VideoContentType } from "../domain/video-content-type";
import { collectionHttpError, GoogleCollectionError } from "./google-youtube";

export const YOUTUBE_PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";
export const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

export interface DiscoveredVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  contentType: VideoContentType;
  durationSeconds: number | null;
  liveBroadcastContent: string | null;
  hasLiveStreamingDetails: boolean;
  thumbnailUrl: string | null;
}

interface UploadPage {
  ids: string[];
  nextPageToken: string | null;
}

async function getJson(url: URL, accessToken: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GoogleCollectionError(true, "YouTube Data API network failure");
  }
  const raw = await response.json().catch(() => null);
  if (!response.ok) throw collectionHttpError(response.status, raw);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new GoogleCollectionError(true, "YouTube Data API response malformed");
  }
  return raw as Record<string, unknown>;
}

function itemsOf(raw: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(raw.items)) {
    throw new GoogleCollectionError(true, "YouTube Data API items missing");
  }
  if (raw.items.some((item) => item === null || typeof item !== "object" || Array.isArray(item))) {
    throw new GoogleCollectionError(true, "YouTube Data API item malformed");
  }
  return raw.items as Record<string, unknown>[];
}

export interface CollectionChannelDetails {
  uploadsPlaylistId: string;
  metadata: {
    title: string;
    thumbnailUrl: string | null;
    subscriberCount: number | null;
  } | null;
}

/** uploads一覧の取得に必須な channels.list で、表示用メタデータも同時に取り直す。 */
export async function channelCollectionDetails(
  accessToken: string,
  channelId: string,
): Promise<CollectionChannelDetails> {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.search = new URLSearchParams({
    part: "contentDetails,snippet,statistics",
    id: channelId,
  }).toString();
  const raw = await getJson(url, accessToken);
  const channel = itemsOf(raw).find((item) => item.id === channelId);
  const details = channel?.contentDetails as Record<string, unknown> | undefined;
  const related = details?.relatedPlaylists as Record<string, unknown> | undefined;
  const uploads = related?.uploads;
  if (typeof uploads !== "string" || !uploads) {
    throw new GoogleCollectionError(false, "Linked channel uploads playlist unavailable");
  }
  const snippet = channel?.snippet as Record<string, unknown> | undefined;
  const title = snippet?.title;
  const thumbnails = snippet?.thumbnails as Record<string, { url?: unknown }> | undefined;
  const thumbnail = thumbnails?.default?.url ?? thumbnails?.medium?.url;
  const statistics = channel?.statistics as Record<string, unknown> | undefined;
  const subscriberCount = Number(statistics?.subscriberCount);
  return {
    uploadsPlaylistId: uploads,
    metadata:
      typeof title === "string" && title.trim()
        ? {
            title,
            thumbnailUrl:
              typeof thumbnail === "string" && thumbnail.startsWith("https://") ? thumbnail : null,
            subscriberCount:
              statistics?.hiddenSubscriberCount === true ||
              (typeof statistics?.subscriberCount !== "string" &&
                typeof statistics?.subscriberCount !== "number") ||
              !Number.isSafeInteger(subscriberCount) ||
              subscriberCount < 0
                ? null
                : subscriberCount,
          }
        : null,
  };
}

/** uploads playlist を1ページ（最大50本）だけ読む。次ページは別 Queue 通に渡す。 */
export async function listUploadPage(
  accessToken: string,
  playlistId: string,
  pageToken?: string,
): Promise<UploadPage> {
  const url = new URL(YOUTUBE_PLAYLIST_ITEMS_URL);
  url.search = new URLSearchParams({
    part: "contentDetails",
    playlistId,
    maxResults: "50",
    ...(pageToken ? { pageToken } : {}),
  }).toString();
  const raw = await getJson(url, accessToken);
  const ids = itemsOf(raw).flatMap((item) => {
    const details = item.contentDetails as Record<string, unknown> | undefined;
    return typeof details?.videoId === "string" && details.videoId ? [details.videoId] : [];
  });
  const nextPageToken = raw.nextPageToken;
  if (nextPageToken !== undefined && typeof nextPageToken !== "string") {
    throw new GoogleCollectionError(true, "Uploads pagination token malformed");
  }
  return {
    ids: [...new Set(ids)],
    nextPageToken: typeof nextPageToken === "string" && nextPageToken ? nextPageToken : null,
  };
}

function durationSeconds(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(raw);
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 86_400 +
    Number(match[2] ?? 0) * 3_600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0)
  );
}

/** Data API には Shorts 確定フラグがない。短尺・duration 不明は unknown として保存する。 */
export function classifyVideo(input: {
  duration?: unknown;
  liveBroadcastContent?: unknown;
  liveStreamingDetails?: unknown;
}): VideoContentType {
  if (
    input.liveBroadcastContent === "live" ||
    input.liveBroadcastContent === "upcoming" ||
    (input.liveStreamingDetails !== null && typeof input.liveStreamingDetails === "object")
  ) {
    return "live";
  }
  const seconds = durationSeconds(input.duration);
  return seconds !== null && seconds > 180 ? "long" : "unknown";
}

/** videos.list の id filter は最大50件。返却されない動画は欠測のまま残す。 */
export async function listVideoMetadata(
  accessToken: string,
  channelId: string,
  ids: string[],
): Promise<DiscoveredVideo[]> {
  if (ids.length === 0) return [];
  if (ids.length > 50) throw new Error("videos.list accepts at most 50 IDs per request");
  const url = new URL(YOUTUBE_VIDEOS_URL);
  url.search = new URLSearchParams({
    part: "snippet,contentDetails,liveStreamingDetails",
    id: ids.join(","),
  }).toString();
  const allowed = new Set(ids);
  const raw = await getJson(url, accessToken);
  return itemsOf(raw).flatMap((item) => {
    const id = item.id;
    const snippet = item.snippet as Record<string, unknown> | undefined;
    if (typeof id !== "string" || !allowed.has(id) || snippet?.channelId !== channelId) return [];
    if (
      typeof snippet.title !== "string" ||
      typeof snippet.publishedAt !== "string" ||
      !Number.isFinite(Date.parse(snippet.publishedAt))
    ) {
      throw new GoogleCollectionError(true, "Video metadata malformed");
    }
    const details = item.contentDetails as Record<string, unknown> | undefined;
    const thumbnails = snippet.thumbnails as Record<string, { url?: unknown }> | undefined;
    const thumbnail = thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;
    const duration = durationSeconds(details?.duration);
    const liveBroadcastContent =
      typeof snippet.liveBroadcastContent === "string" ? snippet.liveBroadcastContent : null;
    const hasLiveStreamingDetails =
      item.liveStreamingDetails !== null && typeof item.liveStreamingDetails === "object";
    return [
      {
        videoId: id,
        title: snippet.title,
        publishedAt: new Date(snippet.publishedAt).toISOString(),
        contentType: classifyVideo({
          duration: details?.duration,
          liveBroadcastContent,
          liveStreamingDetails: item.liveStreamingDetails,
        }),
        durationSeconds: duration,
        liveBroadcastContent,
        hasLiveStreamingDetails,
        thumbnailUrl:
          typeof thumbnail === "string" && thumbnail.startsWith("https://") ? thumbnail : null,
      },
    ];
  });
}
