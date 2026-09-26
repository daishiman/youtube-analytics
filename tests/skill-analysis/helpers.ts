// スキル連携 API テストの共通部品: トークン付きテナント・チャンネル連携・依頼・結果 JSON の雛形と、
// 未実装の依存 feature（日次収集・CSV 取込）が作る書き出し元の境界スタブ
import { env } from "cloudflare:workers";
import { expect } from "vitest";
import REPORT_FIXTURE from "../fixtures/skill-analysis-report.json";
import { type CallOptions, call, type LoggedIn, newOwner, type Owner } from "../platform/helpers";

export { REPORT_FIXTURE };

/**
 * 境界スタブ: feat-youtube-daily-collection / feat-csv-media-ingest が作る週次集計の代わり。
 * 本番 migrations には含めない（依存 feature が正本を作る）。scripts/seed-local.sql と同じ形
 */
export const EXPORT_BOUNDARY_DDL = [
  `CREATE TABLE IF NOT EXISTS analysis_export_rows (
     tenant_id TEXT NOT NULL, channel_id TEXT NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('api', 'studio_csv', 'business_csv')),
     period TEXT NOT NULL, video_id TEXT, metric TEXT NOT NULL, value REAL)`,
  `CREATE TABLE IF NOT EXISTS analysis_export_targets (
     tenant_id TEXT NOT NULL, channel_id TEXT NOT NULL, metric_id TEXT NOT NULL,
     effective_from TEXT NOT NULL, target_value REAL NOT NULL, min_sample INTEGER)`,
];

export async function ensureExportBoundary(): Promise<void> {
  for (const sql of EXPORT_BOUNDARY_DDL) await env.DB.prepare(sql).run();
}

export async function seedExportRows(
  tenantId: string,
  channelId: string,
  rows: {
    source: string;
    period: string;
    video_id?: string | null;
    metric: string;
    value: number;
  }[],
): Promise<void> {
  await ensureExportBoundary();
  await env.DB.batch(
    rows.map((r) =>
      env.DB.prepare(
        `INSERT INTO analysis_export_rows (tenant_id, channel_id, source, period, video_id, metric, value)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      ).bind(tenantId, channelId, r.source, r.period, r.video_id ?? null, r.metric, r.value),
    ),
  );
}

/** 設定画面の連携手続きを通さず、チャンネル連携済みの状態を直接作る（連携自体は別 feature で検証済み） */
export async function connectChannel(owner: Owner, channelId = `UC_${crypto.randomUUID()}`) {
  await env.DB.prepare(
    `INSERT INTO channels (tenant_id, channel_id, title, connected_by, connected_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(owner.tenantId, channelId, "テストチャンネル", owner.userId, new Date().toISOString())
    .run();
  return channelId;
}

export async function issueToken(user: LoggedIn, name = "テストPC"): Promise<string> {
  const res = await call("/api/skill-tokens", {
    method: "POST",
    cookie: user.cookie,
    body: { name },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { token: string }).token;
}

/** Bearer 個人トークンで /api/skill/* を呼ぶ（セッション cookie・CSRF ヘッダは付けない） */
export function skill(
  path: string,
  token: string | null,
  opts: Omit<CallOptions, "cookie" | "csrf"> & { raw?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "x-skill-api-version": "1", ...opts.headers };
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.raw !== undefined) {
    headers["content-type"] = "application/json";
    return call(path, { ...opts, headers, csrf: false, body: undefined, rawBody: opts.raw });
  }
  return call(path, { ...opts, headers, csrf: false });
}

export interface SkillTenant {
  owner: Owner;
  token: string;
  channelId: string;
}

export async function skillTenant(prefix = "sar"): Promise<SkillTenant> {
  const owner = await newOwner(prefix);
  const channelId = await connectChannel(owner);
  const token = await issueToken(owner);
  return { owner, token, channelId };
}

export async function createRequest(
  user: LoggedIn,
  body: Record<string, unknown> = { period_start: "2026-08-01", period_end: "2026-08-28" },
): Promise<string> {
  const res = await call("/api/analysis-requests", { method: "POST", cookie: user.cookie, body });
  expect(res.status).toBe(201);
  return ((await res.json()) as { requestId: string }).requestId;
}

/**
 * 結果 JSON。正本 fixture（/yt-analyze の実出力の見本）を複製し、依頼・版・題名を差し替えて
 * 初回分析（history_review に参照した版なし）の形にする。overrides はトップレベルの項目を置き換える
 */
export function sampleReport(
  requestId: string,
  version: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...structuredClone(REPORT_FIXTURE),
    request_id: requestId,
    version,
    title: `週次分析 v${version}`,
    history_review: historyReview([]),
    ...overrides,
  };
}

/** 正本の results に項目を重ねる（全指標目標達成・判定保留などの判定違いを作る） */
export function sampleResults(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(REPORT_FIXTURE.results), ...overrides };
}

/**
 * 参照した版に合わせた history_review。前回仮説の再判定と前回との比較は、参照した版のうち
 * 最も新しい版に付ける。空なら初回分析の形
 */
export function historyReview(versionsUsed: number[]): Record<string, unknown> {
  if (versionsUsed.length === 0)
    return {
      first_analysis: true,
      versions_used: [],
      previous_hypotheses: [],
      action_effects: [],
      changes: null,
    };
  const latest = Math.max(...versionsUsed);
  const h = structuredClone(REPORT_FIXTURE.history_review);
  return {
    ...h,
    versions_used: versionsUsed,
    previous_hypotheses: h.previous_hypotheses.map((p) => ({ ...p, version: latest })),
    changes: { ...h.changes, compared_version: latest },
  };
}

/** コメントから推定した心理と感情（正本 fixture では空。保存・表示の確認で sampleReport に重ねる） */
export const COMMENT_INSIGHTS = {
  psych_findings: [
    {
      layer: "感情",
      claim: "視聴者は結論の速さを期待している",
      evidence: [{ comment_id: "c1", quote: "早く結論が知りたい" }],
      counter_hypothesis: "単に動画が長いだけ",
      confidence: 0.6,
    },
  ],
  comment_emotions: [{ comment_id: "c1", emotion: "期待", intent: "質問" }],
};

export function postReport(t: SkillTenant, report: Record<string, unknown>, key?: string) {
  const k = key ?? `${report.request_id}:v${report.version}`;
  return skill("/api/skill/reports", t.token, {
    method: "POST",
    body: report,
    headers: { "idempotency-key": k },
  });
}

/** 依頼を作り、結果を1版送って完了させる（履歴の用意） */
export async function completeOneVersion(t: SkillTenant, version: number, extra = {}) {
  const requestId = await createRequest(t.owner);
  const res = await postReport(t, sampleReport(requestId, version, extra));
  expect(res.status).toBe(201);
  return { requestId, ...((await res.json()) as { reportId: string; version: number }) };
}
