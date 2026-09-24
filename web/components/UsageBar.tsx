import type { UsageItem } from "../api";

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export function formatUsageValue(value: number, unit: string): string {
  if (unit === "bytes") {
    return value >= GB ? `${(value / GB).toFixed(2)} GB` : `${(value / MB).toFixed(1)} MB`;
  }
  return value.toLocaleString("ja-JP");
}

const LEVEL_TEXT = { ok: "", warn: "（70%超）", danger: "（90%超）", unknown: "" } as const;

/** 無料枠のバー。70% で黄・90% で赤（qa-084）。値が取れないときは「取得できません」 */
export function UsageBar({ item }: { item: UsageItem }) {
  const limit = formatUsageValue(item.limit, item.unit);
  const unit = item.unit === "bytes" ? "" : ` ${item.unit}`;
  const percent =
    item.used === null ? 0 : Math.min(100, Math.round((item.used / item.limit) * 1000) / 10);
  const text =
    item.used === null
      ? `取得できません / ${limit}${unit}`
      : `${formatUsageValue(item.used, item.unit)} / ${limit}${unit}`;
  return (
    <div className={`usage usage-${item.level}`} data-usage={item.key}>
      <div className="usage-head">
        <span>{item.label}</span>
        <span className="usage-value">
          {text}
          {LEVEL_TEXT[item.level]}
        </span>
      </div>
      <div
        className="usage-track"
        role="progressbar"
        aria-label={item.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={item.used === null ? undefined : percent}
        aria-valuetext={text}
      >
        <div className="usage-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
