// 結果 JSON の契約: スキルの実出力（compute.mjs の buildReportJson）と正本 fixture が parseReport を誤り0件で通り、
// 画面の表示モデル（web/pages/analysis/history-review.ts）が空や「—」だらけにならないことを確かめる。
// fixture は実出力の写しなので、report_html 以外が実出力と一致することも確かめる（写しのずれを CI で止める）
import { describe, expect, it } from "vitest";
import {
  analyzeExport,
  buildReportJson,
  reproducibleView,
} from "../../.claude/skills/yt-analyze/lib/compute.mjs";
import { CAUSE_METRICS, DOWNSTREAM_KEYS, parseReport } from "../../src/domain/report-schema";
import {
  candidateLabel,
  candidateText,
  changesView,
  diagnosisRows,
  downstreamItems,
  weeklyRows,
} from "../../web/pages/analysis/history-review";
import EMPTY_BRIEF from "../fixtures/skill-analysis-empty/brief.json";
import EMPTY_EXPORT from "../fixtures/skill-analysis-empty/export-v1.json";
import REPORT_FIXTURE from "../fixtures/skill-analysis-report.json";
import SAMPLE_BRIEF from "../fixtures/skill-analysis-sample/brief.json";
import SAMPLE_EXPORT from "../fixtures/skill-analysis-sample/export-v1.json";

/** スキルが POST する本文（JSON に直したもの）。report_html は build 合格の HTML の代わり */
function skillOutput(exp, brief) {
  const html = "<!doctype html><title>契約テスト</title><p>本文</p>";
  return JSON.parse(JSON.stringify(buildReportJson(exp, brief, analyzeExport(exp, brief), html)));
}

const issuesOf = (input) => {
  const r = parseReport(input);
  return r.ok ? [] : r.issues;
};

/** parseReport を通した値。誤りがあれば issues を載せて落とす */
function parsed(input) {
  const r = parseReport(input);
  if (!r.ok) throw new Error(`parseReport の誤り: ${JSON.stringify(r.issues)}`);
  return r.value;
}

const sample = () => parsed(skillOutput(SAMPLE_EXPORT, SAMPLE_BRIEF));

describe("スキルの実出力と正本 fixture は parseReport を通る", () => {
  it("sample の export から作った出力は誤り0件で通る", () => {
    expect(issuesOf(skillOutput(SAMPLE_EXPORT, SAMPLE_BRIEF))).toEqual([]);
  });

  it("正本 fixture も誤り0件で通り、report_html 以外は sample の実出力と一致する", () => {
    expect(issuesOf(REPORT_FIXTURE)).toEqual([]);
    expect(reproducibleView(REPORT_FIXTURE)).toEqual(
      reproducibleView(skillOutput(SAMPLE_EXPORT, SAMPLE_BRIEF)),
    );
  });
});

describe("画面の表示モデルは実出力から空でない表示を作る（sample）", () => {
  it("週次ファネルは results.weekly の週ごとに出し、値のある欄は「—」にしない", () => {
    const { results } = sample();
    const rows = weeklyRows(results);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.week)).toEqual(results.weekly.map((w) => w.week));
    const dashes = rows.flatMap((r) =>
      CAUSE_METRICS.filter((m) => r.values[m] === "—").map((m) => `${r.week} ${m}`),
    );
    const nulls = results.weekly.flatMap((w) =>
      CAUSE_METRICS.filter((m) => w[m] == null).map((m) => `${w.week} ${m}`),
    );
    expect(dashes).toEqual(nulls);
  });

  it("対象週の診断は5原因指標の5行で、候補に印を付け、実績・目標は値があれば「—」にしない", () => {
    const { outcome, results } = sample();
    const rows = diagnosisRows(results);
    expect(outcome).toBe("改善候補あり");
    expect(rows.map((r) => r.metric)).toEqual([...CAUSE_METRICS]);
    const marked = rows.filter((r) => r.candidate).map((r) => r.metric);
    expect(marked).toEqual([results.candidate.metric]);
    expect(rows.map((r) => [r.metric, r.actual !== "—", r.target !== "—"])).toEqual(
      results.funnel.map((m) => [m.metric, m.actual != null, m.target != null]),
    );
  });

  it("下流の結果は DOWNSTREAM_KEYS の順に出し、改善候補の1行は段と指標を含む", () => {
    const { outcome, results } = sample();
    const items = downstreamItems(results);
    expect(items.length).toBeGreaterThan(0);
    const keys = DOWNSTREAM_KEYS.filter((k) => k in results.downstream);
    expect(items.map((d) => d.key)).toEqual(keys);
    expect(items.filter((d) => d.value === "—").map((d) => d.key)).toEqual(
      keys.filter((k) => results.downstream[k] == null),
    );
    expect(candidateText(results, outcome)).toContain(candidateLabel(results.candidate));
  });

  it("前回からの変化は、仮説の再判定・アクションの効果・直前の版との比較を出す", () => {
    const { historyReview, historyVersionsUsed } = sample();
    const view = changesView(historyReview, historyVersionsUsed);
    expect(view.first).toBe(false);
    expect(view.versions).not.toBe("");
    expect(view.hypotheses.length).toBeGreaterThan(0);
    expect(view.effects.length).toBeGreaterThan(0);
    expect(view.comparison).not.toBeNull();
    const texts = [...view.hypotheses, ...view.effects, view.comparison.downstream];
    expect(texts.filter((t) => t.includes("—"))).toEqual([]);
  });
});

describe("行も履歴も無い export（初回分析・判定保留）", () => {
  it("実出力は parseReport を通り、画面は判定保留・初回分析として出す", () => {
    const input = skillOutput(EMPTY_EXPORT, EMPTY_BRIEF);
    expect(issuesOf(input)).toEqual([]);
    const { outcome, results, historyReview, historyVersionsUsed } = parsed(input);
    expect(outcome).toBe("判定保留");
    expect(weeklyRows(results)).toEqual([]);
    expect(diagnosisRows(results)).toEqual([]);
    expect(downstreamItems(results)).toEqual([]);
    expect(candidateText(results, outcome)).toBe("判定保留");
    expect(changesView(historyReview, historyVersionsUsed)).toMatchObject({
      first: true,
      hypotheses: [],
      effects: [],
      comparison: null,
    });
  });
});
