// migrations の CHECK 制約と src/domain の語彙・上限が同じかを確かめる。適用後の表定義（sqlite_master）を読むので、
// 表を作り直した migration（0013 など）があっても最後の定義で比べる。片方だけを直すとここが落ちる
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  CREATED_VIA,
  INSTRUCTION_MAX,
  REQUEST_STATUSES,
  STAGE_LABELS,
} from "../../src/domain/analysis";
import {
  CAUSE_METRICS,
  EMOTIONS,
  INTENTS,
  OUTCOMES,
  PSYCH_LAYERS,
  REPORT_HTML_MAX_BYTES,
  STAGES,
  VERDICTS,
} from "../../src/domain/report-schema";

const TABLE_SQL = "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?";

async function tableSql(table: string): Promise<string> {
  const row = await env.DB.prepare(TABLE_SQL).bind(table).first<{ sql: string }>();
  if (!row) throw new Error(`表 ${table} がありません`);
  return row.sql;
}

/** CHECK (column IN ('a', 'b')) の値。見つからなければ落とす（空振りで通らないように） */
async function checkValues(table: string, column: string): Promise<string[]> {
  const inside = (await tableSql(table)).match(new RegExp(`\\b${column} IN \\(([^)]*)\\)`))?.[1];
  if (inside === undefined) throw new Error(`${table}.${column} に IN の CHECK がありません`);
  return inside.split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
}

/** CHECK の数値（pattern のキャプチャ）。見つからなければ落とす */
async function checkNumbers(table: string, pattern: RegExp): Promise<number[]> {
  const m = (await tableSql(table)).match(pattern);
  if (!m) throw new Error(`${table} に ${pattern} の CHECK がありません`);
  return m.slice(1).map(Number);
}

const VOCABULARY: [string, string, string, readonly string[]][] = [
  ["analysis_requests", "status", "REQUEST_STATUSES", REQUEST_STATUSES],
  ["analysis_requests", "created_via", "CREATED_VIA", CREATED_VIA],
  ["reports", "outcome", "OUTCOMES", OUTCOMES],
  ["findings", "verdict", "VERDICTS", VERDICTS],
  ["actions", "stage", "STAGES", STAGES],
  ["actions", "metric", "CAUSE_METRICS", CAUSE_METRICS],
  ["psych_findings", "layer", "PSYCH_LAYERS", PSYCH_LAYERS],
  ["comment_emotions", "emotion", "EMOTIONS", EMOTIONS],
  ["comment_emotions", "intent", "INTENTS", INTENTS],
];

describe("migrations の CHECK と domain の語彙", () => {
  it.each(VOCABULARY)("%s.%s は %s と同じ値だけを許す", async (table, column, _name, values) => {
    expect((await checkValues(table, column)).sort()).toEqual([...values].sort());
  });
});

describe("migrations の CHECK と domain の上限", () => {
  it("補足指示の文字数上限は INSTRUCTION_MAX", async () => {
    const [max] = await checkNumbers("analysis_requests", /length\(instruction\) <= (\d+)/);
    expect(max).toBe(INSTRUCTION_MAX);
  });

  it("依頼の段階は STAGE_LABELS の添字（0〜最後）", async () => {
    const range = await checkNumbers("analysis_requests", /\bstage BETWEEN (\d+) AND (\d+)/);
    expect(range).toEqual([0, STAGE_LABELS.length - 1]);
  });

  it("report_html のバイト数上限は REPORT_HTML_MAX_BYTES", async () => {
    const [max] = await checkNumbers("reports", /length\(CAST\(report_html AS BLOB\)\) <= (\d+)/);
    expect(max).toBe(REPORT_HTML_MAX_BYTES);
  });
});
