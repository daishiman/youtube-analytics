// 日次推移（今期=実線・前期=点線・公開日マーカー・動画選択時は動画ごとの線）。文字要約と表への切替を持つ（qa-101・qa-103）
import type { EChartsCoreOption } from "echarts/core";
import { useMemo, useState } from "react";
import type { DashboardResponse } from "../../api";
import { EChart } from "../../components/EChart";
import { SectionCard } from "../../components/SectionCard";
import { SegmentedToggle } from "../../components/SegmentedToggle";
import { fmtNumber } from "../../format";
import { chartColors } from "./chartColors";
import { shortDate } from "./format";

const MAX_CHART_VIDEOS = 5;

const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);

/** 多数の動画を選んでもグラフは読める本数に絞る。表には全動画を残す。 */
export function displayedVideoLines(
  videos: DashboardResponse["trend"]["perVideo"],
  focusedVideoId: string,
) {
  // 1本だけなら「今期」の合計線と同じ値なので重ねない。
  if (videos.length <= 1) return [];
  const top = [...videos].sort((a, b) => sum(b.values) - sum(a.values)).slice(0, MAX_CHART_VIDEOS);
  const focused = videos.find((v) => v.videoId === focusedVideoId);
  if (focused && !top.some((v) => v.videoId === focused.videoId)) {
    top[MAX_CHART_VIDEOS - 1] = focused;
  }
  return top;
}

export function trendSummary(data: Pick<DashboardResponse, "trend">): string {
  const { dates, current, previous, published } = data.trend;
  if (dates.length === 0 || current.every((v) => v === null))
    return "対象期間に表示できる日次データがありません。";
  let peakIndex = -1;
  current.forEach((v, i) => {
    if (v !== null && (peakIndex < 0 || v > (current[peakIndex] ?? 0))) peakIndex = i;
  });
  const total = sum(current);
  const hasMissingDays = current.length !== dates.length || current.some((v) => v === null);
  const previousHasMissingDays =
    previous.length !== dates.length || previous.some((v) => v === null);
  const parts = [
    `${shortDate(dates[0] ?? "")}〜${shortDate(dates.at(-1) ?? "")}の${hasMissingDays ? "データがある日の" : ""}視聴回数は合計${fmtNumber(total)}回`,
    previousHasMissingDays
      ? "。前期は欠測があるため期間合計を表示していません"
      : `（前期 ${fmtNumber(sum(previous))}回）`,
  ];
  if (peakIndex >= 0) {
    parts.push(
      `。最も多かったのは${shortDate(dates[peakIndex] ?? "")}の${fmtNumber(current[peakIndex])}回`,
    );
  }
  if (published.length > 0) parts.push(`。期間中に${published.length}本を公開しました`);
  if (hasMissingDays) parts.push("。データのない日は合計に含めていません");
  return `${parts.join("")}。`;
}

export function publishedMarkerPoints(
  trend: Pick<DashboardResponse["trend"], "dates" | "current" | "published">,
) {
  const { dates, current, published } = trend;
  return published.flatMap((point) => {
    const index = dates.indexOf(point.date);
    const views = current[index];
    return index < 0 || views == null || !Number.isFinite(views)
      ? []
      : [{ coord: [index, views], name: point.title, value: "公開" }];
  });
}

export function TrendCard({ data }: { data: DashboardResponse }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [focusedVideoId, setFocusedVideoId] = useState("");
  const { dates, current, previous, published, perVideo } = data.trend;
  const tableVideos = perVideo.length > 1 ? perVideo : [];
  const activeFocusId = perVideo.some((v) => v.videoId === focusedVideoId) ? focusedVideoId : "";
  const titleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const video of perVideo) counts.set(video.title, (counts.get(video.title) ?? 0) + 1);
    return counts;
  }, [perVideo]);
  const chartVideos = useMemo(
    () => displayedVideoLines(perVideo, activeFocusId),
    [perVideo, activeFocusId],
  );

  const option = useMemo<EChartsCoreOption>(() => {
    const colors = chartColors();
    const publishedPoints = publishedMarkerPoints({ dates, current, published });
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 32, bottom: 32 },
      tooltip: { trigger: "axis", renderMode: "richText" },
      legend: { top: 0, type: "scroll" },
      xAxis: {
        type: "category",
        data: dates.map(shortDate),
        axisLabel: { hideOverlap: true },
      },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => fmtNumber(v) } },
      series: [
        {
          name: "今期",
          type: "line",
          data: current,
          showSymbol: false,
          lineStyle: { width: 3, color: colors.indigo },
          itemStyle: { color: colors.indigo },
          markPoint: {
            symbol: "pin",
            symbolSize: 28,
            itemStyle: { color: colors.magenta },
            label: { fontSize: 9 },
            data: publishedPoints,
          },
        },
        {
          name: "前期",
          type: "line",
          data: previous,
          showSymbol: false,
          lineStyle: { width: 2, type: "dashed", color: colors.muted },
          itemStyle: { color: colors.muted },
        },
        ...chartVideos.map((v, i) => ({
          name: (titleCounts.get(v.title) ?? 0) > 1 ? `${v.title}（ID: ${v.videoId}）` : v.title,
          type: "line",
          data: v.values,
          showSymbol: false,
          lineStyle: { width: 1.5, color: colors.trendSeries[i % colors.trendSeries.length] },
          itemStyle: { color: colors.trendSeries[i % colors.trendSeries.length] },
        })),
      ],
    };
  }, [dates, current, previous, published, chartVideos, titleCounts]);

  const summary = trendSummary(data);
  return (
    <SectionCard
      id="trend"
      title="日次の視聴推移"
      description="視聴回数の推移。実線が今期、点線が前期。ピンは日次値がある動画の公開日です。"
      actions={
        <SegmentedToggle
          value={view}
          onChange={setView}
          label="日次推移の表示"
          options={[
            ["chart", "グラフ"],
            ["table", "表"],
          ]}
        />
      }
    >
      <p className="chart-summary">{summary}</p>
      {view === "chart" && perVideo.length > MAX_CHART_VIDEOS && (
        <div className="row sort-row">
          <label className="small">
            グラフで見る動画{" "}
            <select value={activeFocusId} onChange={(e) => setFocusedVideoId(e.target.value)}>
              <option value="">視聴回数上位{MAX_CHART_VIDEOS}本</option>
              {perVideo.map((v) => (
                <option key={v.videoId} value={v.videoId}>
                  {v.title}
                </option>
              ))}
            </select>
          </label>
          <span className="small muted">
            合計線と選んだ動画の線を最大{MAX_CHART_VIDEOS}本表示。全{perVideo.length}
            本は表で確認できます。
          </span>
        </div>
      )}
      {view === "chart" ? (
        <EChart option={option} label={summary} height={260} />
      ) : (
        <div className="table-wrap">
          <table className="data-table compact">
            <caption className="visually-hidden">日次の視聴回数</caption>
            <thead>
              <tr>
                <th scope="col">日付</th>
                <th scope="col">今期</th>
                <th scope="col">前期</th>
                {tableVideos.map((v) => (
                  <th key={v.videoId} scope="col">
                    {v.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d, i) => (
                <tr key={d}>
                  <td data-label="日付">{d}</td>
                  <td data-label="今期">{fmtNumber(current[i])}</td>
                  <td data-label="前期">{fmtNumber(previous[i])}</td>
                  {tableVideos.map((v) => (
                    <td key={v.videoId} data-label={v.title}>
                      {fmtNumber(v.values[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
