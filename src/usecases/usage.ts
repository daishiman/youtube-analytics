// 無料枠の使用状況。Cloudflare の値はアカウント全体、YouTube の割当は各 Google Cloud プロジェクトごと
import { fetchCfUsage } from "../adapters/cf-analytics";
import { type Deps, iso, maxTenants } from "./common";
import { CAPTION_DAILY_LIMIT, usageRepo } from "./settings-common";

export const USAGE_WARN = 0.7;
export const USAGE_DANGER = 0.9;
export const SNAPSHOT_TTL_MS = 60 * 60 * 1000;

const GB = 1024 * 1024 * 1024;

export type UsageLevel = "ok" | "warn" | "danger" | "unknown";

export interface UsageItem {
  key: string;
  label: string;
  used: number | null;
  limit: number;
  unit: string;
  level: UsageLevel;
}

export function usageLevel(used: number | null, limit: number): UsageLevel {
  if (used === null || limit <= 0) return "unknown";
  const ratio = used / limit;
  if (ratio >= USAGE_DANGER) return "danger";
  if (ratio >= USAGE_WARN) return "warn";
  return "ok";
}

/** Cloudflare の値は1時間キャッシュ。取得に失敗したら古い値のまま表示する */
async function cfSnapshots(deps: Deps): Promise<Record<string, number>> {
  const repo = usageRepo(deps);
  const rows = await repo.snapshots();
  const fresh =
    rows.length === 3 &&
    rows.every((r) => deps.now.getTime() - Date.parse(r.fetched_at) < SNAPSHOT_TTL_MS);
  if (!fresh) {
    const fetched = await fetchCfUsage({
      accountId: deps.env.CF_ACCOUNT_ID,
      token: deps.env.CF_ANALYTICS_TOKEN,
      now: deps.now,
    });
    if (fetched) {
      await repo.saveSnapshots({ ...fetched }, iso(deps.now));
      return { ...fetched };
    }
  }
  return Object.fromEntries(rows.map((r) => [r.kind, r.value]));
}

export async function getUsage(deps: Deps): Promise<UsageItem[]> {
  const item = (key: string, label: string, used: number | null, limit: number, unit: string) => ({
    key,
    label,
    used,
    limit,
    unit,
    level: usageLevel(used, limit),
  });
  const orNull = (v: number | undefined) => (typeof v === "number" ? v : null);
  const report = (cf: Record<string, number>, tenants: number | null): UsageItem[] => [
    // qa-075 で OAuth クライアントがテナントごとになった。全体カウンタを
    // 1プロジェクトの 10,000 units/日で割ると誤警告になるため使用率は不明にする。
    item("youtube_units", "YouTube API（プロジェクトごと・本日）", null, 10_000, "units"),
    // D1 書込行数には索引更新も含まれる。アプリ側に計測処理がない間は 0 と推定しない。
    item("d1_writes", "D1 書込（本日）", null, 100_000, "行"),
    item("d1_storage", "D1 容量", orNull(cf.d1_storage_bytes), 5 * GB, "bytes"),
    item("r2_storage", "R2 画像", orNull(cf.r2_storage_bytes), 10 * GB, "bytes"),
    item(
      "workers_requests",
      "Workers リクエスト（本日）",
      orNull(cf.workers_requests),
      100_000,
      "回",
    ),
    // 5本の上限はテナントごと。集計処理のない全体カウンタをこの上限と比較しない。
    item("captions", "字幕取得（本日・ワークスペースごと）", null, CAPTION_DAILY_LIMIT, "本"),
    item("tenants", "ワークスペース数", tenants, maxTenants(deps.env), "件"),
  ];
  try {
    const [cf, tenants] = await Promise.all([cfSnapshots(deps), usageRepo(deps).tenantCount()]);
    return report(cf, tenants);
  } catch {
    // 使用量の取得に失敗しても、連携や取込など設定の主要操作は表示する。
    console.warn("usage metrics unavailable");
    return report({}, null);
  }
}
