// スキル（/yt-analyze）の入出力: 分析用データの書き出しと、文字起こし・画像索引の受け取り。
// 依頼の状態は analysis-requests、レポート版の追記は analysis-reports が持つ
import { countChars, SKILL_API_VERSION } from "../domain/analysis";
import { HISTORY_LIMIT } from "../domain/report-schema";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { newId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { parseJsonOr } from "../lib/json-text";
import type { ActionRow, ReportRow } from "../repositories/skill-analysis-repository";
import { idempotencyKey } from "./analysis-reports";
import { activeRequest, analysisRepo } from "./analysis-requests";
import { type Deps, iso } from "./common";

export const TRANSCRIPT_MAX_SEGMENTS = 5000;
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;

/** 履歴1版ぶん（HTML 本体は含めない・catalog §6） */
function historyEntry(
  r: ReportRow,
  findings: {
    report_id: string;
    kind: string;
    title: string;
    stage: string | null;
    metric: string | null;
    hypothesis_id: string | null;
    verdict: string | null;
  }[],
  actions: ActionRow[],
) {
  const results = parseJsonOr<Record<string, unknown>>(r.results_json, {});
  return {
    version: r.version,
    report_id: r.report_id,
    request_id: r.request_id,
    analyzed_at: r.created_at,
    period: { start: r.period_start, end: r.period_end },
    conclusion: r.conclusion,
    outcome: r.outcome,
    candidate: r.candidate_stage ? { stage: r.candidate_stage, metric: r.candidate_metric } : null,
    factors: findings
      .filter((f) => f.report_id === r.report_id && f.kind === "factor")
      .map((f) => ({ title: f.title, stage: f.stage, metric: f.metric })),
    hypotheses: findings
      .filter((f) => f.report_id === r.report_id && f.kind === "hypothesis")
      .map((f) => ({ hypothesis_id: f.hypothesis_id, title: f.title, verdict: f.verdict })),
    actions: actions
      .filter((a) => a.report_id === r.report_id)
      .map((a) => ({
        action_id: a.action_id,
        title: a.title,
        stage: a.stage,
        metric: a.metric,
        baseline: a.baseline_value,
        result: a.result_value,
        status: a.status,
        judgement: a.judgement,
      })),
    downstream: results.downstream ?? null,
  };
}

/**
 * GET /api/skill/export?request_id=。依頼の期間の書き出し行（行ごとに source 付き）と、
 * 同じテナント・チャンネルの完了済み分析を新しい順に最大5版（analysis_history）を返す
 */
export async function exportForSkill(deps: Deps, ctx: TenantContext, requestId: unknown) {
  requirePermission(ctx, "tenant.read");
  if (typeof requestId !== "string" || !requestId)
    throw new AppError("VALIDATION_FAILED", "request_id を指定してください");
  const repo = analysisRepo(deps, ctx);
  const req = await activeRequest(repo, requestId);
  const channel = await repo.getChannel();
  if (!channel || channel.channel_id !== req.channel_id)
    throw new AppError("CHANNEL_NOT_CONNECTED");
  const [rows, targets, recent, actions, nextVersion] = await Promise.all([
    repo.exportRows(req.channel_id, req.period_start, req.period_end),
    repo.exportTargets(req.channel_id),
    repo.recentReports(req.channel_id, HISTORY_LIMIT),
    repo.listActions(req.channel_id),
    repo.nextVersion(req.channel_id),
  ]);
  const findings = await repo.findingsFor(recent.map((r) => r.report_id));
  return {
    api_version: SKILL_API_VERSION,
    generated_at: iso(deps.now),
    request: {
      request_id: req.request_id,
      period_start: req.period_start,
      period_end: req.period_end,
      instruction: req.instruction,
      status: req.status,
    },
    channel: { channel_id: channel.channel_id, title: channel.title },
    next_version: nextVersion,
    idempotency_key: idempotencyKey(req.request_id, nextVersion),
    rows,
    targets,
    analysis_history: recent.map((r) => historyEntry(r, findings, actions)),
    action_effects: actions.map((a) => ({
      action_id: a.action_id,
      report_id: a.report_id,
      title: a.title,
      stage: a.stage,
      metric: a.metric,
      baseline_value: a.baseline_value,
      target_value: a.target_value,
      result_value: a.result_value,
      status: a.status,
      created_at: a.created_at,
    })),
  };
}

const TRANSCRIPT_SOURCES = ["srt", "vtt", "whisper", "captions_api"] as const;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

/** POST /api/skill/transcripts（SRT/VTT/Whisper の結果を時刻付きで保存・同じ取得元は置き換え） */
export async function saveTranscript(
  deps: Deps,
  ctx: TenantContext,
  body: Record<string, unknown>,
) {
  requirePermission(ctx, "content.write");
  const { video_id: videoId, source, segments, request_id: requestId } = body;
  if (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId))
    throw new AppError("VALIDATION_FAILED", "video_id を指定してください");
  if (!TRANSCRIPT_SOURCES.includes(source as (typeof TRANSCRIPT_SOURCES)[number]))
    throw new AppError(
      "VALIDATION_FAILED",
      "source は srt・vtt・whisper・captions_api のどれかにしてください",
    );
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.length > TRANSCRIPT_MAX_SEGMENTS
  )
    throw new AppError(
      "VALIDATION_FAILED",
      `segments は1〜${TRANSCRIPT_MAX_SEGMENTS}件の配列にしてください`,
    );
  const clean = segments.map((s, i) => {
    const ok =
      s &&
      typeof s === "object" &&
      Number.isInteger(s.start_ms) &&
      Number.isInteger(s.end_ms) &&
      s.start_ms >= 0 &&
      s.end_ms >= s.start_ms &&
      typeof s.text === "string" &&
      countChars(s.text as string) <= 2000;
    if (!ok)
      throw new AppError(
        "VALIDATION_FAILED",
        `segments[${i}] は start_ms ≤ end_ms と2000字以内の text が必要です`,
      );
    return { start_ms: s.start_ms as number, end_ms: s.end_ms as number, text: s.text as string };
  });
  const repo = analysisRepo(deps, ctx);
  if (requestId !== undefined) await activeRequest(repo, String(requestId));
  await repo.replaceTranscript({
    videoId,
    source: source as string,
    segments: clean,
    requestId: typeof requestId === "string" ? requestId : null,
    now: iso(deps.now),
  });
  return { videoId, source, segments: clean.length };
}

const MEDIA_KINDS = ["thumbnail", "scene", "screenshot"] as const;
const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": {
    ext: "png",
    magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  "image/webp": {
    ext: "webp",
    magic: (b) =>
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
};

function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** POST /api/skill/media（縮小画像を R2 へ置き、キーを media_assets に記録する） */
export async function saveMedia(deps: Deps, ctx: TenantContext, body: Record<string, unknown>) {
  requirePermission(ctx, "content.write");
  const { video_id: videoId, kind, content_type: contentType, data_base64: data } = body;
  if (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId))
    throw new AppError("VALIDATION_FAILED", "video_id を指定してください");
  if (!MEDIA_KINDS.includes(kind as (typeof MEDIA_KINDS)[number]))
    throw new AppError(
      "VALIDATION_FAILED",
      "kind は thumbnail・scene・screenshot のどれかにしてください",
    );
  const type = typeof contentType === "string" ? IMAGE_TYPES[contentType] : undefined;
  if (!type)
    throw new AppError(
      "VALIDATION_FAILED",
      "content_type は image/jpeg・image/png・image/webp にしてください",
    );
  if (typeof data !== "string" || !data)
    throw new AppError("VALIDATION_FAILED", "data_base64 がありません");
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(data);
  } catch {
    throw new AppError("VALIDATION_FAILED", "data_base64 を Base64 で送ってください");
  }
  if (bytes.length > MEDIA_MAX_BYTES) throw new AppError("PAYLOAD_TOO_LARGE");
  if (!type.magic(bytes))
    throw new AppError("VALIDATION_FAILED", "画像の中身が content_type と一致しません");
  const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);
  const repo = analysisRepo(deps, ctx);
  const requestId = typeof body.request_id === "string" ? body.request_id : null;
  if (requestId) await activeRequest(repo, requestId);
  const assetId = newId();
  const r2Key = `tenants/${ctx.tenantId}/media/${videoId}/${assetId}.${type.ext}`;
  await deps.env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType: contentType as string } });
  await repo.insertMediaAsset({
    assetId,
    videoId,
    kind: kind as string,
    atMs: int(body.at_ms),
    r2Key,
    contentType: contentType as string,
    width: int(body.width),
    height: int(body.height),
    bytes: bytes.length,
    requestId,
    now: iso(deps.now),
  });
  return { assetId, r2Key, bytes: bytes.length };
}
