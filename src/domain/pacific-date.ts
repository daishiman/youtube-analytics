// YouTube の日次集計とクォータ日は Google の Pacific Time で区切る

/** Pacific Time（DST を含む America/Los_Angeles）の暦日を YYYY-MM-DD で返す。 */
export function pacificDate(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
