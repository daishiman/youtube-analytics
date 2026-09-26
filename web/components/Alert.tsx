import type { ReactNode } from "react";

/** 利用者に知らせる失敗・注意。中身が空（""・null）なら何も描かない */
export function Alert({ children, small }: { children?: ReactNode; small?: boolean }) {
  if (!children) return null;
  return (
    <p role="alert" className={small ? "small alert" : "alert"}>
      {children}
    </p>
  );
}

/** 読み込み中の表示。文言は「〜を読み込み中…」にそろえる */
export function Loading({
  children = "読み込み中…",
  small,
}: {
  children?: ReactNode;
  small?: boolean;
}) {
  return (
    <p role="status" className={small ? "small muted" : "muted"}>
      {children}
    </p>
  );
}
