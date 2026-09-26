// データ取込。事業週次CSVと確認済みヘッダーのStudio CSVを同期正規化し、原本も保管する。

import { isBusinessCsv, parseBusinessCsv } from "../domain/business-csv";
import { IMPORT_RULES, type ImportKind } from "../domain/import-rules";
import { detectStudioCsv, parseStudioCsv } from "../domain/studio-csv";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { newId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { BusinessCsvRepository } from "../repositories/business-csv-repository";
import { controlDb } from "../repositories/db";
import { StudioCsvRepository } from "../repositories/studio-csv-repository";
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
  const imports = await settingsRepo(deps, ctx).listImports(IMPORT_HISTORY_LIMIT);
  const mappings = await new StudioCsvRepository(controlDb(deps.env), ctx).summaries(
    imports.map((row) => row.import_id),
  );
  return imports.map((row) => {
    const mapping = mappings.get(row.import_id);
    return {
      ...row,
      mapped_columns: mapping?.mapped_columns ?? null,
      unmapped_columns: mapping?.unmapped_columns ?? null,
      unresolved_rows: mapping?.unresolved_rows ?? null,
      period_status: mapping?.period_status ?? null,
    };
  });
}

export async function getStudioImportMapping(deps: Deps, ctx: TenantContext, importId: string) {
  requirePermission(ctx, "tenant.read");
  const mapping = await new StudioCsvRepository(controlDb(deps.env), ctx).mapping(importId);
  if (!mapping) throw new AppError("NOT_FOUND");
  return {
    importId,
    studioKind: mapping.summary.studio_kind,
    mappedColumns: mapping.summary.mapped_columns,
    unmappedColumns: mapping.summary.unmapped_columns,
    unresolvedRows: mapping.summary.unresolved_rows,
    periodStatus: mapping.summary.period_status,
    columns: mapping.columns.map((column) => ({
      ordinal: column.ordinal,
      header: column.header,
      mappingKey: column.mapping_key,
      unit: column.unit,
      status: column.status,
    })),
  };
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
  const fileBytes = r2Key ? await file.arrayBuffer() : null;
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
    await deps.env.MEDIA.put(r2Key, fileBytes, {
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
  if (kind === "csv" && fileBytes) {
    let csv: string;
    try {
      csv = new TextDecoder("utf-8", { fatal: true }).decode(fileBytes);
    } catch {
      const studioKind = detectStudioCsv("", fileName);
      if (fileName.toLowerCase() !== "business-funnel-weekly.csv" && !studioKind) {
        return { importId, status: "処理待ち", error: null };
      }
      const reason = `${studioKind ? "Studio CSV" : "事業週次CSV"}をUTF-8で読み取れません。文字コードを確認してください`;
      const parserRepo = studioKind
        ? new StudioCsvRepository(controlDb(deps.env), ctx)
        : new BusinessCsvRepository(controlDb(deps.env), ctx);
      if (!(await parserRepo.fail({ importId, expectedGeneration: generation, reason }))) {
        throw new AppError("IMPORT_DELETION_PENDING");
      }
      return { importId, status: "失敗", error: reason };
    }
    if (isBusinessCsv(csv, fileName)) {
      const businessRepo = new BusinessCsvRepository(controlDb(deps.env), ctx);
      try {
        const channel = await repo.getChannel();
        const parsed = parseBusinessCsv(csv, channel?.channel_id ?? null);
        if (
          !(await businessRepo.complete({
            importId,
            expectedGeneration: generation,
            channelId: channel?.channel_id ?? "",
            csv: parsed,
            now: iso(deps.now),
          }))
        ) {
          throw new AppError("IMPORT_DELETION_PENDING");
        }
        return {
          importId,
          status: "完了",
          error: null,
          rows: parsed.rows.length,
          period: parsed.period,
        };
      } catch (cause) {
        if (!(cause instanceof AppError) || cause.code !== "VALIDATION_FAILED") throw cause;
        if (
          !(await businessRepo.fail({
            importId,
            expectedGeneration: generation,
            reason: cause.hint,
          }))
        ) {
          throw new AppError("IMPORT_DELETION_PENDING");
        }
        return { importId, status: "失敗", error: cause.hint };
      }
    }
    const studioKind = detectStudioCsv(csv, fileName);
    if (studioKind) {
      const studioRepo = new StudioCsvRepository(controlDb(deps.env), ctx);
      try {
        const channel = await repo.getChannel();
        const parsed = parseStudioCsv(csv, studioKind, channel?.channel_id ?? null);
        if (
          !(await studioRepo.complete({
            importId,
            expectedGeneration: generation,
            channelId: channel?.channel_id ?? "",
            csv: parsed,
            now: iso(deps.now),
          }))
        ) {
          throw new AppError("IMPORT_DELETION_PENDING");
        }
        return {
          importId,
          status: "完了",
          error: null,
          rows: parsed.totalRows,
          period: parsed.period,
          mapped_columns: parsed.mappedColumns,
          unmapped_columns: parsed.unmappedColumns,
          unresolved_rows: parsed.unresolvedRows.length,
          period_status: parsed.periodStatus,
        };
      } catch (cause) {
        if (!(cause instanceof AppError) || cause.code !== "VALIDATION_FAILED") throw cause;
        if (
          !(await studioRepo.fail({
            importId,
            expectedGeneration: generation,
            reason: cause.hint,
          }))
        ) {
          throw new AppError("IMPORT_DELETION_PENDING");
        }
        return { importId, status: "失敗", error: cause.hint };
      }
    }
  }
  return { importId, status: "処理待ち", error: null };
}
