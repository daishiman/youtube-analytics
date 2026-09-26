import { GoogleCollectionError, GoogleRefreshTokenRevokedError } from "./adapters/google-youtube";
import type {
  AnalyticsDimensionsMessage,
  Bindings,
  CaptionMessage,
  CleanupMessage,
  CollectMessage,
  ReportingMessage,
  ThumbnailMessage,
} from "./env";
import { app } from "./http/app";
import { sendInBatches } from "./lib/queue";
import { YoutubeCollectorRepository } from "./repositories/youtube-collector-repository";
import { collectChannelDimensions, dimensionMessages } from "./usecases/analytics-dimensions";
import { collectCaptionForVideo, purgeExpiredCaptions } from "./usecases/captions-collector";
import { processPendingChannelDeletions } from "./usecases/channel-cleanup";
import { purgeReportingRetention } from "./usecases/reporting-retention";
import { syncTenantReporting } from "./usecases/reporting-sync";
import { purgeExpiredApiMetadata } from "./usecases/retention";
import { reserveRevokedChannelDeletion } from "./usecases/revoked-channel";
import { processPendingTenantDeletions } from "./usecases/tenant-cleanup";
import { processThumbnailMessage, purgeExpiredThumbnails } from "./usecases/thumbnails";
import { collectTenantDaily, enqueueDailyCollections } from "./usecases/youtube-collector";

type QueueMessage =
  | CleanupMessage
  | CollectMessage
  | ReportingMessage
  | AnalyticsDimensionsMessage
  | CaptionMessage
  | ThumbnailMessage;

async function enqueueAdditionalCollections(
  env: Bindings,
  cycleStartedAt: string,
  connections: CollectMessage[],
): Promise<void> {
  const messages = connections.flatMap(
    (message): (ReportingMessage | AnalyticsDimensionsMessage)[] => [
      {
        kind: "reporting",
        tenantId: message.tenantId,
        channelId: message.channelId,
        connectedAt: message.connectedAt,
        tokenUpdatedAt: message.tokenUpdatedAt,
        cycleStartedAt,
      },
      ...dimensionMessages({ ...message, cycleStartedAt }),
    ],
  );
  await sendInBatches(env.COLLECT_QUEUE, messages);
}

type CleanupKind = CleanupMessage["kind"];
/** 1回分を処理し、上限で残りがあれば true。残りは同じ kind を60秒後に再送する */
type CleanupRun = (env: Bindings, now: Date) => Promise<boolean>;

const CLEANUP_RUNS: Record<CleanupKind, CleanupRun> = {
  async cleanup(env, now) {
    const result = await processPendingChannelDeletions(env, now);
    if (result.overdue > 0) console.warn("channel cleanup overdue", { count: result.overdue });
    return result.remaining;
  },
  async retention(env, now) {
    const results = [
      await purgeExpiredApiMetadata(env.DB, now),
      await purgeReportingRetention(env, now),
      await purgeExpiredCaptions(env, now),
    ];
    return results.some((result) => result.remaining);
  },
  async "tenant-cleanup"(env, now) {
    const result = await processPendingTenantDeletions(env, now);
    if (result.overdue > 0) console.warn("tenant cleanup overdue", { count: result.overdue });
    return result.remaining;
  },
  async "thumbnail-retention"(env, now) {
    return (await purgeExpiredThumbnails(env, now)).remaining;
  },
};

async function runCleanup(env: Bindings, kind: CleanupKind, now: Date): Promise<void> {
  if (await CLEANUP_RUNS[kind](env, now)) {
    await env.CLEANUP_QUEUE.send({ kind }, { delaySeconds: 60 });
  }
}

/** Cron が毎日 Queue へ送る削除系。thumbnail-retention は Cron 内で直接1回動かす */
const CRON_CLEANUP_KINDS = ["cleanup", "retention", "tenant-cleanup"] as const;

function isCleanupKind(kind: unknown): kind is CleanupKind {
  return typeof kind === "string" && Object.hasOwn(CLEANUP_RUNS, kind);
}

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueMessage>, env: Bindings) {
    if (batch.queue === "collect-queue") {
      for (const message of batch.messages) {
        if (
          message.body?.kind !== "collect" &&
          message.body?.kind !== "reporting" &&
          message.body?.kind !== "analytics-dimensions" &&
          message.body?.kind !== "captions"
        ) {
          throw new Error("Unexpected collect message");
        }
        const repository = new YoutubeCollectorRepository(env.DB);
        try {
          if (message.body.kind === "collect") {
            await collectTenantDaily(env, message.body, new Date());
          } else if (message.body.kind === "reporting") {
            const result = await syncTenantReporting(env, message.body, new Date());
            if (result.authorizationRevoked) {
              await reserveRevokedChannelDeletion(env, message.body, new Date());
            } else if (result.status === "permission_required") {
              await repository.markFailed(message.body, new Date().toISOString());
            } else if (result.status === "synced" && !result.nextMessage) {
              await repository.clearFailure(message.body, new Date().toISOString());
            }
            if (result.nextMessage) await env.COLLECT_QUEUE.send(result.nextMessage);
          } else if (message.body.kind === "captions") {
            await collectCaptionForVideo(env, message.body, new Date());
          } else {
            const result = await collectChannelDimensions(env, message.body, new Date());
            if (result === "collected")
              await repository.clearFailure(message.body, new Date().toISOString());
          }
          message.ack();
        } catch (error) {
          if (error instanceof GoogleRefreshTokenRevokedError) {
            await reserveRevokedChannelDeletion(env, message.body, new Date());
            message.ack();
            continue;
          }
          if (
            (error instanceof GoogleCollectionError && !error.retryable) ||
            message.attempts > 3
          ) {
            // 無効な許可・クエリ、または3回の再試行後の失敗を現行連携に記録する。
            // トークンやレスポンスはログに残さない。
            console.warn("collection failed", {
              tenantId: message.body.tenantId,
              kind: message.body.kind,
            });
            if (message.body.kind !== "captions")
              await repository.markFailed(message.body, new Date().toISOString());
            message.ack();
          } else {
            // 429 / 5xx や一時的な D1 障害は遅らせて再試行。Queue の retry 上限も設定する。
            console.warn("collection retry", { tenantId: message.body.tenantId });
            message.retry({ delaySeconds: 600 });
          }
        }
      }
      return;
    }
    if (batch.queue === "thumbnail-queue") {
      for (const message of batch.messages) {
        if (message.body?.kind !== "thumbnail") throw new Error("Unexpected thumbnail message");
        await processThumbnailMessage(env, message.body, new Date());
      }
      return;
    }
    if (batch.queue !== "channel-cleanup-queue") throw new Error("Unexpected queue");
    for (const message of batch.messages) {
      const kind = message.body?.kind;
      if (!isCleanupKind(kind)) throw new Error("Unexpected cleanup message");
      await runCleanup(env, kind, new Date());
    }
  },
  async scheduled(_event: ScheduledController, env: Bindings) {
    const cycleStartedAt = new Date().toISOString();
    for (const kind of CRON_CLEANUP_KINDS) await env.CLEANUP_QUEUE.send({ kind });
    const connections = await new YoutubeCollectorRepository(env.DB).listActiveConnections();
    await enqueueDailyCollections(env, cycleStartedAt, connections);
    await enqueueAdditionalCollections(env, cycleStartedAt, connections);
    // Cron 役割①: 30日超の画像を消し、実行上限の残りは既存Queueへ渡す。
    await runCleanup(env, "thumbnail-retention", new Date());
  },
} satisfies ExportedHandler<Bindings, QueueMessage>;

export { app };
