import { collectionHttpError, GoogleCollectionError } from "./google-youtube";

const CAPTIONS_URL = "https://www.googleapis.com/youtube/v3/captions";
export const CAPTION_MAX_BYTES = 1024 * 1024;

export interface CaptionTrack {
  id: string;
  language: string;
}

async function captionFetch(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<Response> {
  try {
    return await fetcher(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // 呼出しが Google に届いたか判断できない。呼出元は同日の再送をしない。
    throw new GoogleCollectionError(false, "Caption request outcome unknown");
  }
}

/** captions.list は 50 units。1動画につき1度だけ呼ぶ。 */
export async function listCaptionTracks(
  accessToken: string,
  videoId: string,
  fetcher: typeof fetch = fetch,
): Promise<CaptionTrack[]> {
  const url = new URL(CAPTIONS_URL);
  url.search = new URLSearchParams({ part: "id,snippet", videoId }).toString();
  const response = await captionFetch(url.toString(), accessToken, fetcher);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw collectionHttpError(response.status, body);
  }
  const body = (await response.json().catch(() => null)) as {
    items?: {
      id?: unknown;
      snippet?: { language?: unknown; status?: unknown; isDraft?: unknown };
    }[];
  } | null;
  if (!body || !Array.isArray(body.items)) {
    throw new GoogleCollectionError(false, "Caption list response malformed");
  }
  return body.items.flatMap((item) => {
    const { id, snippet } = item;
    if (
      typeof id !== "string" ||
      !id ||
      typeof snippet?.language !== "string" ||
      !snippet.language ||
      snippet.status !== "serving" ||
      snippet.isDraft === true
    )
      return [];
    return [{ id, language: snippet.language }];
  });
}

/** captions.download は 200 units。VTT を要求し、サイズを制限して原本を返す。 */
export async function downloadCaptionTrack(
  accessToken: string,
  captionId: string,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array<ArrayBuffer>> {
  const url = new URL(`${CAPTIONS_URL}/${encodeURIComponent(captionId)}`);
  url.search = new URLSearchParams({ tfmt: "vtt" }).toString();
  const response = await captionFetch(url.toString(), accessToken, fetcher);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw collectionHttpError(response.status, body);
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > CAPTION_MAX_BYTES) throw new GoogleCollectionError(false, "Caption too large");
  if (!response.body) throw new GoogleCollectionError(false, "Caption body missing");
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > CAPTION_MAX_BYTES) throw new GoogleCollectionError(false, "Caption too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!length) throw new GoogleCollectionError(false, "Caption body empty");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** 言語を日本語、英語、その他の順に選ぶ。 */
export function preferredCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const rank = (language: string) =>
    language === "ja" || language.startsWith("ja-")
      ? 0
      : language === "en" || language.startsWith("en-")
        ? 1
        : 2;
  return [...tracks].sort((a, b) => rank(a.language) - rank(b.language))[0] ?? null;
}
