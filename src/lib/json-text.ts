// JSON 文字列の読み取り（画面の取込・スキル API・保存済み列の読み出しで共用）。
// 構文の誤りは「N行目」で返す

export type JsonTextResult =
  | { ok: true; value: unknown }
  | { ok: false; line: number; detail: string };

/** 文字位置 → 1 始まりの行番号 */
export function lineAt(text: string, position: number): number {
  let line = 1;
  for (let i = 0; i < Math.min(position, text.length); i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * JSON.parse のエラー文から位置を取り出す。V8 は "at position N" か "(line L column C)" を付ける。
 * どちらも無いときは末尾（途中で終わった JSON）とみなす
 */
export function parseJsonText(text: string): JsonTextResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lineCol = msg.match(/line (\d+) column \d+/);
    if (lineCol?.[1]) return { ok: false, line: Number(lineCol[1]), detail: msg };
    const pos = msg.match(/position (\d+)/);
    return { ok: false, line: lineAt(text, pos?.[1] ? Number(pos[1]) : text.length), detail: msg };
  }
}

/** 保存済みの JSON 列を読む。壊れていれば fallback（書込時に検証済みなので通常は起きない） */
export function parseJsonOr<T>(text: string | null | undefined, fallback: T): T {
  if (text == null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
