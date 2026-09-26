/**
 * 2〜3択の切替ボタン（グラフ⇄表、チャンネル全体⇄動画を選ぶ など）。選択中は aria-pressed で示す。
 * 選択中のボタンを押しても onChange を呼ぶ（「動画を選ぶ」の再押下で選択欄を開き直すため）
 */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  label,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  /** 読み上げ用の見出し（画面には出さない） */
  label: string;
  options: [T, string][];
}) {
  return (
    <fieldset className="segmented">
      <legend className="visually-hidden">{label}</legend>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          className={key === value ? "active" : undefined}
          aria-pressed={key === value}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}
