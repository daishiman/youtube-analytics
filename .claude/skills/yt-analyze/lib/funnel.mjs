// /yt-analyze の YouTube 向け計算（正本 docs/analysis/dashboard-analysis-catalog.md §2・§2.1）。
// 依存なしの純粋関数だけを置き、analysis.mjs（report-design-system の再現計算）と
// サーバ側テスト（tests/skill-analysis）の両方から同じ式を使う。LLM は数字を手で書かない。
//
// 入力は GET /api/skill/export の rows。1行 = { source, period, video_id, metric, value }
//   source : "api" | "studio_csv" | "business_csv"
//   period : JST 月曜の週開始日 (YYYY-MM-DD)
//   value  : 数値。null は「未提供」で 0（実測0）と区別する

export const SOURCES = ["api", "studio_csv", "business_csv"];

/** 週次ファネルの5原因指標（表示順）。sample は min_sample と比べる件数の元 */
export const CAUSE_METRICS = [
  { id: "impressions", label: "インプレッション", unit: "回", stage: "露出" },
  { id: "ctr", label: "クリック率", unit: "%", stage: "流入" },
  { id: "m1", label: "加重平均視聴率", unit: "%", stage: "維持" },
  { id: "lead_route_rate", label: "導線誘導率", unit: "%", stage: "導線" },
  { id: "inquiry_close_rate", label: "問い合わせ→成約率（同週）", unit: "%", stage: "成約" },
];

export const STAGES = CAUSE_METRICS.map((m) => m.stage);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const sum = (xs) => xs.reduce((t, x) => t + x, 0);

/** 1つの source の行だけを { period → video_id → metric → value } にまとめる */
function index(rows, source) {
  const out = new Map();
  for (const r of rows) {
    if (r.source !== source) continue;
    const byVideo = out.get(r.period) ?? new Map();
    const key = r.video_id ?? "";
    const m = byVideo.get(key) ?? {};
    m[r.metric] = num(r.value);
    byVideo.set(key, m);
    out.set(r.period, byVideo);
  }
  return out;
}

/** 分母が 0 または欠損なら null（0 へ丸めない） */
const ratio = (a, b, scale = 1) => (a == null || b == null || b === 0 ? null : (a / b) * scale);

/** 動画群の M1 = Σ(総再生時間h×3600) ÷ Σ(エンゲージビュー×長さ) ×100。欠損の動画は除く */
export function weightedViewRate(videos) {
  const ok = videos.filter(
    (v) => v.watch_hours != null && v.engaged_views != null && v.duration_sec != null,
  );
  if (!ok.length) return null;
  return ratio(
    sum(ok.map((v) => v.watch_hours * 3600)),
    sum(ok.map((v) => v.engaged_views * v.duration_sec)),
    100,
  );
}

/**
 * 週ごとの原因指標と結果指標。YouTube 側（impressions・ctr・m1・views）は studio_csv だけ、
 * 事業側（route_visits・inquiries・closed_deals）は business_csv だけを使う（api 行は混ぜない）
 */
export function weeklyFunnel(rows) {
  const studio = index(rows, "studio_csv");
  const business = index(rows, "business_csv");
  const weeks = [...new Set([...studio.keys(), ...business.keys()])].sort();
  return weeks.map((week) => {
    const videos = [...(studio.get(week)?.values() ?? [])];
    const biz = business.get(week)?.get("") ?? {};
    const pick = (k) => {
      const xs = videos.map((v) => v[k]).filter((x) => x != null);
      return xs.length ? sum(xs) : null;
    };
    const impressions = pick("impressions");
    const clicks = (() => {
      const xs = videos.filter((v) => v.impressions != null && v.ctr != null);
      return xs.length ? sum(xs.map((v) => (v.impressions * v.ctr) / 100)) : null;
    })();
    const views = pick("views");
    const engagedViews = pick("engaged_views");
    const routeVisits = num(biz.route_visits);
    const inquiries = num(biz.inquiries);
    const closedDeals = num(biz.closed_deals);
    return {
      week,
      impressions,
      ctr: ratio(clicks, impressions, 100),
      m1: weightedViewRate(videos),
      lead_route_rate: ratio(routeVisits, views, 100),
      inquiry_close_rate: ratio(closedDeals, inquiries, 100),
      views,
      engaged_views: engagedViews,
      route_visits: routeVisits,
      inquiries,
      closed_deals: closedDeals,
      revenue_jpy: num(biz.revenue_jpy),
      subscribers: pick("subscribers"),
    };
  });
}

/** min_sample と比べる件数（カタログ §2.1） */
function sampleOf(metricId, week) {
  switch (metricId) {
    case "impressions":
    case "ctr":
      return week.impressions;
    case "m1":
      return week.engaged_views;
    case "lead_route_rate":
      return week.views;
    default:
      return week.inquiries;
  }
}

/** 対象週に有効な最新の目標（effective_from ≤ week の中で最新） */
export function targetFor(targets, metricId, week) {
  return (
    (targets ?? [])
      .filter((t) => t.metric_id === metricId && t.effective_from <= week)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] ?? null
  );
}

/**
 * 1週の週次ファネル診断。各原因指標の actual/target/target_gap と判定保留理由を返し、
 * target_gap < 0 の中で最小の1件を「最大の改善候補」にする。全て 0 以上なら全指標目標達成。
 * 相関や因果は判定しない（どの指標が目標から最も離れているかだけを示す）
 */
export function diagnoseWeek(week, targets, { fresh = true } = {}) {
  const metrics = CAUSE_METRICS.map((m) => {
    const actual = week[m.id];
    const t = targetFor(targets, m.id, week.week);
    const sample = sampleOf(m.id, week);
    let pending = null;
    if (!fresh) pending = "鮮度不足";
    else if (actual == null) pending = "分母0または入力欠損";
    else if (!t || !(t.target_value > 0)) pending = "目標未設定または目標が0以下";
    else if (t.min_sample != null && (sample == null || sample < t.min_sample))
      pending = `サンプル不足（${sample ?? 0} < ${t.min_sample}）`;
    const target = t?.target_value ?? null;
    const gap = pending ? null : (actual - target) / target;
    return {
      metric: m.id,
      label: m.label,
      stage: m.stage,
      unit: m.unit,
      actual,
      target,
      target_gap: gap,
      pending_reason: pending,
    };
  });
  const judged = metrics.filter((m) => m.target_gap != null);
  const negatives = judged.filter((m) => m.target_gap < 0);
  const candidate = negatives.length
    ? negatives.reduce((a, b) => (b.target_gap < a.target_gap ? b : a))
    : null;
  const allMet = judged.length === metrics.length && negatives.length === 0;
  return {
    week: week.week,
    metrics,
    candidate: candidate ? { metric: candidate.metric, stage: candidate.stage, target_gap: candidate.target_gap } : null,
    status: candidate ? "改善候補あり" : allMet ? "全指標目標達成" : "判定保留",
    pending_reasons: metrics
      .filter((m) => m.pending_reason)
      .map((m) => ({ metric: m.metric, reason: m.pending_reason })),
    downstream: {
      inquiries: week.inquiries,
      closed_deals: week.closed_deals,
      revenue_jpy: week.revenue_jpy,
      subscribers: week.subscribers,
    },
  };
}

/**
 * 期間全体の M1〜M10（studio_csv 行だけ。api 行・business_csv 行は使わない）。
 * 動画ごとに期間内の週を合算してから比率を取る
 */
const STATIC_METRICS = new Set(["duration_sec", "publish_days"]);

export function channelMetrics(rows) {
  const videos = new Map();
  // ctr は週ごとの率なので合算できない。週×動画ごとに impressions×ctr/100 をクリック数へ直して足す
  for (const r of withClicks(rows)) {
    if (r.source !== "studio_csv" || !r.video_id || r.metric === "ctr") continue;
    const v = videos.get(r.video_id) ?? {};
    const x = num(r.value);
    if (x != null) v[r.metric] = STATIC_METRICS.has(r.metric) ? x : (v[r.metric] ?? 0) + x;
    videos.set(r.video_id, v);
  }
  const list = [...videos.entries()].map(([id, v]) => ({ id, ...v }));
  const total = (k) => {
    const xs = list.map((v) => v[k]).filter((x) => x != null);
    return xs.length ? sum(xs) : null;
  };
  const m2 = total("clicks");
  const views = total("views");
  const m6ByVideo = list
    .filter((v) => v.impressions != null && v.publish_days)
    .map((v) => ({ id: v.id, m6: v.impressions / v.publish_days }));
  const m6Total = m6ByVideo.length ? sum(m6ByVideo.map((x) => x.m6)) : null;
  const m1 = weightedViewRate(list);
  const leaveOneOut = list.length > 1
    ? Math.min(
        ...list.map((_, i) => {
          const rest = weightedViewRate(list.filter((__, j) => j !== i));
          return rest == null || m1 == null ? Number.POSITIVE_INFINITY : Math.abs(rest - m1);
        }),
      )
    : null;
  return {
    M1: m1,
    M2: m2,
    M3: ratio(m2, views),
    M4: ratio(total("unique_viewers"), views),
    M5: ratio(total("engaged_views"), views),
    M6: m6Total,
    M7: ratio(total("subscribers"), views, 1000),
    M8: ratio(total("unique_viewers"), total("unique_reach")),
    M9: m6ByVideo.map((x) => ({ video_id: x.id, share: ratio(x.m6, m6Total) })),
    M10: Number.isFinite(leaveOneOut) ? leaveOneOut : null,
    video_count: list.length,
  };
}

/** 週ごとの studio 行に clicks（impressions×ctr/100）を派生行として足す（M2 の正確な合算用） */
export function withClicks(rows) {
  const out = [...rows];
  const byKey = new Map();
  for (const r of rows) {
    if (r.source !== "studio_csv" || !r.video_id) continue;
    const k = `${r.period}\u0000${r.video_id}`;
    const m = byKey.get(k) ?? {};
    m[r.metric] = num(r.value);
    byKey.set(k, m);
  }
  for (const [k, m] of byKey) {
    if (m.impressions == null || m.ctr == null) continue;
    const [period, video_id] = k.split("\u0000");
    out.push({ source: "studio_csv", period, video_id, metric: "clicks", value: (m.impressions * m.ctr) / 100 });
  }
  return out;
}

/**
 * 施策の効果比較: 登録時点の baseline と、対象ファネル段の同じ原因指標の最新値・下流結果を並べる。
 * 差を示すだけで、施策が原因だとは判定しない
 */
export function actionEffect(action, funnelWeeks) {
  const latest = [...funnelWeeks].reverse().find((w) => w[action.metric] != null) ?? null;
  const current = latest ? latest[action.metric] : null;
  return {
    action_id: action.action_id,
    title: action.title,
    stage: action.stage,
    metric: action.metric,
    baseline: action.baseline_value,
    current,
    delta: current == null || action.baseline_value == null ? null : current - action.baseline_value,
    week: latest?.week ?? null,
    downstream: latest
      ? { inquiries: latest.inquiries, closed_deals: latest.closed_deals, revenue_jpy: latest.revenue_jpy }
      : null,
  };
}
