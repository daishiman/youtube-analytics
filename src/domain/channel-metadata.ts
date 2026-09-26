import { API_DATA_MAX_AGE_MS } from "./data-retention";

export const CHANNEL_METADATA_MAX_AGE_MS = API_DATA_MAX_AGE_MS;
export const EXPIRED_CHANNEL_TITLE = "チャンネル情報の再取得待ち";

export function channelMetadataExpired(fetchedAt: string | null, now: Date): boolean {
  if (!fetchedAt) return true;
  const fetched = Date.parse(fetchedAt);
  return !Number.isFinite(fetched) || now.getTime() - fetched > CHANNEL_METADATA_MAX_AGE_MS;
}
