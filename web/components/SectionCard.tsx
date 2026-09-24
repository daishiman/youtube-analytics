import type { ReactNode } from "react";

/** 画面の区画。見出しは h2 で、tone=danger は危険操作（データ削除）の枠 */
export function SectionCard({
  id,
  title,
  description,
  tone,
  actions,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  tone?: "danger";
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      className={tone === "danger" ? "card section danger-zone" : "card section"}
      aria-labelledby={headingId}
    >
      <div className="section-head">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description && <p className="muted section-desc">{description}</p>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
