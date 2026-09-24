// Cloudflare GraphQL Analytics API から、アカウント全体の D1 容量・R2 容量・Workers リクエスト数を取る。
// トークン（Account Analytics Read）は Workers Secrets の CF_ANALYTICS_TOKEN。未設定なら null を返す
export const CF_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

export interface CfUsage {
  d1_storage_bytes: number;
  r2_storage_bytes: number;
  workers_requests: number;
}

const QUERY = `query Usage($account: string!, $date: Date!, $since: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      d1StorageAdaptiveGroups(limit: 100, filter: { date_geq: $date }) {
        max { databaseSizeBytes }
        dimensions { databaseId }
      }
      r2StorageAdaptiveGroups(limit: 100, filter: { datetime_geq: $since }) {
        max { payloadSize metadataSize }
        dimensions { bucketName }
      }
      workersInvocationsAdaptive(limit: 1000, filter: { date: $date }) {
        sum { requests }
      }
    }
  }
}`;

type Row = Record<string, Record<string, unknown> | undefined>;

function sumBy(rows: unknown, pick: (row: Row) => number): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((total: number, row) => total + (pick(row as Row) || 0), 0);
}

/** 同じ資源の複数行（日ごと）は最大値を資源ごとにとり、資源をまたいで合計する */
function maxPerDimension(rows: unknown, dim: string, value: (row: Row) => number): number {
  if (!Array.isArray(rows)) return 0;
  const best = new Map<string, number>();
  for (const raw of rows) {
    const row = raw as Row;
    const key = String(row.dimensions?.[dim] ?? "");
    best.set(key, Math.max(best.get(key) ?? 0, value(row) || 0));
  }
  return [...best.values()].reduce((a, b) => a + b, 0);
}

export async function fetchCfUsage(input: {
  accountId?: string;
  token?: string;
  now: Date;
}): Promise<CfUsage | null> {
  if (!input.accountId || !input.token) return null;
  const date = input.now.toISOString().slice(0, 10);
  const since = new Date(input.now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetch(CF_GRAPHQL_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { account: input.accountId, date, since } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { viewer?: { accounts?: Record<string, unknown>[] } };
      errors?: unknown[];
    };
    const account = body.data?.viewer?.accounts?.[0];
    if (!account || (Array.isArray(body.errors) && body.errors.length > 0)) return null;
    return {
      d1_storage_bytes: maxPerDimension(account.d1StorageAdaptiveGroups, "databaseId", (r) =>
        Number(r.max?.databaseSizeBytes),
      ),
      r2_storage_bytes: maxPerDimension(
        account.r2StorageAdaptiveGroups,
        "bucketName",
        (r) => Number(r.max?.payloadSize) + Number(r.max?.metadataSize ?? 0),
      ),
      workers_requests: sumBy(account.workersInvocationsAdaptive, (r) => Number(r.sum?.requests)),
    };
  } catch {
    return null;
  }
}
