// 設定画面の一括取得と、テナントのデータ削除の受付
import { can, requirePermission, type TenantContext } from "../domain/tenant-context";
import { newId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { addMs, type Deps, iso } from "./common";
import { googleClientSummary } from "./google-client";
import { IMPORT_HISTORY_LIMIT } from "./imports";
import {
  audit,
  CAPTION_DAILY_LIMIT,
  captionsAvailability,
  DELETION_GRACE_MS,
  NEXT_COLLECTION_TEXT,
  settingsRepo,
} from "./settings-common";
import { TOKEN_LIMIT } from "./skill-tokens";
import { getUsage } from "./usage";

/** 画面に出すスコープ名（URL ではなく短い名前） */
function shortScope(scope: string): string {
  return scope.replace("https://www.googleapis.com/auth/", "");
}

export async function getSettings(deps: Deps, ctx: TenantContext) {
  requirePermission(ctx, "tenant.read");
  const repo = settingsRepo(deps, ctx);
  const [
    tenant,
    channel,
    scopes,
    imports,
    lastCsvImportAt,
    tokens,
    deletion,
    channelDeletion,
    usage,
    googleClient,
  ] = await Promise.all([
    repo.getTenant(),
    repo.getChannel(),
    repo.getGrantedScopes(),
    repo.listImports(IMPORT_HISTORY_LIMIT),
    repo.lastCsvImportAt(),
    repo.listSkillTokens(ctx.userId),
    repo.getPendingDeletion(),
    repo.getPendingChannelDeletion(),
    getUsage(deps),
    googleClientSummary(deps, ctx),
  ]);
  if (!tenant) throw new AppError("NOT_FOUND");
  return {
    tenant: { tenantId: ctx.tenantId, name: tenant.name },
    role: ctx.role,
    permissions: {
      manageSettings: can(ctx.role, "settings.manage"),
      writeContent: can(ctx.role, "content.write"),
      manageMembers: can(ctx.role, "members.manage"),
    },
    youtube: {
      status: channel ? channel.status : "未連携",
      channel: channel
        ? {
            channelId: channel.channel_id,
            title: channel.title,
            thumbnailUrl: channel.thumbnail_url,
            subscriberCount: channel.subscriber_count,
            connectedAt: channel.connected_at,
          }
        : null,
      nextCollection: channel ? NEXT_COLLECTION_TEXT : null,
      lastCollectedAt: channel?.last_collected_at ?? null,
      lastCsvImportAt,
      pendingDeletionDueAt: channelDeletion?.due_at ?? null,
      scopes: scopes.map(shortScope),
      captions: {
        enabled: Boolean(tenant.captions_auto),
        availability: captionsAvailability(deps.env, ctx),
        dailyLimit: CAPTION_DAILY_LIMIT,
      },
      // テナントの Google Cloud OAuth クライアント（qa-087）。シークレットは返さない
      googleClient,
    },
    imports,
    tokens,
    tokenLimit: TOKEN_LIMIT,
    usage,
    deletion: deletion ? { dueAt: deletion.due_at } : null,
  };
}

/** テナントのデータ削除を受け付ける（7日以内に retention-ops が実行）。テナント名の入力で確認する */
export async function requestTenantDeletion(deps: Deps, ctx: TenantContext, confirmName: unknown) {
  requirePermission(ctx, "settings.manage");
  const repo = settingsRepo(deps, ctx);
  const tenant = await repo.getTenant();
  if (!tenant) throw new AppError("NOT_FOUND");
  if (typeof confirmName !== "string" || confirmName.trim() !== tenant.name) {
    throw new AppError("CONFIRM_MISMATCH");
  }
  const existing = await repo.getPendingDeletion();
  if (existing) return { dueAt: existing.due_at };
  const dueAt = iso(addMs(deps.now, DELETION_GRACE_MS));
  await repo.requestTenantDeletion({
    deletionId: newId(),
    userId: ctx.userId,
    now: iso(deps.now),
    dueAt,
  });
  await audit(deps, ctx, "tenant.delete");
  return { dueAt };
}
