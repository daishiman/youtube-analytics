/** 進捗バー（0〜100%）。値は文字でも併記し、色だけに頼らない。value=null は「—」（未開始・対象外） */
export function ProgressBar({
  value,
  label,
  tone,
}: {
  value: number | null;
  label: string;
  tone?: "danger" | "muted";
}) {
  const percent = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  const text = value === null ? "—" : `${percent}%`;
  return (
    <span className={`progress${tone ? ` progress-${tone}` : ""}`}>
      <span
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : percent}
        aria-valuetext={text}
      >
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="progress-value">{text}</span>
    </span>
  );
}
