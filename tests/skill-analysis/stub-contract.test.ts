// 境界スタブ（fixtures/skill-requests-stub-server.mjs）が、サーバの写しとしてずれていないかを確かめる。
// スタブは node:http で動くので import せず、本文を文字列で読み、エラー表・版ヘッダ・依頼の語彙を取り出して比べる。
// 取り出せなければ落とす（正規表現の空振りで通らないように）
import { describe, expect, it } from "vitest";
import {
  CREATED_VIA,
  REQUEST_STATUSES,
  SKILL_API_VERSION,
  STAGE_LABELS,
} from "../../src/domain/analysis";
import { ERRORS } from "../../src/lib/errors";
import STUB from "./fixtures/skill-requests-stub-server.mjs?raw";

/** エラー表の1件: CODE: [状態コード, "文言", "hint"]（1行でも複数行でも） */
const ENTRY = /(\w+):\s*\[\s*(\d{3}),\s*"([^"]*)",\s*"([^"]*)",?\s*\]/g;

/** pattern（g 付き）のすべての一致のキャプチャ */
function all(source: string, pattern: RegExp): string[][] {
  return [...source.matchAll(pattern)].map((m) => m.slice(1));
}

/** pattern の最初の一致のキャプチャ。見つからなければ落とす */
function capture(source: string, pattern: RegExp): string[] {
  const m = source.match(pattern);
  if (!m) throw new Error(`スタブに ${pattern} がありません`);
  return m.slice(1);
}

/** スタブの ERRORS 表（コード → [状態コード, 文言, hint]）と、表に書かれたキーの列 */
function stubErrors() {
  const [block = ""] = capture(STUB, /const ERRORS = \{([\s\S]*?)\n\};/);
  const table: Record<string, unknown[]> = {};
  for (const [code = "", status, message, hint] of all(block, ENTRY)) {
    table[code] = [Number(status), message, hint];
  }
  return { table, keys: all(block, /^ {2}(\w+):/gm).map(([key]) => key) };
}

describe("エラー表（ERRORS）", () => {
  it("1件以上あり、各コードの状態コード・文言・hint は src/lib/errors.ts と同じ", () => {
    const { table, keys } = stubErrors();
    const codes = Object.keys(table);
    expect(codes.length).toBeGreaterThan(0);
    // 表のキーをすべて取り出せている（複数行に折れた行を読み落としていない）
    expect(codes).toEqual(keys);
    const server = Object.fromEntries(
      codes.map((c) => [c, c in ERRORS ? [...ERRORS[c as keyof typeof ERRORS]] : null]),
    );
    expect(table).toEqual(server);
  });

  it("スタブが返すエラーコード（fail の第2引数）は、表のコードと同じ集合", () => {
    const used = new Set(all(STUB, /\bfail\(\s*res,\s*"(\w+)"/g).map(([code]) => code));
    expect(used.size).toBeGreaterThan(0);
    expect([...used].sort()).toEqual(Object.keys(stubErrors().table).sort());
  });
});

describe("版ヘッダ（X-Skill-Api-Version）", () => {
  it("応答に付ける版と受け付ける版は SKILL_API_VERSION", () => {
    const [header] = capture(STUB, /"x-skill-api-version": "([^"]*)"/);
    const [accepted] = capture(STUB, /apiVersion !== "([^"]*)"/);
    expect([header, accepted]).toEqual([SKILL_API_VERSION, SKILL_API_VERSION]);
  });
});

describe("依頼の語彙（requestOf と PATCH の検査）", () => {
  it("作る依頼の status・createdVia・stage は REQUEST_STATUSES・CREATED_VIA・STAGE_LABELS の値", () => {
    const [body = ""] = capture(STUB, /function requestOf\(([\s\S]*?)\n\}/);
    const [status] = capture(body, /\bstatus: "([^"]*)"/);
    const [createdVia] = capture(body, /\bcreatedVia: "([^"]*)"/);
    const [stage] = capture(body, /\bstage: (\d+)/);
    expect(REQUEST_STATUSES).toContain(status);
    expect(CREATED_VIA).toContain(createdVia);
    expect(STAGE_LABELS[Number(stage)]).toBeDefined();
  });

  it("PATCH で受ける stage は 1〜STAGE_LABELS の最後の添字、status は REQUEST_STATUSES の値", () => {
    const range = capture(STUB, /\bstage >= (\d+) && stage <= (\d+)/).map(Number);
    expect(range).toEqual([1, STAGE_LABELS.length - 1]);
    const statuses = all(STUB, /\bstatus !== "([^"]*)"/g).map(([s]) => s);
    expect(statuses.length).toBeGreaterThan(0);
    expect(REQUEST_STATUSES).toEqual(expect.arrayContaining(statuses));
  });
});
