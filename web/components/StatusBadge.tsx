import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "danger" | "neutral";

/** 状態の小さな札。色だけに頼らず、記号と文字でも区別する */
const MARKS: Record<BadgeTone, string> = { ok: "✓", warn: "!", danger: "×", neutral: "" };

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      {MARKS[tone] && <span aria-hidden="true">{MARKS[tone]}</span>}
      {children}
    </span>
  );
}
