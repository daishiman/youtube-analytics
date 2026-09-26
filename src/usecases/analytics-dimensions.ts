import {
  ANALYTICS_DIMENSION_KEYS,
  queryChannelDimensions,
} from "../adapters/google-analytics-dimensions";
import { GoogleCollectionError } from "../adapters/google-youtube";
import type { AnalyticsDimensionsMessage, Bindings, LinkGeneration } from "../env";
import { AnalyticsRawRepository } from "../repositories/analytics-raw-repository";
import { getLinkAccessToken } from "./google-client";
import { collectionDateRange } from "./youtube-collector";

export function dimensionMessages(connection: LinkGeneration): AnalyticsDimensionsMessage[] {
  return ANALYTICS_DIMENSION_KEYS.map((reportKey) => ({
    kind: "analytics-dimensions",
    tenantId: connection.tenantId,
    channelId: connection.channelId,
    connectedAt: connection.connectedAt,
    tokenUpdatedAt: connection.tokenUpdatedAt,
    ...(connection.cycleStartedAt ? { cycleStartedAt: connection.cycleStartedAt } : {}),
    reportKey,
  }));
}

export async function collectChannelDimensions(
  env: Bindings,
  message: AnalyticsDimensionsMessage,
  now = new Date(),
): Promise<"collected" | "stale"> {
  if (!ANALYTICS_DIMENSION_KEYS.includes(message.reportKey)) {
    throw new GoogleCollectionError(false, "Unknown Analytics dimension report");
  }
  const repository = new AnalyticsRawRepository(env.DB);
  if (!(await repository.isCurrent(message))) return "stale";
  const accessToken = await getLinkAccessToken({ env, now }, { tenantId: message.tenantId });
  if (!accessToken) return "stale";
  const dates = collectionDateRange(now);
  const report = await queryChannelDimensions({
    accessToken,
    channelId: message.channelId,
    reportKey: message.reportKey,
    ...dates,
  });
  if (!(await repository.isCurrent(message))) return "stale";
  await repository.replaceReport(message, dates, report, now.toISOString());
  return "collected";
}
