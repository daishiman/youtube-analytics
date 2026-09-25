// ③左: レポート一覧（検索=レポート名・要約、300msデバウンス、アーカイブ表示の切替）
import { useState } from "react";
import type { ReportSummary } from "../../api";
import { formatDateTime } from "../../components/AppShell";
import { type Column, DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatRange } from "./format";
import { useReports } from "./hooks";

export function ReportList({
  selectedId,
  onSelect,
  refreshKey,
}: {
  selectedId: string | null;
  onSelect: (report: ReportSummary) => void;
  /** 取込・アーカイブの後に一覧を読み直すための番号 */
  refreshKey: number;
}) {
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  return (
    <ReportListBody
      key={refreshKey}
      q={q}
      setQ={setQ}
      archived={archived}
      setArchived={setArchived}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}

function ReportListBody({
  q,
  setQ,
  archived,
  setArchived,
  selectedId,
  onSelect,
}: {
  q: string;
  setQ: (q: string) => void;
  archived: boolean;
  setArchived: (v: boolean) => void;
  selectedId: string | null;
  onSelect: (report: ReportSummary) => void;
}) {
  const { items, nextCursor, error, more } = useReports(q, archived);
  return (
    <div className="stack">
      <div className="row wrap report-toolbar">
        <label className="field grow">
          <span className="visually-hidden">レポートを検索</span>
          <input
            type="search"
            value={q}
            placeholder="レポート名・要約で検索"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          アーカイブを表示
        </label>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {items === null ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <DataTable
          caption="レポート一覧"
          className="report-list"
          columns={columns(onSelect)}
          rows={items}
          rowKey={(r) => r.reportId}
          rowProps={(r) => ({
            className: r.reportId === selectedId ? "selected" : undefined,
            "aria-selected": r.reportId === selectedId,
          })}
          empty={
            q
              ? "条件に合うレポートはありません"
              : "まだレポートはありません。結果を取り込むとここに並びます。"
          }
        />
      )}
      {nextCursor && (
        <button type="button" className="button" onClick={() => void more()}>
          さらに表示
        </button>
      )}
    </div>
  );
}

const columns = (onSelect: (report: ReportSummary) => void): Column<ReportSummary>[] => [
  { key: "version", label: "版", render: (r) => `v${r.version}` },
  { key: "createdAt", label: "作成日時", render: (r) => formatDateTime(r.createdAt) },
  {
    key: "title",
    label: "レポート名",
    render: (r) => (
      <>
        <button type="button" className="link-button" onClick={() => onSelect(r)}>
          {r.title}
        </button>
        {r.archived && <StatusBadge tone="neutral">アーカイブ</StatusBadge>}
      </>
    ),
  },
  { key: "period", label: "対象期間", render: (r) => formatRange(r.periodStart, r.periodEnd) },
];
