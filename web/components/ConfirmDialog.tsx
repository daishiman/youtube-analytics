import { type FormEvent, type ReactNode, useState } from "react";
import { Modal } from "./Modal";

/**
 * 確認ダイアログ（window.confirm の代わり）。confirmText を渡すと、その文字列の入力を求める（危険操作・qa-079）
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmText,
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmText?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      {/* open のたびに入力欄を空から始める（Modal は閉じると中身を捨てる） */}
      <ConfirmBody
        confirmLabel={confirmLabel}
        confirmText={confirmText}
        danger={danger}
        busy={busy}
        error={error}
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        {children}
      </ConfirmBody>
    </Modal>
  );
}

function ConfirmBody({
  children,
  confirmLabel,
  confirmText,
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  children: ReactNode;
  confirmLabel: string;
  confirmText?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ready = confirmText === undefined || typed.trim() === confirmText;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready && !busy) onConfirm(typed.trim());
  }

  return (
    <form onSubmit={submit}>
      <div className="dialog-body">{children}</div>
      {confirmText !== undefined && (
        <label className="field">
          <span>
            確認のため <strong>{confirmText}</strong> と入力してください
          </span>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-label="確認のための名前"
            autoComplete="off"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div className="row dialog-actions">
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          キャンセル
        </button>
        <button
          type="submit"
          className={danger ? "button danger-solid" : "button primary"}
          disabled={!ready || busy}
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}
