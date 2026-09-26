/** Shortsを確定できない動画は、長さだけで長尺と断定しない。 */
export type VideoContentType = "shorts" | "long" | "live" | "unknown";

export function videoContentTypeLabel(type: VideoContentType): string {
  switch (type) {
    case "shorts":
      return "Shorts";
    case "long":
      return "長尺";
    case "live":
      return "ライブ";
    case "unknown":
      return "形式未確定";
  }
}
