// データ取込（CSV・字幕・画像）の受付と履歴。ファイルは R2 に置いて「処理待ち」で記録し、解析は feat-csv-media-ingest が担う

import { IMPORT_RULES, type ImportKind } from "../domain/import-rules";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { newId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { type Deps, iso } from "./common";
import { settingsRepo } from "./settings-common";

export const IMPORT_HISTORY_LIMIT = 20;

async function requireDeletionComplete(deps: Deps, ctx: TenantContext): Promise<void> {
  const repo = settingsRepo(deps, ctx);
  const [channel, tenant] = await Promise.all([
    repo.getPendingChannelDeletion(),
    repo.getPendingDeletion(),
  ]);
  if (channel || tenant) throw new AppError("IMPORT_DELETION_PENDING");
}

function isKind(value: unknown): value is ImportKind {
  return typeof value === "string" && value in IMPORT_RULES;
}

export async function listImports(deps: Deps, ctx: TenantContext) {
  requirePermission(ctx, "tenant.read");
  return settingsRepo(deps, ctx).listImports(IMPORT_HISTORY_LIMIT);
}

/** 形式違反のファイルも「失敗」として履歴に残す（利用者が理由を確認できるように） */
function validate(kind: ImportKind, name: string, size: number): string | null {
  const rule = IMPORT_RULES[kind];
  const lower = name.toLowerCase();
  if (!rule.exts.some((ext) => lower.endsWith(ext))) {
    return `${rule.label}は ${rule.exts.join(" / ")} のファイルを選んでください`;
  }
  if (size === 0) return "ファイルが空です";
  if (size > rule.maxBytes) {
    return `ファイルが大きすぎます（上限 ${Math.round(rule.maxBytes / 1024 / 1024)}MB）`;
  }
  return null;
}

export async function createImport(
  deps: Deps,
  ctx: TenantContext,
  input: { kind: unknown; file: unknown },
) {
  requirePermission(ctx, "content.write");
  const repo = settingsRepo(deps, ctx);
  const generation = await repo.getImportGeneration();
  await requireDeletionComplete(deps, ctx);
  if (!isKind(input.kind)) {
    throw new AppError(
      "VALIDATION_FAILED",
      "取込の種類（csv / caption / image）を指定してください",
    );
  }
  const kind = input.kind;
  if (!(input.file instanceof File)) {
    throw new AppError("VALIDATION_FAILED", "ファイルを選んでください");
  }
  const file = input.file;
  // パス区切りや制御文字を取り除き、表示と R2 キーの両方で安全な名前にする
  const fileName =
    Array.from(file.name, (ch) => (ch === "/" || ch === "\\" || ch.charCodeAt(0) < 0x20 ? "_" : ch))
      .join("")
      .slice(0, 120) || "file";
  const importId = newId();
  const error = validate(kind, fileName, file.size);
  const r2Key = error
    ? null
    : `tenants/${ctx.tenantId}/generations/g${generation}/imports/${importId}/${fileName}`;
  const insert = () =>
    repo.insertImport({
      importId,
      kind,
      fileName,
      status: error ? "失敗" : "処理待ち",
      error,
      r2Key,
      userId: ctx.userId,
      now: iso(deps.now),
      expectedGeneration: generation,
    });

  if (!r2Key) {
    try {
      if (!(await insert())) throw new AppError("IMPORT_DELETION_PENDING");
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("IMPORT_DELETION_PENDING")) {
        throw new AppError("IMPORT_DELETION_PENDING");
      }
      throw cause;
    }
    return { importId, status: "失敗", error };
  }

  // 台帳を先に書くことで、削除処理は R2.put の途中でも完了に進まない。
  try {
    if (
      !(await repo.beginImportUpload({
        importId,
        r2Key,
        expectedGeneration: generation,
        now: iso(deps.now),
      }))
    ) {
      throw new AppError("IMPORT_DELETION_PENDING");
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("IMPORT_DELETION_PENDING")) {
      throw new AppError("IMPORT_DELETION_PENDING");
    }
    throw cause;
  }

  try {
    await deps.env.MEDIA.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    if (!(await insert())) throw new AppError("IMPORT_DELETION_PENDING");
  } catch (cause) {
    // R2 と D1 は原子的に書けない。失敗した回収は台帳を残し、削除ジョブに再試行させる。
    try {
      await deps.env.MEDIA.delete(r2Key);
      await repo.finishImportUpload(importId);
    } catch (cleanupError) {
      console.error("import upload compensation failed", cleanupError);
    }
    if (cause instanceof Error && cause.message.includes("IMPORT_DELETION_PENDING")) {
      throw new AppError("IMPORT_DELETION_PENDING");
    }
    throw cause;
  }
  await repo.finishImportUpload(importId);
  return { importId, status: "処理待ち", error: null };
}
