// 動画別の実績（表 / 構成比の切替）。表は表示対象、構成比はチャンネルの全動画を分母にする。
import type { EChartsCoreOption } from "echarts/core";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { videoContentTypeLabel } from "../../../src/domain/video-content-type";
import type { DashboardResponse, DashboardVideo, ShareItem } from "../../api";
import { type Column, DataTable } from "../../components/DataTable";
import { EChart } from "../../components/EChart";
import { SectionCard } from "../../components/SectionCard";
import { SegmentedToggle } from "../../components/SegmentedToggle";
import { fmtNumber } from "../../format";
import { chartColors } from "./chartColors";
import { fmtShare, slashDate } from "./format";
import { SourceBadge } from "./KpiCards";

/** サムネイルは自サイト経由（qa-095）。未保存・読込失敗は頭文字の代替表示 */
export function Thumbnail({
  video,
}: {
  video: Pick<DashboardVideo, "videoId" | "title" | "hasThumbnail">;
}) {
  const [broken, setBroken] = useState(false);
  if (!video.hasThumbnail || broken) {
    return (
      <span className="thumb thumb-fallback" aria-hidden="true">
        {video.title.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      className="thumb"
      src={`/api/media/thumbnails/${encodeURIComponent(video.videoId)}`}
      alt=""
      loading="lazy"
      width={96}
      height={54}
      onError={() => setBroken(true)}
    />
  );
}

type SortKey = "published" | "views";

/** 期間を保ったまま、表の1本をダッシュボードの集計対象にする。 */
export function singleVideoDashboardUrl(params: URLSearchParams, videoId: string): string {
  const next = new URLSearchParams();
  for (const key of ["period", "from", "to"]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  next.set("scope", "videos");
  next.set("video_ids", videoId);
  return `/?${next.toString()}`;
}

export function VideoPerformance({ data }: { data: DashboardResponse }) {
  const [view, setView] = useState<"table" | "share">("table");
  const [sort, setSort] = useState<SortKey>("published");
  const [searchParams] = useSearchParams();

  const rows = useMemo(() => {
    const list = [...data.videos];
    if (sort === "views") list.sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
    return list;
  }, [data.videos, sort]);

  return (
    <SectionCard
      id="videos"
      title="動画別の実績"
      description="表は表示対象、構成比はチャンネルの全動画を示します。"
      actions={
        <SegmentedToggle
          value={view}
          onChange={setView}
          label="動画別の実績の表示"
          options={[
            ["table", "表"],
            ["share", "構成比"],
          ]}
        />
      }
    >
      {view === "table" ? (
        <VideoTable rows={rows} sort={sort} onSort={setSort} searchParams={searchParams} />
      ) : (
        <Composition data={data} />
      )}
    </SectionCard>
  );
}

function videoColumns(searchParams: URLSearchParams): Column<DashboardVideo>[] {
  return [
    {
      key: "video",
      label: "動画",
      render: (v) => (
        <Link className="video-cell" to={singleVideoDashboardUrl(searchParams, v.videoId)}>
          <Thumbnail video={v} />
          <span>
            <span className="video-title">{v.title}</span>
            <span className="small muted">
              {slashDate(v.publishedAt)}・{videoContentTypeLabel(v.contentType)}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: "angle",
      label: "切り口",
      render: (v) =>
        v.angle ? (
          <span className="badge angle-badge">{v.angle}</span>
        ) : (
          <span className="muted">未分類</span>
        ),
    },
    { key: "views", label: "視聴回数", render: (v) => fmtNumber(v.views) },
    { key: "retention", label: "平均視聴率", render: (v) => <RetentionBar value={v.retention} /> },
    {
      key: "ctr",
      label: "CTR（最新日の原値）",
      render: (v) =>
        v.ctr === null ? (
          "—"
        ) : (
          <>
            {String(v.ctr)}
            {v.ctrDate && <span className="small muted">（{slashDate(v.ctrDate)}）</span>}
          </>
        ),
    },
  ];
}

function VideoTable({
  rows,
  sort,
  onSort,
  searchParams,
}: {
  rows: DashboardVideo[];
  sort: SortKey;
  onSort: (s: SortKey) => void;
  searchParams: URLSearchParams;
}) {
  if (rows.length === 0) return <p className="muted">この期間に表示できる動画がありません。</p>;
  return (
    <>
      <div className="row sort-row">
        <label className="small">
          並べ替え{" "}
          <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
            <option value="published">公開日の新しい順</option>
            <option value="views">視聴回数の多い順</option>
          </select>
        </label>
        <span className="small muted">
          視聴回数・CTR <SourceBadge source="api" /> 平均視聴率 <SourceBadge source="csv" />
        </span>
      </div>
      <p className="small muted">
        CTRは対象期間内で各動画の最新日に記録されたReporting
        CSVの原値です。実ファイルで単位を確認するまで、%への換算は行いません。
      </p>
      <DataTable
        caption="動画別の実績"
        className="video-table"
        columns={videoColumns(searchParams)}
        rows={rows}
        rowKey={(v) => v.videoId}
        empty="この期間に表示できる動画がありません。"
      />
    </>
  );
}

function RetentionBar({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  const width = Math.max(0, Math.min(100, value));
  return (
    <span className="inline-bar">
      <span className="inline-bar-track" aria-hidden="true">
        <span className="inline-bar-fill" style={{ width: `${width}%` }} />
      </span>
      <span>{value.toFixed(1)}%</span>
    </span>
  );
}

function shareOption(items: ShareItem[]): EChartsCoreOption {
  const palette = chartColors().composition;
  return {
    animation: false,
    tooltip: { trigger: "item", renderMode: "richText" },
    series: [
      {
        type: "pie",
        radius: ["45%", "75%"],
        label: { formatter: "{b}\n{d}%", fontSize: 11 },
        data: items.map((x, i) => ({
          name: x.label,
          value: x.views,
          itemStyle: { color: palette[i % palette.length] },
        })),
      },
    ],
  };
}

export function ShareList({ title, items }: { title: string; items: ShareItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="share-list">
      <h3>{title}</h3>
      <ul>
        {items.map((x) => (
          <li key={x.label}>
            <span className="share-label">{x.label}</span>
            <span className="inline-bar-track" aria-hidden="true">
              <span
                className="inline-bar-fill"
                style={{ width: `${Math.round(x.share * 100)}%` }}
              />
            </span>
            <span className="share-value">
              {fmtShare(x.share)}（{fmtNumber(x.views)}回）
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Composition({ data }: { data: DashboardResponse }) {
  const { composition } = data;
  const option = useMemo(() => shareOption(composition.byVideo), [composition.byVideo]);
  if (composition.totalViews === 0)
    return <p className="muted">この期間の視聴回数がまだありません。</p>;
  const visibleViews = data.videos.reduce((total, video) => total + (video.views ?? 0), 0);
  const contribution = visibleViews / composition.totalViews;
  const visibleLabel =
    data.scope === "videos"
      ? `選択した${data.videos.length}本`
      : `表に表示中の${data.videos.length}本`;
  const summary = `チャンネルの全動画の視聴回数 ${fmtNumber(composition.totalViews)}回のうち、上位3本が ${fmtShare(composition.top3Share)} を占めています。`;
  return (
    <div className="composition">
      <p className="chart-summary">{summary}</p>
      <p className="small muted">
        {visibleLabel}の寄与: {fmtShare(contribution)}（{fmtNumber(visibleViews)}
        回）。分母は動画別視聴回数の合計です。公式のチャンネル合計とは一致しない場合があります。
      </p>
      <div className="composition-grid">
        <div>
          <EChart option={option} label={summary} height={240} />
          <ShareList title="動画別（上位5本＋その他）" items={composition.byVideo} />
        </div>
        <div>
          <ShareList title="切り口別" items={composition.byAngle} />
          <ShareList title="形式別" items={composition.byFormat} />
          <ShareList title="新作・過去作" items={composition.byNewness} />
        </div>
      </div>
    </div>
  );
}
