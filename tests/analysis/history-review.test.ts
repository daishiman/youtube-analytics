// レポート詳細の表示モデル（web/pages/analysis/history-review.ts）。スキルの実出力の見本を parseReport に
// 通したものだけを入力にし、画面が読むキー（results.weekly / funnel、history_review.changes など）を確かめる。
// 開発用 seed の結果 JSON も同じ検査に通し、手書きの写しが正本の形からずれないようにする
import { describe, expect, it } from "vitest";
import SEED from "../../scripts/seed-local.sql?raw";
import {
  type HistoryChanges,
  type HistoryReview,
  parseReport,
  type ReportResults,
} from "../../src/domain/report-schema";
import {
  candidateText,
  changesView,
  diagnosisNote,
  diagnosisRows,
  downstreamItems,
  weeklyRows,
} from "../../web/pages/analysis/history-review";
import REPORT_FIXTURE from "../fixtures/skill-analysis-report.json";

function parsed(input: unknown) {
  const r = parseReport(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const FIRST_REVIEW = {
  first_analysis: true,
  versions_used: [],
  previous_hypotheses: [],
  action_effects: [],
  changes: null,
};

describe("results（週次ファネル・対象週の診断・下流）", () => {
  const report = parsed(REPORT_FIXTURE);

  it("週次ファネルは results.weekly の週ごとに5原因指標を単位付きで出す", () => {
    const rows = weeklyRows(report.results);
    expect(rows.map((r) => r.week)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
    ]);
    expect(rows[0]?.values).toEqual({
      impressions: "13,600回",
      ctr: "4.76%",
      m1: "33.45%",
      lead_route_rate: "2.20%",
      inquiry_close_rate: "33.33%",
    });
  });

  it("対象週の診断は results.funnel から作り、候補の指標に印を付ける", () => {
    const rows = diagnosisRows(report.results);
    expect(rows.map((r) => r.metric)).toEqual([
      "impressions",
      "ctr",
      "m1",
      "lead_route_rate",
      "inquiry_close_rate",
    ]);
    expect(rows[1]).toEqual({
      metric: "ctr",
      stage: "流入",
      label: "クリック率",
      actual: "4.19%",
      target: "5.00%",
      gap: "▲16.2%",
      candidate: true,
      pending: "—",
    });
    expect(rows[0]).toMatchObject({ actual: "17,700回", gap: "+18.0%", candidate: false });
    expect(rows[4]?.gap).toBe("+0.0%");
    expect(diagnosisNote(report.results)).toEqual({ week: "2026-08-24", pending: [] });
  });

  it("下流の結果と最大の改善候補", () => {
    expect(downstreamItems(report.results).map((d) => `${d.label} ${d.value}`)).toEqual([
      "問い合わせ 8件",
      "成約 2件",
      "売上 470,000円",
      "登録者の増加 26人",
    ]);
    expect(candidateText(report.results, report.outcome)).toBe(
      "目標未達が最大: 流入・クリック率（目標比 ▲16.2%）",
    );
  });

  it("目標との差を出せない指標は判定保留と理由を出す", () => {
    const funnel = report.results.funnel.map((m) =>
      m.metric === "m1" ? { ...m, target_gap: null, pending_reason: "目標が未設定" } : m,
    );
    const rows = diagnosisRows({ ...report.results, funnel });
    expect(rows[2]).toMatchObject({ gap: "判定保留", pending: "目標が未設定" });
    const reasons = [
      { metric: "m1", reason: "目標が未設定" },
      { metric: "*", reason: "対象期間の行がありません" },
    ];
    expect(diagnosisNote({ ...report.results, pending_reasons: reasons }).pending).toEqual([
      "加重平均視聴率: 目標が未設定",
      "対象期間の行がありません",
    ]);
  });

  it("検査前に保存された版（{}）は空の表と判定保留になる", () => {
    const empty = {} as ReportResults;
    expect(weeklyRows(empty)).toEqual([]);
    expect(diagnosisRows(empty)).toEqual([]);
    expect(diagnosisNote(empty)).toEqual({ week: null, pending: [] });
    expect(downstreamItems(empty)).toEqual([]);
    expect(candidateText(empty, "")).toBe("判定保留");
  });
});

describe("history_review（前回からの変化）", () => {
  it("2版目は参照版・前回仮説の当否・施策効果・候補と下流の差を出す", () => {
    const report = parsed(REPORT_FIXTURE);
    const view = changesView(report.historyReview, report.historyVersionsUsed);
    expect(view.first).toBe(false);
    expect(view.versions).toBe("v1");
    expect(view.hypotheses).toEqual([
      "H1「最大の改善候補の指標は、判定できた週の半分以上で目標を下回っている」: 保留 → 採用",
      "H2「最大の改善候補の未達は、対象週だけの一時的な下振れである」: 保留 → 棄却",
    ]);
    expect(view.effects).toEqual([
      "サムネイルの文字量を減らす（クリック率）: 4.40% → 4.19%（差 ▲0.21%）・効果測定中",
    ]);
    expect(view.comparison).toEqual({
      version: 1,
      candidate: "前回と同じ（流入・クリック率）",
      downstream: "問い合わせ +2件・成約 +0件・売上 +20,000円",
    });
  });

  it("初回分析（changes が null・参照版なし）は比較を出さない", () => {
    const report = parsed({ ...REPORT_FIXTURE, version: 1, history_review: FIRST_REVIEW });
    expect(changesView(report.historyReview, report.historyVersionsUsed)).toEqual({
      first: true,
      versions: "",
      hypotheses: [],
      effects: [],
      comparison: null,
    });
  });

  it("検査前に保存された版（{}）は初回と同じに扱う", () => {
    expect(changesView({} as HistoryReview, [])).toMatchObject({ first: true, comparison: null });
  });

  it("候補が変わった・候補が無い・下流の差が減った／不明", () => {
    const base: HistoryChanges = {
      compared_version: 1,
      previous_candidate: { stage: "流入", metric: "ctr" },
      current_candidate: { stage: "維持", metric: "m1" },
      same_candidate: false,
      downstream_delta: { inquiries: -1, closed_deals: null, revenue_jpy: -5000 },
    };
    const review = (changes: HistoryChanges): HistoryReview => ({
      ...FIRST_REVIEW,
      first_analysis: false,
      versions_used: [1],
      changes,
    });
    expect(changesView(review(base), [1]).comparison).toEqual({
      version: 1,
      candidate: "前回から変化（流入・クリック率 → 維持・加重平均視聴率）",
      downstream: "問い合わせ ▲1件・成約 —・売上 ▲5,000円",
    });
    const none = { ...base, previous_candidate: null, current_candidate: null };
    expect(changesView(review(none), [1]).comparison?.candidate).toBe("前回・今回とも候補なし");
    const appeared = { ...base, previous_candidate: null };
    expect(changesView(review(appeared), [1]).comparison?.candidate).toBe(
      "前回から変化（候補なし → 維持・加重平均視聴率）",
    );
  });
});

describe("開発用 seed（scripts/seed-local.sql）", () => {
  // reports の INSERT は results_json と history_review_json を続けて1行ずつ書く
  const rows = [...SEED.matchAll(/'(\{"status".*\})',\s*'(\{"first_analysis".*\})'/g)].map((m) => ({
    results: JSON.parse(m[1] ?? "") as unknown,
    history: JSON.parse(m[2] ?? "") as HistoryReview,
  }));

  it("2版の結果 JSON が parseReport を通り、v2 は v1 からの変化を持つ", () => {
    expect(rows).toHaveLength(2);
    const views = rows.map(({ results, history }) => {
      const version = Math.max(0, ...history.versions_used) + 1;
      const report = parsed({ ...REPORT_FIXTURE, version, results, history_review: history });
      return changesView(report.historyReview, report.historyVersionsUsed);
    });
    expect(views[0]).toMatchObject({ first: true, comparison: null });
    expect(views[1]?.comparison).toEqual({
      version: 1,
      candidate: "前回から変化（流入・クリック率 → 維持・加重平均視聴率）",
      downstream: "問い合わせ +4件・成約 +2件・売上 +480,000円",
    });
  });
});
