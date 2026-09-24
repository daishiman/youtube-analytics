// テナントごとの Google Cloud OAuth クライアント（qa-075）。YouTube 連携の OAuth はこのクライアントで行い、
// Google ログインはアプリ共通のクライアント（env.GOOGLE_CLIENT_ID/SECRET）のまま。
// シークレットは TOKEN_ENC_KEY で暗号化して保存し、API・画面・監査ログには出さない
import { revokeGoogleToken } from "../adapters/google-youtube";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { decryptText, encryptText } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { type Deps, iso } from "./common";
import { audit, settingsRepo } from "./settings-common";

/** Google Cloud Console が発行する「ウェブアプリケーション」クライアント ID の形 */
const CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
const SECRET_MIN = 10;
const SECRET_MAX = 200;

export interface GoogleClientSummary {
  configured: boolean;
  clientId: string | null;
  updatedAt: string | null;
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export async function googleClientSummary(
  deps: Deps,
  ctx: Pick<TenantContext, "tenantId">,
): Promise<GoogleClientSummary> {
  const row = await settingsRepo(deps, ctx).getGoogleClient();
  return {
    configured: Boolean(row),
    clientId: row?.client_id ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

/** 連携の OAuth に使うクライアント。未登録なら連携を始められない */
export async function tenantOAuthClient(
  deps: Deps,
  ctx: Pick<TenantContext, "tenantId">,
): Promise<OAuthClient> {
  const row = await settingsRepo(deps, ctx).getGoogleClient();
  if (!row) throw new AppError("GOOGLE_CLIENT_NOT_CONFIGURED");
  return {
    clientId: row.client_id,
    clientSecret: await decryptText(deps.env.TOKEN_ENC_KEY, row.client_secret_enc),
  };
}

function parseInput(input: unknown): OAuthClient {
  const body = (input ?? {}) as { clientId?: unknown; clientSecret?: unknown };
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new AppError(
      "VALIDATION_FAILED",
      "クライアントIDは「数字-英数字.apps.googleusercontent.com」の形で入力してください",
    );
  }
  if (
    clientSecret.length < SECRET_MIN ||
    clientSecret.length > SECRET_MAX ||
    /\s/.test(clientSecret)
  ) {
    throw new AppError(
      "VALIDATION_FAILED",
      "クライアントシークレットは Google Cloud Console に表示された値をそのまま貼り付けてください",
    );
  }
  return { clientId, clientSecret };
}

/** 保存済みの refresh token を Google で失効する（失敗しても続行し、保存側は必ず消す）。revoke はクライアント情報が要らない */
export async function revokeStored(deps: Deps, ctx: Pick<TenantContext, "tenantId">) {
  const enc = await settingsRepo(deps, ctx).getRefreshTokenEnc();
  if (!enc) return;
  try {
    await revokeGoogleToken(await decryptText(deps.env.TOKEN_ENC_KEY, enc));
  } catch (err) {
    console.error("revoke", err);
  }
}

/**
 * PUT /api/youtube/google-client: 登録・更新（オーナーのみ）。
 * クライアント ID が変わるときは、連携中チャンネルを要再連携にする（シークレットだけの変更はそのまま使える）
 */
export async function saveGoogleClient(
  deps: Deps,
  ctx: TenantContext,
  input: unknown,
): Promise<GoogleClientSummary> {
  requirePermission(ctx, "settings.manage");
  const next = parseInput(input);
  const repo = settingsRepo(deps, ctx);
  const current = await repo.getGoogleClient();
  const invalidate = Boolean(current) && current?.client_id !== next.clientId;
  // 旧クライアントで得たトークンは新しいクライアントでは更新できないので、Google 側でも無効にしておく
  if (invalidate) await revokeStored(deps, ctx);
  await repo.saveGoogleClient({
    clientId: next.clientId,
    clientSecretEnc: await encryptText(deps.env.TOKEN_ENC_KEY, next.clientSecret),
    userId: ctx.userId,
    now: iso(deps.now),
    invalidate,
  });
  // シークレットは監査ログにも残さない（クライアント ID は公開情報）
  await audit(deps, ctx, "google_client.set", next.clientId);
  return googleClientSummary(deps, ctx);
}

/** DELETE /api/youtube/google-client: 削除（オーナーのみ）。連携中チャンネルは要再連携になる */
export async function deleteGoogleClient(
  deps: Deps,
  ctx: TenantContext,
): Promise<GoogleClientSummary> {
  requirePermission(ctx, "settings.manage");
  const repo = settingsRepo(deps, ctx);
  if (!(await repo.getGoogleClient())) throw new AppError("NOT_FOUND");
  await revokeStored(deps, ctx);
  await repo.deleteGoogleClient();
  await audit(deps, ctx, "google_client.delete");
  return googleClientSummary(deps, ctx);
}
