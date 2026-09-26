import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

/** 表。900px 未満では各行を縦積みのカードに切り替える（列名は data-label で出す・qa-036） */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  layout = "cards",
  className,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty: string;
  /** 可変列CSVのような横長の表は、小画面でも列見出しを保って横スクロールする。 */
  layout?: "cards" | "scroll";
  /** 画面固有の見た目を足すクラス（例: video-table） */
  className?: string;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table
        className={["data-table", layout === "scroll" && "scroll-table", className]
          .filter(Boolean)
          .join(" ")}
      >
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
