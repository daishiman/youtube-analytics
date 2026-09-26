import type { ReportDetail } from "../../../api";
import { type Column, DataTable } from "../../../components/DataTable";
import { metricLabel, plain } from "../format";

type Finding = ReportDetail["findings"][number];

const COLUMNS: Column<Finding>[] = [
  { key: "no", label: "No", render: (f) => f.no },
  { key: "kind", label: "種類", render: (f) => (f.kind === "factor" ? "要因" : "仮説") },
  {
    key: "title",
    label: "内容",
    render: (f) => (
      <>
        {f.title}
        {f.interpretation && <span className="muted">（{f.interpretation}）</span>}
      </>
    ),
  },
  {
    key: "fact",
    label: "事実・反証条件",
    render: (f) => (f.kind === "factor" ? f.fact : f.falsifier) ?? "—",
  },
  {
    key: "stage",
    label: "段・指標",
    render: (f) => (f.stage ? `${f.stage}・${metricLabel(f.metric)}` : "—"),
  },
];

/** 根拠データ。問い・参照した過去の版・発見（要因は事実、仮説は反証条件） */
export function EvidenceTab({ detail }: { detail: ReportDetail }) {
  return (
    <div className="stack">
      <p>問い: {plain(detail.brief.question)}</p>
      <p>
        参照した過去の版:{" "}
        {detail.historyVersionsUsed.length
          ? detail.historyVersionsUsed.map((v) => `v${v}`).join("・")
          : "なし（初回分析）"}
      </p>
      <DataTable
        caption="発見と根拠"
        columns={COLUMNS}
        rows={detail.findings}
        rowKey={(f) => String(f.no)}
        empty="この版に発見の記録はありません"
      />
    </div>
  );
}
