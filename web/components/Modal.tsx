import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * ネイティブ <dialog> のモーダル。open の間だけ showModal し、Esc で onClose を呼ぶ。
 * closeLabel を渡すと、末尾にそのラベルで onClose を呼ぶボタンを置く（読むだけのモーダル用）
 */
export function Modal({
  open,
  title,
  onClose,
  closeLabel,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          {children}
          {closeLabel && (
            <div className="row dialog-actions">
              <button type="button" className="button" onClick={onClose}>
                {closeLabel}
              </button>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
