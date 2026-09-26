// 画面共通の数値・日時の表示形式。値が無いときは「—」

const numberFormat = new Intl.NumberFormat("ja-JP");

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return digits === 0
    ? numberFormat.format(Math.round(value))
    : value.toLocaleString("ja-JP", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}

/** 日時を JST で「2026年9月21日 10:24」の形に。値が無いときは「—」 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** 日付だけを JST で「2026/9/21」の形に */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo" }).format(d);
}
