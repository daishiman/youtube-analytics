import { useState } from "react";
import type { AnalyticsRawResponse, AnalyticsRawRowsPage } from "../../api";
import { Alert, Loading } from "../../components/Alert";
import { type Column, DataTable } from "../../components/DataTable";
import { Pager } from "../../components/Pager";
import { StatusBadge } from "../../components/StatusBadge";
import { fmtNumber } from "../../format";
import { useApi } from "../../useApi";
import { slashDate } from "./format";

const PAGE_SIZE = 100;

const REPORT_LABELS = {
  traffic_daily: "流入元の日次",
  device_daily: "端末の日次",
  country_period: "地域の期間集計",
} as const;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function AnalyticsRawPanel() {
  const { data, error } = useApi<AnalyticsRawResponse>("/api/data/analytics-raw");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [offset, setOffset] = useState(0);

  const key = selectedKey || data?.reports[0]?.reportKey || "";
  const report = data?.reports.find((item) => item.reportKey === key);
  // 先頭ページは一覧の応答に含まれるので、2ページ目以降だけ読む
  const more = useApi<AnalyticsRawRowsPage>(
    report && offset > 0
      ? `/api/data/analytics-raw/${encodeURIComponent(report.reportKey)}/rows?offset=${offset}&limit=${PAGE_SIZE}`
      : null,
  );
  const page: Pick<AnalyticsRawRowsPage, "offset" | "hasMore" | "rows"> | null =
    report && offset === 0 ? { offset: 0, hasMore: report.hasMore, rows: report.rows } : more.data;

  const columns: Column<unknown[]>[] = (report?.columnHeaders ?? []).map((header, index) => ({
    key: String(index),
    label: String(header.name ?? `列${index + 1}`),
    render: (row) => cellText(row[index]),
  }));

  return (
    <section className="details-block analytics-raw" aria-labelledby="analytics-raw-heading">
      <h3 id="analytics-raw-heading">流入・端末・地域の分析データ</h3>
      <p className="small muted">
        YouTube Analytics
        APIの返却列を原値のまま表示します。チャンネル全体の別系列で、上の期間・動画選択やKPIへは合算しません。
      </p>
      <Alert>{error || more.error}</Alert>
      {!data && !error && <Loading small />}
      {data?.reports.length === 0 && (
        <p className="small muted">追加レポートはまだ収集されていません。</p>
      )}
      {report && (
        <>
          <label className="small">
            レポート
            <select
              value={key}
              onChange={(event) => {
                setSelectedKey(event.target.value);
                setOffset(0);
              }}
            >
              {data?.reports.map((item) => (
                <option key={item.reportKey} value={item.reportKey}>
                  {REPORT_LABELS[item.reportKey]}
                </option>
              ))}
            </select>
          </label>
          <p className="small muted">
            {slashDate(report.periodStart)}〜{slashDate(report.periodEnd)}
            （Analyticsの太平洋時間）・{fmtNumber(report.rowCount)}行
          </p>
          {report.availability === "permission_denied" && (
            <StatusBadge tone="warn">権限不足</StatusBadge>
          )}
          {report.availability === "empty" && (
            <StatusBadge tone="neutral">対象データなし</StatusBadge>
          )}
          {report.availability === "available" && !page && !more.error && (
            <Loading small>行を読み込み中…</Loading>
          )}
          {report.availability === "available" && page && (
            <>
              <DataTable
                caption={`${REPORT_LABELS[report.reportKey]}の原データ`}
                layout="scroll"
                columns={columns}
                rows={page.rows}
                rowKey={(_row, index) => `${page.offset + index}`}
                empty="このページに行はありません"
              />
              {report.rowCount > PAGE_SIZE && (
                <Pager
                  className="analytics-raw-pages"
                  position={`${offset + 1}〜${Math.min(offset + page.rows.length, report.rowCount)}行目`}
                  prevDisabled={offset === 0}
                  nextDisabled={!page.hasMore}
                  onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  onNext={() => setOffset(offset + PAGE_SIZE)}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
