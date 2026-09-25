import type { HTMLAttributes, ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** 行見出し（<th scope="row">）として出す列 */
  rowHeader?: boolean;
}

/** 表。900px 未満では各行を縦積みのカードに切り替える（列名は data-label で出す・qa-036） */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  className,
  rowProps,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: string;
  /** data-table に足す class */
  className?: string;
  /** 行に付ける属性（選択中・変化ありの印など） */
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement>;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className={className ? `data-table ${className}` : "data-table"}>
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
          {rows.map((row) => (
            <tr key={rowKey(row)} {...rowProps?.(row)}>
              {columns.map((c) =>
                c.rowHeader ? (
                  <th key={c.key} scope="row">
                    {c.render(row)}
                  </th>
                ) : (
                  <td key={c.key} data-label={c.label}>
                    {c.render(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
