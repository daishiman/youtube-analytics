import { type DragEvent, useId, useRef, useState } from "react";

/** ドラッグ&ドロップとファイル選択ボタンの両方で1ファイルを受け取る（スマホはボタン・qa-036） */
export function DropZone({
  label,
  accept,
  hint,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  hint: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ドロップは補助。キーボード・スマホは「ファイルを選択」ボタンで同じ操作ができる
    <div
      className={over ? "dropzone over" : "dropzone"}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <p>{label}</p>
      <p className="muted small">{hint}</p>
      <label className={disabled ? "button disabled" : "button"} htmlFor={inputId}>
        ファイルを選択
      </label>
      <input
        id={inputId}
        ref={input}
        className="visually-hidden"
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={`${label}（ファイルを選択）`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          if (input.current) input.current.value = "";
        }}
      />
    </div>
  );
}
