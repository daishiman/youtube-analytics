// スキル（.claude/skills/yt-analyze/lib）の語彙と定数が、サーバと画面の正本（src/domain）と同じかを確かめる。
// スキルは TS を import できないので値を写して持っており、片方だけを直すとここが落ちる。
// 結果 JSON の下流のキーは、sample の export から実際に作った出力で比べる
import { describe, expect, it } from "vitest";
import * as causal from "../../.claude/skills/yt-analyze/lib/causal-language.mjs";
import * as client from "../../.claude/skills/yt-analyze/lib/client.mjs";
import * as compute from "../../.claude/skills/yt-analyze/lib/compute.mjs";
import * as funnel from "../../.claude/skills/yt-analyze/lib/funnel.mjs";
import { SKILL_API_VERSION } from "../../src/domain/analysis";
import * as schema from "../../src/domain/report-schema";
import BRIEF from "../fixtures/skill-analysis-sample/brief.json";
import EXPORT from "../fixtures/skill-analysis-sample/export-v1.json";
import { EXPORT_BOUNDARY_DDL } from "./helpers";

const sorted = (xs) => [...xs].sort();
const keysOf = (o) => sorted(Object.keys(o));

/** オブジェクトのキーを逆順に並べた複製（値は同じ） */
function reverseKeys(v) {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (!v || typeof v !== "object") return v;
  const entries = Object.entries(v).map(([k, x]) => [k, reverseKeys(x)]);
  return Object.fromEntries(entries.reverse());
}

describe("原因指標とファネル段（funnel.mjs と report-schema）", () => {
  it("原因指標の id（表示順）と表示名・単位・ファネル段は CAUSE_METRICS・CAUSE_METRIC_INFO と同じ", () => {
    expect(funnel.CAUSE_METRICS.map((m) => m.id)).toEqual(schema.CAUSE_METRICS);
    const info = funnel.CAUSE_METRICS.map(({ id, label, unit, stage }) => [
      id,
      { label, unit, stage },
    ]);
    expect(Object.fromEntries(info)).toEqual(schema.CAUSE_METRIC_INFO);
  });

  it("ファネル段は STAGES と同じ順序", () => {
    expect(funnel.STAGES).toEqual(schema.STAGES);
  });
});

describe("定数の写し（compute・client・causal-language）", () => {
  it("参照する過去の版の上限は HISTORY_LIMIT と同じ", () => {
    expect(compute.HISTORY_LIMIT).toBe(schema.HISTORY_LIMIT);
  });

  it("API の版は SKILL_API_VERSION と同じ", () => {
    expect(client.SKILL_API_VERSION).toBe(SKILL_API_VERSION);
  });

  it("因果を断定する言い回しは CAUSAL_PATTERNS と同じ（source・flags・順序）", () => {
    const view = (patterns) => patterns.map((p) => [p.source, p.flags]);
    expect(view(causal.CAUSAL_PATTERNS)).toEqual(view(schema.CAUSAL_PATTERNS));
  });

  it("書き出し行の source は、書き出し元の境界スタブの CHECK と同じ集合", () => {
    const inside = EXPORT_BOUNDARY_DDL.join("\n").match(/\bsource IN \(([^)]*)\)/)?.[1] ?? "";
    const values = inside.split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    expect(sorted(funnel.SOURCES)).toEqual(sorted(values));
  });
});

describe("結果 JSON のキー（sample の export から作った出力）", () => {
  const a = compute.analyzeExport(EXPORT, BRIEF);

  it("週次ファネルの行は week と WEEKLY_VALUE_KEYS を持ち、RDS に渡す CSV の列はその中にある", () => {
    const rowKeys = ["week", ...schema.WEEKLY_VALUE_KEYS];
    expect(a.funnel.length).toBeGreaterThan(0);
    for (const w of a.funnel) expect(keysOf(w)).toEqual(sorted(rowKeys));
    expect(rowKeys).toEqual(expect.arrayContaining(compute.FUNNEL_CSV_COLUMNS));
  });

  it("対象週の下流（results.downstream）のキーは DOWNSTREAM_KEYS", () => {
    expect(keysOf(a.diagnosis.downstream)).toEqual(sorted(schema.DOWNSTREAM_KEYS));
  });

  it("前回との差（downstream_delta）とアクションの効果（downstream）のキーは DOWNSTREAM_DELTA_KEYS", () => {
    const deltaKeys = sorted(schema.DOWNSTREAM_DELTA_KEYS);
    expect(a.history.changes).not.toBeNull();
    expect(keysOf(a.history.changes.downstream_delta)).toEqual(deltaKeys);
    expect(a.history.action_effects.length).toBeGreaterThan(0);
    for (const e of a.history.action_effects) expect(keysOf(e.downstream)).toEqual(deltaKeys);
  });
});

describe("再現性の比較（reproducibleView・canonicalJson）", () => {
  const build = (html) =>
    compute.buildReportJson(EXPORT, BRIEF, compute.analyzeExport(EXPORT, BRIEF), html);
  const canonical = (report) => compute.canonicalJson(compute.reproducibleView(report));

  it("同じ export からは report_html が違っても同じ文字列になる（report_html は比べない）", () => {
    const one = build("<p>1回目</p>");
    expect(canonical(build("<p>2回目</p>"))).toBe(canonical(one));
    expect(compute.reproducibleView(one)).not.toHaveProperty("report_html");
  });

  it("キーの順序によらず同じ文字列になり、配列の順序は区別する", () => {
    const report = build("<p>1</p>");
    const reversed = reverseKeys(report);
    expect(JSON.stringify(reversed)).not.toBe(JSON.stringify(report));
    expect(canonical(reversed)).toBe(canonical(report));
    expect(compute.canonicalJson([1, 2])).not.toBe(compute.canonicalJson([2, 1]));
  });

  it("JSON に直して送っても同じ文字列になる（undefined の値を持たない）", () => {
    const report = build("<p>1</p>");
    expect(canonical(JSON.parse(JSON.stringify(report)))).toBe(canonical(report));
  });
});
