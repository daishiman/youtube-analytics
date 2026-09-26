// GET /api/dashboard/funnel?week=（qa-103。『詳しく見る』を開いたときだけ遅延取得する）。
// 判定は domain/funnel.ts の judgeFunnelWeek（database 章「週次売上ファネル追補」・qa-060）をそのまま使う。
// 12週分を1回の batch で範囲取得し、週ごとの集計はメモリ上で行う
import { addDays, isMonday, jstStartIso, jstToday, weekStartOf } from "../domain/dashboard-period";
import {
  type FunnelJudgement,
  type FunnelMetricId,
  type FunnelTarget,
  type FunnelWeekInput,
  judgeFunnelWeek,
} from "../domain/funnel";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { AppError } from "../lib/errors";
import { DashboardRepository, type FunnelTargetRow } from "../repositories/dashboard-repository";
import { controlDb } from "../repositories/db";
import type { Deps } from "./common";

export const FUNNEL_HISTORY_WEEKS = 12;
export const FUNNEL_DISCLAIMER =
  "目標との差が最も大きい段を示すもので、因果関係を示すものではありません。視聴率は長尺動画のCSV日次値を視聴回数で加重した暫定値です";

export interface FunnelWeek extends FunnelJudgement {
  weekStart: string;
  weekEnd: string;
  stale: boolean;
  results: { revenueJpy: number | null; closedDeals: number | null; subscribersNet: number | null };
}

export interface FunnelResponse {
  week: FunnelWeek | null;
  history: { weekStart: string; metrics: { id: FunnelMetricId; actual: number | null }[] }[];
  dataQuality: {
    studioImportedAt: string | null;
    businessImportedAt: string | null;
    missingDays: number;
  };
  rateBasis: "same_week_snapshot";
  disclaimer: string;
}

/** 直近の完了した週（JST 月曜始まり）。今週は途中なので前週 */
export function latestCompletedWeek(now: Date): string {
  return addDays(weekStartOf(jstToday(now)), -7);
}

/** 週ごとに、その週の月曜時点で有効な目標（effective_from が最新のもの）を選ぶ */
function targetsFor(rows: FunnelTargetRow[], weekStart: string) {
  const out: Partial<Record<FunnelMetricId, FunnelTarget>> = {};
  for (const r of rows) {
    const id = r.metric_id as FunnelMetricId;
    if (r.effective_from <= weekStart && !out[id]) {
      out[id] = { targetValue: r.target_value, minSample: r.min_sample };
    }
  }
  return out;
}

const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

export async function getFunnel(
  deps: Deps,
  ctx: TenantContext,
  query: { week?: string | null },
): Promise<FunnelResponse> {
  requirePermission(ctx, "tenant.read");
  const latest = latestCompletedWeek(deps.now);
  const week = query.week ?? latest;
  if (!isMonday(week)) {
    throw new AppError("VALIDATION_FAILED", "週は月曜日の日付（YYYY-MM-DD）で指定してください");
  }
  if (week > latest) {
    throw new AppError("VALIDATION_FAILED", "まだ終わっていない週は選べません");
  }

  const repo = new DashboardRepository(controlDb(deps.env), ctx);
  const channel = await repo.channel(deps.now);
  const firstWeek = addDays(week, -7 * (FUNNEL_HISTORY_WEEKS - 1));
  const empty: FunnelResponse = {
    week: null,
    history: [],
    dataQuality: { studioImportedAt: null, businessImportedAt: null, missingDays: 7 },
    rateBasis: "same_week_snapshot",
    disclaimer: FUNNEL_DISCLAIMER,
  };
  if (!channel) return empty;

  const input = await repo.funnelInputs(channel.channel_id, {
    from: firstWeek,
    to: addDays(week, 6),
  });

  const weeks: string[] = [];
  for (let w = firstWeek; w <= week; w = addDays(w, 7)) weeks.push(w);
  const weekOf = (date: string) => weekStartOf(date);

  const blank = (): FunnelWeekInput & {
    revenue: number | null;
    subs: number | null;
    days: number;
    studioImportedAt: string | null;
    businessImportedAt: string | null;
    dailyImportedAt: (string | null)[];
    m1Rows: number;
    m1Days: number;
    m1SourcedRows: number;
    m1OldestImportedAt: string | null;
  } => ({
    impressions: null,
    ctrWeightedSum: null,
    retentionWeightedSum: null,
    retentionViews: null,
    engagedViews: null,
    views: null,
    routeVisits: null,
    inquiries: null,
    closedDeals: null,
    revenue: null,
    subs: null,
    days: 0,
    studioImportedAt: null,
    businessImportedAt: null,
    dailyImportedAt: [],
    m1Rows: 0,
    m1Days: 0,
    m1SourcedRows: 0,
    m1OldestImportedAt: null,
  });
  const acc = new Map(weeks.map((w) => [w, blank()]));
  for (const d of input.daily) {
    const a = acc.get(weekOf(d.date));
    if (!a) continue;
    a.days += 1;
    a.dailyImportedAt.push(d.imported_at);
    if (d.imported_at && (a.studioImportedAt === null || d.imported_at > a.studioImportedAt)) {
      a.studioImportedAt = d.imported_at;
    }
    a.impressions = add(a.impressions, d.impressions);
    a.ctrWeightedSum = add(a.ctrWeightedSum, d.ctr_weighted);
    a.engagedViews = add(a.engagedViews, d.engaged_views);
    a.views = add(a.views, d.views);
  }
  for (const r of input.retention) {
    const a = acc.get(weekOf(r.date));
    if (!a) continue;
    a.retentionWeightedSum = add(a.retentionWeightedSum, r.weighted);
    a.retentionViews = add(a.retentionViews, r.views);
    a.m1Rows += r.m1_rows;
    if (r.m1_rows > 0) a.m1Days += 1;
    a.m1SourcedRows += r.m1_sourced_rows;
    if (
      r.oldest_imported_at &&
      (a.m1OldestImportedAt === null || r.oldest_imported_at < a.m1OldestImportedAt)
    ) {
      a.m1OldestImportedAt = r.oldest_imported_at;
    }
  }
  for (const b of input.business) {
    const a = acc.get(b.week_start);
    if (!a) continue;
    a.routeVisits = b.route_visits;
    a.inquiries = b.inquiries;
    a.closedDeals = b.closed_deals;
    a.revenue = b.revenue_jpy;
    a.businessImportedAt = b.imported_at;
  }
  for (const s of input.subscribers) {
    const a = acc.get(weekOf(s.date));
    if (!a) continue;
    if (s.subscribers_gained !== null || s.subscribers_lost !== null) {
      a.subs = (a.subs ?? 0) + (s.subscribers_gained ?? 0) - (s.subscribers_lost ?? 0);
    }
  }

  // 鮮度: 週末（翌月曜 00:00 JST）より後に取り込んだ CSV でなければ、その週の値は確定していない
  const staleFor = (w: string, a: ReturnType<typeof blank>) => {
    const weekEndIso = jstStartIso(addDays(w, 7));
    const business = a.businessImportedAt;
    const studioDailyComplete =
      a.days === 7 &&
      a.dailyImportedAt.every((imported) => imported !== null && imported >= weekEndIso);
    const m1Complete =
      a.m1Days === 7 &&
      a.m1Rows > 0 &&
      a.m1SourcedRows === a.m1Rows &&
      a.m1OldestImportedAt !== null &&
      a.m1OldestImportedAt >= weekEndIso;
    return (
      deps.now.toISOString() < weekEndIso ||
      !studioDailyComplete ||
      !m1Complete ||
      business === null ||
      business < weekEndIso
    );
  };

  const judged = weeks.map((w) => {
    const a = acc.get(w) ?? blank();
    const stale = staleFor(w, a);
    return { w, a, stale, j: judgeFunnelWeek(a, targetsFor(input.targets, w), stale) };
  });
  const target = judged[judged.length - 1];

  return {
    week: target
      ? {
          ...target.j,
          weekStart: week,
          weekEnd: addDays(week, 6),
          stale: target.stale,
          results: {
            revenueJpy: target.a.revenue,
            closedDeals: target.a.closedDeals,
            subscribersNet: target.a.subs,
          },
        }
      : null,
    history: judged.map((x) => ({
      weekStart: x.w,
      metrics: x.j.metrics.map((m) => ({ id: m.id, actual: m.actual })),
    })),
    dataQuality: {
      studioImportedAt: target?.a.studioImportedAt ?? null,
      businessImportedAt: target?.a.businessImportedAt ?? null,
      missingDays: 7 - (target?.a.days ?? 0),
    },
    rateBasis: "same_week_snapshot",
    disclaimer: FUNNEL_DISCLAIMER,
  };
}
