// 主要2色はCSS正本から取得。補助系列はチャートだけで使うため、この1か所で定義する。
const AUXILIARY = {
  muted: "#8a93a0",
  teal: "#1f7a8c",
  amber: "#e69500",
  purple: "#7a4fb5",
  green: "#2f875a",
  softIndigo: "#c9cdf2",
} as const;

/** Canvas に描く ECharts へ、CSS 変数の解決済み色を渡す。 */
export function chartColors() {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const indigo = color("--indigo");
  const magenta = color("--magenta");
  return {
    indigo,
    magenta,
    muted: AUXILIARY.muted,
    softIndigo: AUXILIARY.softIndigo,
    trendSeries: [magenta, AUXILIARY.teal, AUXILIARY.amber, AUXILIARY.purple, AUXILIARY.green],
    composition: [
      indigo,
      magenta,
      AUXILIARY.teal,
      AUXILIARY.amber,
      AUXILIARY.purple,
      AUXILIARY.muted,
    ],
  };
}
