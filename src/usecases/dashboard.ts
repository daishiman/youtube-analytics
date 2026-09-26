// GET /api/dashboard の集約（qa-093〜qa-099）。読み取り専用で、D1 はチャンネル・動画一覧、
// 期間集計 batch、サイド情報 batch を読む。グラフは描画ライブラリに依存しない仕様 JSON で返す

import { COLLECTION_STATUS_TEXT } from "../domain/collection-status";
import {
  dateList,
  jstDateOf,
  type ResolvedPeriod,
  resolvePeriod,
} from "../domain/dashboard-period";
import { API_DATA_MAX_AGE_DAYS } from "../domain/data-retention";
import { can, requirePermission, type TenantContext } from "../domain/tenant-context";
import { DAY_MS } from "../domain/time";
import { type VideoContentType, videoContentTypeLabel } from "../domain/video-content-type";
import { AppError } from "../lib/errors";
import {
  type DailySumRow,
  DashboardRepository,
  type RetentionDailyRow,
  type VideoRow,
} from "../repositories/dashboard-repository";
import { controlDb } from "../repositories/db";
import { type Deps, iso } from "./common";

export const DEFAULT_SELECTION = 10;
/** 構成比（動画別）で個別に出す本数。残りは「その他」にまとめる */
export const TOP_VIDEOS = 5;
export const THUMBNAIL_TTL_DAYS = API_DATA_MAX_AGE_DAYS;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const M1_DISCLOSURE =
  "長尺動画のStudio CSV日次平均視聴率を視聴回数で加重した暫定値です。正式なM1に必要なエンゲージビュー・再生時間・動画長の同一期間データは揃っておらず、YouTube公式の数値ではありません";
export const SUBSCRIBERS_VIDEO_NOTE =
  "現在の収集データには動画ごとの登録者増減がないため、チャンネル全体の値だけを表示します";

export type KpiId = "views" | "watch_hours" | "retention_m1" | "subscribers_net";

export interface Kpi {
  id: KpiId;
  label: string;
  unit: string;
  value: number | null;
  previous: number | null;
  /** (今期 - 前期) / 前期。前期が 0 か不明なら null */
  change: number | null;
  /** 今期の日次の点列（KPI カードの小さな推移線） */
  points: (number | null)[];
  source: "api" | "csv";
  note: string | null;
}

export interface DashboardVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  contentType: VideoContentType;
  angle: string | null;
  hasThumbnail: boolean;
  views: number | null;
  watchHours: number | null;
  retention: number | null;
  ctr: number | null;
  ctrDate: string | null;
}

export interface ShareItem {
  label: string;
  views: number;
  share: number;
}

export interface DashboardResponse {
  period: {
    key: string;
    from: string;
    to: string;
    days: number;
    previousFrom: string;
    previousTo: string;
  };
  scope: "channel" | "videos";
  channel: { channelId: string; title: string } | null;
  /** lastSucceededAt は基本日次収集のみの成功時刻。Reporting・属性の成功は表さない。 */
  collection: { status: string; lastSucceededAt: string | null };
  selection: { videoIds: string[]; isDefault: boolean };
  kpis: Kpi[];
  trend: {
    dates: string[];
    current: (number | null)[];
    /** 前期を今期と同じ位置に並べた値（前期の1日目 = 今期の1日目） */
    previous: (number | null)[];
    published: { date: string; videoId: string; title: string }[];
    perVideo: { videoId: string; title: string; values: (number | null)[] }[];
  };
  videos: DashboardVideo[];
  composition: {
    totalViews: number;
    byVideo: ShareItem[];
    byAngle: ShareItem[];
    byFormat: ShareItem[];
    byNewness: ShareItem[];
    top3Share: number | null;
  };
  latestReport: {
    reportId: string;
    title: string;
    version: number;
    conclusion: string | null;
    findings: string[];
    createdAt: string;
  } | null;
  actions: {
    actionId: string;
    title: string;
    status: "実施中" | "効果測定中";
    metricLabel: string | null;
    baselineValue: number | null;
    latestValue: number | null;
    unit: string | null;
    startedAt: string | null;
    endsAt: string | null;
  }[];
  videoOptions: { videoId: string; title: string; publishedAt: string }[];
  empty: {
    notLinked: boolean;
    notCollected: boolean;
    noCsv: boolean;
    noReports: boolean;
    noActions: boolean;
  };
  canEdit: boolean;
}

export interface DashboardQuery {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: string | null;
  video_ids?: string | null;
}

/** video_ids（カンマ区切り）を検証して重複を除く。形式違反は 400。件数の上限は設けない（qa-096） */
export function parseVideoIds(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const id of ids) {
    if (!VIDEO_ID_RE.test(id)) {
      throw new AppError("VALIDATION_FAILED", "動画IDの形式が正しくありません");
    }
  }
  return [...new Set(ids)];
}

function parseScope(raw: string | null | undefined): "channel" | "videos" {
  if (raw === null || raw === undefined || raw === "") return "channel";
  if (raw === "channel" || raw === "videos") return raw;
  throw new AppError("VALIDATION_FAILED", "対象は channel か videos を指定してください");
}

const sum = (xs: (number | null)[]) => {
  let total = 0;
  let seen = false;
  for (const x of xs) {
    if (x !== null && x !== undefined) {
      total += x;
      seen = true;
    }
  }
  return seen ? total : null;
};

function completeSeries(xs: (number | null)[], days: number): boolean {
  return xs.length === days && xs.every((value) => value !== null && Number.isFinite(value));
}

function coverageNote(currentComplete: boolean, previousComplete: boolean) {
  if (!currentComplete)
    return "対象期間に欠測があります。値は取得できたデータだけに基づき、前期比は保留しています";
  if (!previousComplete) return "前期に欠測があるため、前期比は保留しています";
  return null;
}

function change(value: number | null, previous: number | null): number | null {
  if (value === null || previous === null || previous <= 0) return null;
  return (value - previous) / previous;
}

const round = (n: number | null, digits: number) =>
  n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;

/** 日付 → 値 の表を、期間の日付列に並べる（無い日は null） */
function align<T extends { date: string }>(
  rows: T[],
  dates: string[],
  pick: (row: T) => number | null,
): (number | null)[] {
  const byDate = new Map(rows.map((r) => [r.date, pick(r)]));
  return dates.map((d) => byDate.get(d) ?? null);
}

function retention(rows: RetentionDailyRow[]): number | null {
  let weighted = 0;
  let views = 0;
  for (const r of rows) {
    if (r.weighted !== null && r.views !== null) {
      weighted += r.weighted;
      views += r.views;
    }
  }
  return views > 0 ? weighted / views : null;
}

function shareItems(entries: [string, number][], total: number): ShareItem[] {
  return entries
    .filter(([, v]) => v > 0)
    .map(([label, views]) => ({ label, views, share: total > 0 ? views / total : 0 }));
}

function buildKpis(args: {
  period: ResolvedPeriod;
  scope: "channel" | "videos";
  daily: DailySumRow[];
  retention: RetentionDailyRow[];
  channelDaily: DailySumRow[];
  selectedCount: number;
  longCount: number;
}): Kpi[] {
  const { period, scope } = args;
  const cur = dateList(period.current);
  const prev = dateList(period.previous);
  const inRange = <T extends { date: string }>(rows: T[], r: { from: string; to: string }) =>
    rows.filter((x) => x.date >= r.from && x.date <= r.to);

  const views = align(args.daily, cur, (r) => r.views);
  const prevViews = align(args.daily, prev, (r) => r.views);
  const minutes = align(args.daily, cur, (r) => r.minutes);
  const prevMinutes = align(args.daily, prev, (r) => r.minutes);
  const toHours = (m: number | null) => (m === null ? null : m / 60);
  const retCur = inRange(args.retention, period.current);
  const retPrev = inRange(args.retention, period.previous);
  const net = (r: DailySumRow) =>
    r.subscribers_gained === null && r.subscribers_lost === null
      ? null
      : (r.subscribers_gained ?? 0) - (r.subscribers_lost ?? 0);
  const subs = align(args.channelDaily, cur, net);
  const prevSubs = align(args.channelDaily, prev, net);

  const viewsValue = sum(views);
  const viewsPrev = sum(prevViews);
  const hoursValue = toHours(sum(minutes));
  const hoursPrev = toHours(sum(prevMinutes));
  const m1 = retention(retCur);
  const m1Prev = retention(retPrev);
  const m1Points = cur.map((d) => retention(retCur.filter((r) => r.date === d)));
  const m1PrevPoints = prev.map((d) => retention(retPrev.filter((r) => r.date === d)));
  const subsValue = scope === "channel" ? sum(subs) : null;
  const subsPrev = scope === "channel" ? sum(prevSubs) : null;
  const completeDaily = (
    values: (number | null)[],
    dates: string[],
    countKey: "views_count" | "minutes_count",
  ) =>
    completeSeries(values, dates.length) &&
    (scope === "channel" ||
      (args.selectedCount > 0 &&
        align(args.daily, dates, (row) => row[countKey] ?? null).every(
          (count) => count === args.selectedCount,
        )));
  const viewsComplete = completeDaily(views, cur, "views_count");
  const prevViewsComplete = completeDaily(prevViews, prev, "views_count");
  const minutesComplete = completeDaily(minutes, cur, "minutes_count");
  const prevMinutesComplete = completeDaily(prevMinutes, prev, "minutes_count");
  const completeM1 = (points: (number | null)[], dates: string[]) =>
    completeSeries(points, dates.length) &&
    args.longCount > 0 &&
    align(args.retention, dates, (row) => row.sourced_count ?? null).every(
      (count) => count === args.longCount,
    );
  const m1Complete = completeM1(m1Points, cur);
  const prevM1Complete = completeM1(m1PrevPoints, prev);
  const subsComplete = completeSeries(subs, cur.length);
  const prevSubsComplete = completeSeries(prevSubs, prev.length);

  return [
    {
      id: "views",
      label: "視聴回数",
      unit: "回",
      value: viewsValue,
      previous: viewsPrev,
      change: viewsComplete && prevViewsComplete ? change(viewsValue, viewsPrev) : null,
      points: views,
      source: "api",
      note: coverageNote(viewsComplete, prevViewsComplete),
    },
    {
      id: "watch_hours",
      label: "総再生時間",
      unit: "時間",
      value: round(hoursValue, 1),
      previous: round(hoursPrev, 1),
      change: minutesComplete && prevMinutesComplete ? change(hoursValue, hoursPrev) : null,
      points: minutes.map((m) => round(toHours(m), 1)),
      source: "api",
      note: coverageNote(minutesComplete, prevMinutesComplete),
    },
    {
      id: "retention_m1",
      label: "長尺の平均視聴率（暫定）",
      unit: "%",
      value: round(m1, 1),
      previous: round(m1Prev, 1),
      change: m1Complete && prevM1Complete ? change(m1, m1Prev) : null,
      points: m1Points.map((value) => round(value, 1)),
      source: "csv",
      note: [M1_DISCLOSURE, coverageNote(m1Complete, prevM1Complete)].filter(Boolean).join("。"),
    },
    {
      id: "subscribers_net",
      label: "登録者の増減",
      unit: "人",
      value: subsValue,
      previous: subsPrev,
      change:
        scope === "channel" && subsComplete && prevSubsComplete
          ? change(subsValue, subsPrev)
          : null,
      points: scope === "channel" ? subs : [],
      source: "api",
      note:
        scope === "videos" ? SUBSCRIBERS_VIDEO_NOTE : coverageNote(subsComplete, prevSubsComplete),
    },
  ];
}

export async function getDashboard(
  deps: Deps,
  ctx: TenantContext,
  query: DashboardQuery,
): Promise<DashboardResponse> {
  requirePermission(ctx, "tenant.read");
  // 入力検証を D1 より先に行う（不正な入力では DB に触れない）
  let period = resolvePeriod(query, deps.now);
  const scope = parseScope(query.scope);
  const requestedIds = parseVideoIds(query.video_ids);

  const repo = new DashboardRepository(controlDb(deps.env), ctx);
  const channel = await repo.channel(deps.now);
  if (channel?.latest_analytics_date) {
    // 収集完了時刻ではなく保存済みAnalytics日次の最終日を固定期間の末日にする。
    // 任意期間は指定日を維持し、選択動画が変わっても期間は動かさない。
    period = resolvePeriod(query, deps.now, channel.latest_analytics_date);
  }
  const canEdit = can(ctx.role, "content.write");
  const periodOut = {
    key: period.key,
    from: period.current.from,
    to: period.current.to,
    days: period.current.days,
    previousFrom: period.previous.from,
    previousTo: period.previous.to,
  };
  const dates = dateList(period.current);

  if (!channel) {
    return emptyResponse({ period: periodOut, scope, dates, canEdit });
  }

  const freshSince = iso(new Date(deps.now.getTime() - THUMBNAIL_TTL_DAYS * DAY_MS));
  const allVideos = await repo.videos(channel.channel_id, freshSince);
  const known = new Map(allVideos.map((v) => [v.video_id, v]));
  // 他テナント・存在しない ID は黙って除外する（qa-097）。省略時は公開日の新しい順に10本
  const isDefault = requestedIds === null;
  const selectedIds = isDefault
    ? allVideos.slice(0, DEFAULT_SELECTION).map((v) => v.video_id)
    : requestedIds.filter((id) => known.has(id));

  const agg = await repo.periodAggregates({
    channelId: channel.channel_id,
    selectedIds,
    scope,
    range: { from: period.previous.from, to: period.current.to },
    current: period.current,
  });
  const side = await repo.sideData(channel.channel_id);

  const daily = scope === "channel" ? agg.channelDaily : agg.selectionDaily;
  const kpis = buildKpis({
    period,
    scope,
    daily,
    retention: agg.retentionDaily,
    channelDaily: agg.channelDaily,
    selectedCount: selectedIds.length,
    longCount: (scope === "channel" ? allVideos : selectedIds.map((id) => known.get(id))).filter(
      (video) => video?.content_type === "long",
    ).length,
  });
  // CSV が保存されていても、表示期間・対象に有効な長尺動画の値が無ければ M1 は表示できない。
  const hasUsableM1 = kpis.some((k) => k.id === "retention_m1" && k.value !== null);

  // 前期は今期と同じ位置へ並べる（前期の1日目 = 今期の1日目）
  const previousDates = dateList(period.previous);
  const selected = selectedIds.map((id) => known.get(id)).filter((v): v is VideoRow => Boolean(v));
  const perVideoRows = new Map<string, { date: string; views: number | null }[]>();
  for (const r of agg.perVideoDaily) {
    const list = perVideoRows.get(r.video_id) ?? [];
    list.push(r);
    perVideoRows.set(r.video_id, list);
  }
  const published = (scope === "channel" ? allVideos : selected)
    .filter((v) => v.published_at !== "")
    .map((v) => ({ date: jstDateOf(v.published_at), videoId: v.video_id, title: v.title }))
    .filter((p) => p.date >= period.current.from && p.date <= period.current.to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const trend = {
    dates,
    current: align(daily, dates, (r) => r.views),
    previous: align(daily, previousDates, (r) => r.views),
    published,
    perVideo:
      scope === "videos"
        ? selected.map((v) => ({
            videoId: v.video_id,
            title: v.title,
            values: align(perVideoRows.get(v.video_id) ?? [], dates, (r) => r.views),
          }))
        : [],
  };

  const totals = new Map(agg.videoTotals.map((r) => [r.video_id, r]));
  const rets = new Map(agg.videoRetention.map((r) => [r.video_id, r]));
  const ctrs = new Map(agg.ctr.map((r) => [r.video_id, r]));
  const videos: DashboardVideo[] = selected.map((v) => {
    const t = totals.get(v.video_id);
    const r = rets.get(v.video_id);
    const c = ctrs.get(v.video_id);
    return {
      videoId: v.video_id,
      title: v.title,
      publishedAt: v.published_at,
      contentType: v.content_type,
      angle: v.angle,
      hasThumbnail: v.thumbnail_fetched_at !== null,
      views: t?.views ?? null,
      watchHours: round(t?.minutes == null ? null : t.minutes / 60, 1),
      retention: round(r?.weighted != null && r.views ? r.weighted / r.views : null, 1),
      ctr: c?.ctr ?? null,
      ctrDate: c?.date ?? null,
    };
  });

  const composition = buildComposition({
    allVideos,
    totals: new Map([...totals].map(([id, r]) => [id, r.views ?? 0])),
    current: period.current,
  });

  return {
    period: periodOut,
    scope,
    channel: { channelId: channel.channel_id, title: channel.title },
    collection: {
      status: channel.collection_failed
        ? "収集失敗あり（基本日次・Reporting・属性のいずれか）"
        : COLLECTION_STATUS_TEXT,
      lastSucceededAt: channel.last_collected_at,
    },
    selection: { videoIds: selected.map((v) => v.video_id), isDefault },
    kpis,
    trend,
    videos,
    composition,
    latestReport: side.report
      ? {
          reportId: side.report.report_id,
          title: side.report.title,
          version: side.report.version,
          conclusion: side.report.conclusion,
          findings: side.findings,
          createdAt: side.report.created_at,
        }
      : null,
    actions: side.actions.map((a) => ({
      actionId: a.action_id,
      title: a.title,
      status: a.status,
      metricLabel: a.metric_label,
      baselineValue: a.baseline_value,
      latestValue: a.latest_value,
      unit: a.unit,
      startedAt: a.started_at,
      endsAt: a.ends_at,
    })),
    videoOptions: allVideos.map((v) => ({
      videoId: v.video_id,
      title: v.title,
      publishedAt: v.published_at,
    })),
    empty: {
      notLinked: false,
      notCollected: !side.hasApi,
      noCsv: !hasUsableM1,
      noReports: side.report === null,
      noActions: side.actions.length === 0,
    },
    canEdit,
  };
}

/** 構成比。分母はチャンネルの全動画の今期視聴回数（API の動画別値の合計） */
export function buildComposition(args: {
  allVideos: Pick<VideoRow, "video_id" | "title" | "published_at" | "content_type" | "angle">[];
  totals: Map<string, number>;
  current: { from: string; to: string };
}): DashboardResponse["composition"] {
  const { allVideos, totals } = args;
  const rows = allVideos
    .map((v) => ({ v, views: totals.get(v.video_id) ?? 0 }))
    .filter((r) => r.views > 0);
  const total = rows.reduce((acc, r) => acc + r.views, 0);
  const sorted = [...rows].sort((a, b) => b.views - a.views);

  // 上位5本と「その他」。上位に入らなくても選んだ動画はその他に含める（表で個別に見られるため）
  const top = sorted.slice(0, TOP_VIDEOS);
  const rest = sorted.slice(TOP_VIDEOS).reduce((acc, r) => acc + r.views, 0);
  const byVideo = shareItems(
    [...top.map((r): [string, number] => [r.v.title, r.views]), ["その他", rest]],
    total,
  );

  const group = (key: (v: (typeof rows)[number]["v"]) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r.v), (m.get(key(r.v)) ?? 0) + r.views);
    return shareItems(
      [...m].sort((a, b) => b[1] - a[1]),
      total,
    );
  };
  const top3 = sorted.slice(0, 3).reduce((acc, r) => acc + r.views, 0);
  return {
    totalViews: total,
    byVideo,
    byAngle: group((v) => v.angle ?? "未分類"),
    byFormat: group((v) => videoContentTypeLabel(v.content_type)),
    byNewness: group((v) =>
      v.published_at === ""
        ? "公開日未取得"
        : jstDateOf(v.published_at) >= args.current.from
          ? "新作（期間内に公開）"
          : "過去作",
    ),
    top3Share: total > 0 ? top3 / total : null,
  };
}

function emptyResponse(args: {
  period: DashboardResponse["period"];
  scope: "channel" | "videos";
  dates: string[];
  canEdit: boolean;
}): DashboardResponse {
  const blank = (id: KpiId, label: string, unit: string, source: "api" | "csv"): Kpi => ({
    id,
    label,
    unit,
    value: null,
    previous: null,
    change: null,
    points: [],
    source,
    note: id === "retention_m1" ? M1_DISCLOSURE : null,
  });
  return {
    period: args.period,
    scope: args.scope,
    channel: null,
    collection: { status: COLLECTION_STATUS_TEXT, lastSucceededAt: null },
    selection: { videoIds: [], isDefault: true },
    kpis: [
      blank("views", "視聴回数", "回", "api"),
      blank("watch_hours", "総再生時間", "時間", "api"),
      blank("retention_m1", "長尺の平均視聴率（暫定）", "%", "csv"),
      blank("subscribers_net", "登録者の増減", "人", "api"),
    ],
    trend: { dates: args.dates, current: [], previous: [], published: [], perVideo: [] },
    videos: [],
    composition: {
      totalViews: 0,
      byVideo: [],
      byAngle: [],
      byFormat: [],
      byNewness: [],
      top3Share: null,
    },
    latestReport: null,
    actions: [],
    videoOptions: [],
    empty: { notLinked: true, notCollected: true, noCsv: true, noReports: true, noActions: true },
    canEdit: args.canEdit,
  };
}
