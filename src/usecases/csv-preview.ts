import { type CsvPage, parseCsvPage } from "../domain/csv-table";
import { IMPORT_RULES } from "../domain/import-rules";
import { requirePermission, type TenantContext } from "../domain/tenant-context";
import { AppError } from "../lib/errors";
import type { ImportStatus } from "../repositories/settings-repository";
import type { Deps } from "./common";
import { settingsRepo } from "./settings-common";

export interface CsvPreviewResponse extends CsvPage {
  importId: string;
  fileName: string;
  status: ImportStatus;
}

/** 原本の一部を閲覧するだけ。指標への取込状態は変更しない。 */
export async function previewCsvImport(
  deps: Deps,
  ctx: TenantContext,
  importId: string,
  offset = 0,
  limit = 50,
): Promise<CsvPreviewResponse> {
  requirePermission(ctx, "tenant.read");
  const source = await settingsRepo(deps, ctx).getCsvImportSource(importId);
  if (!source?.r2_key.startsWith(`tenants/${ctx.tenantId}/`)) {
    throw new AppError("NOT_FOUND");
  }
  const original = await deps.env.MEDIA.get(source.r2_key);
  if (!original) throw new AppError("NOT_FOUND");
  if (original.size > IMPORT_RULES.csv.maxBytes) {
    throw new AppError("VALIDATION_FAILED", "CSVがアップロード上限の5MBを超えています");
  }
  let csv: string;
  try {
    csv = new TextDecoder("utf-8", { fatal: true }).decode(await original.arrayBuffer());
  } catch {
    throw new AppError(
      "VALIDATION_FAILED",
      "CSVをUTF-8で読み取れません。文字コードを確認してください",
    );
  }
  return {
    importId,
    fileName: source.file_name,
    status: source.status,
    ...parseCsvPage(csv, offset, limit),
  };
}
