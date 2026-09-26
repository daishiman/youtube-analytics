import {
  listAvailableReportingTypes,
  ReportingPermissionError,
  type ReportingType,
} from "../adapters/google-reporting-jobs";
import { GoogleCollectionError, refreshYoutubeAccessToken } from "../adapters/google-youtube";
import { SCOPE_ANALYTICS_READONLY } from "../domain/google-scopes";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { decryptText } from "../lib/crypto";
import { AppError } from "../lib/errors";
import type { Deps } from "./common";
import { tenantOAuthClient } from "./google-client";
import { settingsRepo } from "./settings-common";

export interface ReportTypesResponse {
  status: "not_linked" | "permission_required" | "available";
  channelId: string | null;
  reportTypes: ReportingType[];
}

const response = (
  status: ReportTypesResponse["status"],
  channelId: string | null,
  reportTypes: ReportingType[] = [],
): ReportTypesResponse => ({ status, channelId, reportTypes });

interface CurrentConnection {
  channelId: string;
  tokenEnc: string;
  tokenUpdatedAt: string;
}

/** 読み取り専用のスナップショット。トークンは選択中テナント・チャンネルに一致する行だけ読む。 */
async function currentConnection(
  deps: Deps,
  ctx: TenantContext,
): Promise<CurrentConnection | null> {
  const repo = settingsRepo(deps, ctx);
  const channel = await repo.getChannel();
  if (
    channel?.status !== "正常" ||
    (await repo.getPendingChannelDeletion()) ||
    (await repo.getPendingDeletion())
  )
    return null;
  const token = await deps.env.DB.prepare(
    `SELECT channel_id, refresh_token_enc, granted_scopes, updated_at
       FROM channel_oauth_tokens WHERE tenant_id = ?1 AND channel_id = ?2`,
  )
    .bind(ctx.tenantId, channel.channel_id)
    .first<{
      channel_id: string;
      refresh_token_enc: string | null;
      granted_scopes: string;
      updated_at: string;
    }>();
  if (
    !token?.refresh_token_enc ||
    !token.granted_scopes.split(" ").includes(SCOPE_ANALYTICS_READONLY)
  ) {
    return null;
  }
  return {
    channelId: channel.channel_id,
    tokenEnc: token.refresh_token_enc,
    tokenUpdatedAt: token.updated_at,
  };
}

/**
 * 画面向けの種類一覧。同じ id は後のページを採り、id 順に並べる。
 * 401/403 以外の一覧取得の失敗は、トークン更新の失敗と区別して OAUTH_FAILED（再試行可能）にする
 */
async function listReportTypesForScreen(accessToken: string): Promise<ReportingType[]> {
  let types: ReportingType[];
  try {
    types = await listAvailableReportingTypes(accessToken);
  } catch (err) {
    if (err instanceof GoogleCollectionError) throw new AppError("OAUTH_FAILED");
    throw err;
  }
  const byId = new Map(types.map((type) => [type.id, type]));
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** 種類の発見のみ。Reporting の job 作成や report の収集済み判定は行わない。 */
export async function getReportTypes(deps: Deps, ctx: TenantContext): Promise<ReportTypesResponse> {
  requirePermission(ctx, "tenant.read");
  const repo = settingsRepo(deps, ctx);
  const channel = await repo.getChannel();
  if (!channel || (await repo.getPendingChannelDeletion()) || (await repo.getPendingDeletion()))
    return response("not_linked", null);
  if (channel.status !== "正常") return response("permission_required", channel.channel_id);
  const current = await currentConnection(deps, ctx);
  if (!current) return response("permission_required", channel.channel_id);
  try {
    const client = await tenantOAuthClient(deps, ctx);
    const refreshToken = await decryptText(deps.env.TOKEN_ENC_KEY, current.tokenEnc);
    const accessToken = await refreshYoutubeAccessToken({ ...client, refreshToken });
    const reportTypes = await listReportTypesForScreen(accessToken);
    // 解除・再連携中に取得した旧データを画面へ返さない。
    const after = await currentConnection(deps, ctx);
    if (
      !after ||
      after.channelId !== current.channelId ||
      after.tokenUpdatedAt !== current.tokenUpdatedAt
    ) {
      return response("not_linked", null);
    }
    return response("available", current.channelId, reportTypes);
  } catch (err) {
    if (err instanceof ReportingPermissionError)
      return response("permission_required", current.channelId);
    if (err instanceof GoogleCollectionError && !err.retryable) {
      return response("permission_required", current.channelId);
    }
    if (err instanceof AppError && err.code === "GOOGLE_CLIENT_NOT_CONFIGURED") {
      return response("permission_required", current.channelId);
    }
    throw new AppError("OAUTH_FAILED");
  }
}
