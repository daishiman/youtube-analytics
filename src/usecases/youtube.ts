// YouTube チャンネル紐付け（1テナント1チャンネル）・再連携・連携解除・字幕の自動取得（qa-075/qa-076/qa-081/qa-082）
// 連携の手続きは oauth_pending に「開始した本人・テナント」と結びつけて保存し、コールバックでは Cookie ではなく
// セッションの本人と照合する（別人のブラウザへコールバックを注入されても受け付けない）
import {
  buildYoutubeAuthUrl,
  type ChannelCandidate,
  exchangeYoutubeCode,
  listMyChannels,
  READONLY_SCOPES,
  revokeGoogleToken,
  SCOPE_FORCE_SSL,
} from "../adapters/google-youtube";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { decryptText, encryptText, newId, pkceChallenge, randomToken } from "../lib/crypto";
import { AppError } from "../lib/errors";
import {
  ChannelDeletionPendingError,
  ChannelTakenError,
  type PendingPurpose,
  type SettingsRepository,
} from "../repositories/settings-repository";
import { addMs, type Deps, iso } from "./common";
import { revokeStored, tenantOAuthClient } from "./google-client";
import {
  audit,
  captionsAvailability,
  DELETION_GRACE_MS,
  rateLimit,
  settingsRepo,
  usageRepo,
} from "./settings-common";

export const OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;
const OAUTH_START_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;

export function youtubeRedirectUri(origin: string): string {
  return `${origin}/api/oauth/callback`;
}

interface PendingToken {
  refreshToken: string | null;
  scopes: string[];
}

async function requireChannelDeletionComplete(repo: SettingsRepository): Promise<void> {
  if (await repo.getPendingChannelDeletion()) throw new AppError("CHANNEL_DELETION_PENDING");
}

async function startOAuth(
  deps: Deps,
  ctx: TenantContext,
  purpose: PendingPurpose,
  scopes: string[],
  origin: string,
): Promise<{ url: string }> {
  if (purpose !== "captions") await requireChannelDeletionComplete(settingsRepo(deps, ctx));
  // テナントのクライアント未登録なら、Google へ飛ばす前に止める（qa-087）
  const client = await tenantOAuthClient(deps, ctx);
  await rateLimit(deps, `oauth:${ctx.userId}`, OAUTH_START_LIMIT, HOUR_MS);
  const state = randomToken();
  const verifier = randomToken(48);
  await settingsRepo(deps, ctx).createPending({
    state,
    userId: ctx.userId,
    purpose,
    verifierEnc: await encryptText(deps.env.TOKEN_ENC_KEY, verifier),
    now: iso(deps.now),
    expiresAt: iso(addMs(deps.now, OAUTH_PENDING_TTL_MS)),
  });
  const url = buildYoutubeAuthUrl({
    clientId: client.clientId,
    redirectUri: youtubeRedirectUri(origin),
    state,
    codeChallenge: await pkceChallenge(verifier),
    scopes,
    incremental: purpose === "captions",
  });
  return { url };
}

/** POST /api/youtube/connect: 未連携のテナントだけが連携を始められる */
export async function startConnect(deps: Deps, ctx: TenantContext, origin: string) {
  requirePermission(ctx, "settings.manage");
  if (await settingsRepo(deps, ctx).getChannel()) throw new AppError("CHANNEL_ALREADY_CONNECTED");
  return startOAuth(deps, ctx, "connect", READONLY_SCOPES, origin);
}

/** POST /api/youtube/reconnect: 連携中と同じチャンネルでだけ認可を取り直す */
export async function startReconnect(deps: Deps, ctx: TenantContext, origin: string) {
  requirePermission(ctx, "settings.manage");
  const repo = settingsRepo(deps, ctx);
  await requireChannelDeletionComplete(repo);
  if (!(await repo.getChannel())) throw new AppError("CHANNEL_NOT_CONNECTED");
  const tenant = await repo.getTenant();
  const scopes = tenant?.captions_auto ? [...READONLY_SCOPES, SCOPE_FORCE_SSL] : READONLY_SCOPES;
  return startOAuth(deps, ctx, "reconnect", scopes, origin);
}

/**
 * GET /api/oauth/callback。成功・失敗とも設定画面へ戻す URL（パス）を返す。
 * 失敗は ?error=<code>、チャンネル選択待ちは ?select=channel
 */
export async function handleOAuthCallback(
  deps: Deps,
  ctx: TenantContext | null,
  query: { code?: string; state?: string; error?: string },
  origin: string,
): Promise<string> {
  try {
    if (!ctx || !query.state) throw new AppError("OAUTH_STATE_MISMATCH");
    requirePermission(ctx, "settings.manage");
    const repo = settingsRepo(deps, ctx);
    await requireChannelDeletionComplete(repo);
    const pending = await repo.getPendingByState(query.state);
    if (!pending || pending.user_id !== ctx.userId) throw new AppError("OAUTH_STATE_MISMATCH");
    if (pending.expires_at <= iso(deps.now)) {
      await repo.deletePending(pending.state);
      throw new AppError("OAUTH_PENDING_EXPIRED");
    }
    if (query.error || !query.code) {
      await repo.deletePending(pending.state);
      throw new AppError("SCOPE_NOT_GRANTED");
    }

    const client = await tenantOAuthClient(deps, ctx);
    const tokens = await exchangeYoutubeCode({
      code: query.code,
      codeVerifier: await decryptText(deps.env.TOKEN_ENC_KEY, pending.verifier_enc),
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUri: youtubeRedirectUri(origin),
    });
    const refreshTokenEnc = tokens.refreshToken
      ? await encryptText(deps.env.TOKEN_ENC_KEY, tokens.refreshToken)
      : null;

    if (pending.purpose === "captions") {
      await repo.deletePending(pending.state);
      if (!tokens.scopes.includes(SCOPE_FORCE_SSL)) throw new AppError("SCOPE_NOT_GRANTED");
      const channel = await repo.getChannel();
      if (!channel) throw new AppError("CHANNEL_NOT_CONNECTED");
      await repo.refreshConnection({
        channelId: channel.channel_id,
        refreshTokenEnc,
        scopes: tokens.scopes,
        captionsAuto: true,
        now: iso(deps.now),
      });
      await audit(deps, ctx, "captions.on");
      return "/settings?done=captions_on";
    }

    if (!READONLY_SCOPES.every((s) => tokens.scopes.includes(s))) {
      await repo.deletePending(pending.state);
      throw new AppError("SCOPE_NOT_GRANTED");
    }
    const candidates = await listMyChannels(tokens.accessToken);

    if (pending.purpose === "reconnect") {
      await repo.deletePending(pending.state);
      const channel = await repo.getChannel();
      if (!channel) throw new AppError("CHANNEL_NOT_CONNECTED");
      if (!candidates.some((c) => c.channelId === channel.channel_id)) {
        // 別チャンネルの許可は保存せず、Google 側の許可もすぐ外す
        if (tokens.refreshToken) await revokeGoogleToken(tokens.refreshToken);
        throw new AppError("CHANNEL_MISMATCH");
      }
      const tenant = await repo.getTenant();
      await repo.refreshConnection({
        channelId: channel.channel_id,
        refreshTokenEnc,
        scopes: tokens.scopes,
        captionsAuto: Boolean(tenant?.captions_auto) && tokens.scopes.includes(SCOPE_FORCE_SSL),
        now: iso(deps.now),
      });
      await audit(deps, ctx, "youtube.reconnect", channel.channel_id);
      return "/settings?done=reconnected";
    }

    if (candidates.length === 0) {
      await repo.deletePending(pending.state);
      throw new AppError("NO_CHANNEL");
    }
    const tokenJson: PendingToken = { refreshToken: tokens.refreshToken, scopes: tokens.scopes };
    await repo.savePendingResult(
      pending.state,
      await encryptText(deps.env.TOKEN_ENC_KEY, JSON.stringify(candidates)),
      await encryptText(deps.env.TOKEN_ENC_KEY, JSON.stringify(tokenJson)),
    );
    return "/settings?select=channel";
  } catch (err) {
    const code = err instanceof AppError ? err.code : "OAUTH_FAILED";
    if (!(err instanceof AppError)) console.error("oauth callback", err);
    return `/settings?error=${code}`;
  }
}

async function selectablePending(deps: Deps, ctx: TenantContext) {
  const repo = settingsRepo(deps, ctx);
  await requireChannelDeletionComplete(repo);
  const pending = await repo.getSelectablePending(ctx.userId, iso(deps.now));
  if (!pending?.candidates_enc || !pending.token_enc) throw new AppError("OAUTH_PENDING_EXPIRED");
  const candidates = JSON.parse(
    await decryptText(deps.env.TOKEN_ENC_KEY, pending.candidates_enc),
  ) as ChannelCandidate[];
  return { pending, candidates };
}

/** GET /api/youtube/channel-candidates: 別テナントで連携済みの候補には印を付ける（どのテナントかは出さない） */
export async function getChannelCandidates(deps: Deps, ctx: TenantContext) {
  requirePermission(ctx, "settings.manage");
  const { pending, candidates } = await selectablePending(deps, ctx);
  const linked = await usageRepo(deps).linkedChannelIds(
    candidates.map((c) => c.channelId),
    ctx.tenantId,
  );
  return {
    expiresAt: pending.expires_at,
    candidates: candidates.map((c) => ({ ...c, linkedElsewhere: linked.has(c.channelId) })),
  };
}

/** POST /api/youtube/channel: 候補から1チャンネルを確定する。別テナント連携済みは 409 */
export async function selectChannel(deps: Deps, ctx: TenantContext, channelId: unknown) {
  requirePermission(ctx, "settings.manage");
  if (typeof channelId !== "string" || !channelId) {
    throw new AppError("VALIDATION_FAILED", "連携するチャンネルを選んでください");
  }
  const repo = settingsRepo(deps, ctx);
  const { pending, candidates } = await selectablePending(deps, ctx);
  const candidate = candidates.find((c) => c.channelId === channelId);
  if (!candidate) throw new AppError("VALIDATION_FAILED", "候補の中からチャンネルを選んでください");
  if (await repo.getChannel()) throw new AppError("CHANNEL_ALREADY_CONNECTED");

  const token = JSON.parse(
    await decryptText(deps.env.TOKEN_ENC_KEY, pending.token_enc ?? ""),
  ) as PendingToken;
  try {
    await repo.insertChannel({
      channel: candidate,
      userId: ctx.userId,
      refreshTokenEnc: token.refreshToken
        ? await encryptText(deps.env.TOKEN_ENC_KEY, token.refreshToken)
        : null,
      scopes: token.scopes,
      now: iso(deps.now),
    });
  } catch (err) {
    // 候補は残すので、同じ手続きのまま別のチャンネルを選び直せる
    if (err instanceof ChannelTakenError) throw new AppError("CHANNEL_ALREADY_LINKED");
    if (err instanceof ChannelDeletionPendingError) throw new AppError("CHANNEL_DELETION_PENDING");
    throw err;
  }
  await repo.deletePending(pending.state);
  await audit(deps, ctx, "youtube.connect", candidate.channelId);
  return { channelId: candidate.channelId, title: candidate.title };
}

/**
 * DELETE /api/youtube/connection: Google の許可を失効し、チャンネル行を消して旧データの削除を予約する（7日以内）。
 * 別チャンネルへの変更は、この解除のあとに改めて連携する
 */
export async function disconnectChannel(deps: Deps, ctx: TenantContext, confirmName: unknown) {
  requirePermission(ctx, "settings.manage");
  const repo = settingsRepo(deps, ctx);
  const [tenant, channel] = await Promise.all([repo.getTenant(), repo.getChannel()]);
  if (!channel) throw new AppError("CHANNEL_NOT_CONNECTED");
  if (typeof confirmName !== "string" || confirmName.trim() !== tenant?.name) {
    throw new AppError("CONFIRM_MISMATCH");
  }
  await revokeStored(deps, ctx);
  const dueAt = iso(addMs(deps.now, DELETION_GRACE_MS));
  await repo.disconnect({
    channelId: channel.channel_id,
    deletionId: newId(),
    userId: ctx.userId,
    now: iso(deps.now),
    dueAt,
  });
  await audit(deps, ctx, "youtube.disconnect", channel.channel_id);
  // 削除予約はすでに永続化済み。Queue 障害でも Cron が回収できるため解除の応答は成功させる。
  try {
    await deps.env.CLEANUP_QUEUE.send({ kind: "cleanup" });
  } catch (cause) {
    console.error("channel cleanup enqueue failed", cause);
  }
  return { deletionDueAt: dueAt };
}

/**
 * PUT /api/youtube/captions-auto。
 * ON: force-ssl を追加の同意（include_granted_scopes）で取りに行く URL を返す。すでに付与済みならその場で ON。
 * OFF: 許可を失効し、読み取り専用で連携し直す URL を返す（その間は要再連携）
 */
export async function setCaptionsAuto(
  deps: Deps,
  ctx: TenantContext,
  enabled: unknown,
  origin: string,
): Promise<{ captionsAuto: boolean; url: string | null }> {
  requirePermission(ctx, "settings.manage");
  if (typeof enabled !== "boolean") {
    throw new AppError("VALIDATION_FAILED", "enabled に true か false を指定してください");
  }
  if (captionsAvailability(deps.env, ctx) !== "available") throw new AppError("FEATURE_NOT_READY");
  const repo = settingsRepo(deps, ctx);
  const [tenant, channel, scopes] = await Promise.all([
    repo.getTenant(),
    repo.getChannel(),
    repo.getGrantedScopes(),
  ]);
  if (!channel) throw new AppError("CHANNEL_NOT_CONNECTED");
  const current = Boolean(tenant?.captions_auto);

  if (enabled) {
    if (current) return { captionsAuto: true, url: null };
    if (scopes.includes(SCOPE_FORCE_SSL)) {
      await repo.refreshConnection({
        channelId: channel.channel_id,
        refreshTokenEnc: null,
        scopes,
        captionsAuto: true,
        now: iso(deps.now),
      });
      await audit(deps, ctx, "captions.on");
      return { captionsAuto: true, url: null };
    }
    const { url } = await startOAuth(deps, ctx, "captions", [SCOPE_FORCE_SSL], origin);
    return { captionsAuto: false, url };
  }

  if (!current && !scopes.includes(SCOPE_FORCE_SSL)) return { captionsAuto: false, url: null };
  await revokeStored(deps, ctx);
  await repo.dropTokenForReconnect();
  await audit(deps, ctx, "captions.off");
  const { url } = await startOAuth(deps, ctx, "reconnect", READONLY_SCOPES, origin);
  return { captionsAuto: false, url };
}
