// KPI 4枚（値・期間内の推移線・前期比・出典バッジ・M1 の開示文）。qa-101・qa-049〜qa-054
import type { Kpi } from "../../api";
import { fmtChange, fmtValue, TREND_WORD, trendOf } from "./format";

/** 小さな推移線。欠損（null）は線を切る。軸を持たない飾りなので読み上げない */
export function Sparkline({ points }: { points: (number | null)[] }) {
  const values = points.filter((v): v is number => v !== null);
  if (values.length < 2) return <svg className="sparkline" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 32;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const segments: string[] = [];
  let current = "";
  points.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    const x = (i * step).toFixed(1);
    const y = (h - 2 - ((v - min) / span) * (h - 4)).toFixed(1);
    current += `${current ? "L" : "M"}${x},${y}`;
  });
  if (current) segments.push(current);
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {segments.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="2" />
      ))}
    </svg>
  );
}

export function SourceBadge({ source }: { source: "api" | "csv" }) {
  return (
    <span
      className="badge source-badge"
      title={source === "api" ? "YouTube API の公式値" : "CSV の取込データ"}
    >
      {source === "api" ? "API" : "CSV"}
    </span>
  );
}

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="kpi-grid">
      {kpis.map((k) => {
        const trend = trendOf(k.change);
        return (
          <article key={k.id} className="card kpi-card" aria-labelledby={`kpi-${k.id}`}>
            <div className="kpi-head">
              <h2 id={`kpi-${k.id}`} className="kpi-label">
                {k.label}
              </h2>
              <SourceBadge source={k.source} />
            </div>
            <p className="kpi-value">{fmtValue(k.value, k.unit)}</p>
            <p className={`kpi-change trend-${trend}`}>
              <span>{fmtChange(k.change)}</span>
              <span className="visually-hidden">
                {trend === "none" ? "（前期比較を保留）" : `（前期より${TREND_WORD[trend]}）`}
              </span>
            </p>
            <Sparkline points={k.points} />
            {k.note && <p className="kpi-note small muted">{k.note}</p>}
          </article>
        );
      })}
    </div>
  );
}
