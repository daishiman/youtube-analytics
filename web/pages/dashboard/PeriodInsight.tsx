import { Link } from "react-router";
import type { DashboardResponse } from "../../api";
import { SectionCard } from "../../components/SectionCard";
import { fmtNumber } from "../../format";
import { singleVideoDashboardUrl } from "./VideoPerformance";

function hasCompleteDailyViews(values: (number | null)[], days: number): boolean {
  return (
    days > 0 &&
    values.length === days &&
    values.every((value) => value !== null && Number.isFinite(value))
  );
}

export function PeriodInsight({
  data,
  searchParams,
}: {
  data: DashboardResponse;
  searchParams: URLSearchParams;
}) {
  const currentComplete = hasCompleteDailyViews(data.trend.current, data.trend.dates.length);
  const previousComplete = hasCompleteDailyViews(data.trend.previous, data.trend.dates.length);
  const views = data.kpis.find((kpi) => kpi.id === "views");
  const current = views?.value;
  const previous = views?.previous;
  const change =
    !currentComplete || current == null
      ? "今期の日次データに欠測があるため、前期との比較は保留します。"
      : !previousComplete || previous == null
        ? `今期は${fmtNumber(current)}回。前期の日次データに欠測があるため、変化率は保留します。`
        : previous === 0
          ? `前期${fmtNumber(previous)}回から${fmtNumber(current)}回になりました。`
          : `前期${fmtNumber(previous)}回から${fmtNumber(current)}回（${current >= previous ? "+" : ""}${(((current - previous) / previous) * 100).toFixed(1)}%）になりました。`;
  const videoTotalsComplete =
    data.videos.length > 0 &&
    data.videos.every((video) => video.views !== null && Number.isFinite(video.views));
  const candidate =
    currentComplete && videoTotalsComplete
      ? [...data.videos]
          .filter((video) => video.views !== null && video.views > 0)
          .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0]
      : undefined;
  const candidatePending = !currentComplete
    ? "今期の日次データが揃うまで保留します。"
    : data.videos.length === 0
      ? "表示中の動画がありません。"
      : !videoTotalsComplete
        ? "比較できる動画の視聴回数が揃うまで保留します。"
        : "表示中の動画の視聴回数はすべて0回です。";

  return (
    <SectionCard id="period-insight" title="この期間の判断">
      <p>
        <strong>観測された変化：</strong>
        {change}
      </p>
      <p>
        <strong>次に見る動画：</strong>
        {candidate ? (
          <>
            表示中の動画では「
            <Link to={singleVideoDashboardUrl(searchParams, candidate.videoId)}>
              {candidate.title}
            </Link>
            」の視聴回数が最多（{fmtNumber(candidate.views)}
            回）です。日次推移と公開日を確認してください。
          </>
        ) : (
          candidatePending
        )}
      </p>
      <p className="small muted">視聴回数と公開の前後関係だけでは、成果の原因は特定できません。</p>
    </SectionCard>
  );
}
