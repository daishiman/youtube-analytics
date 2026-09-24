import type { ReactNode } from "react";

/** 画面の見出しと1行の説明（例: 設定 / 連携・取込・データ管理を設定します） */
export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {lead && <p className="muted">{lead}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
