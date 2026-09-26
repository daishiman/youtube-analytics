/** CSV原本を列名・文字列値のままプレビューする。数値や日付への変換はしない。 */
import { AppError } from "../lib/errors";

export const CSV_PREVIEW_MAX_ROWS = 100;
const CSV_MAX_COLUMNS = 256;
const CSV_MAX_HEADER_CHARS = 64 * 1024;
const CSV_MAX_PAGE_CHARS = 1024 * 1024;

export interface CsvPage {
  headers: string[];
  rows: string[][];
  totalRows: number;
  offset: number;
  limit: number;
}

/** ファイル種別の軽い判定用。本文全体を解析せず、BOM を除いた先頭行だけ読む。 */
export function firstCsvLine(csv: string): string {
  return csv.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/, 1)[0] ?? "";
}

function malformed(reason: string): never {
  throw new AppError("VALIDATION_FAILED", `CSVを表示できません: ${reason}`);
}

function parseCsv(
  csv: string,
  offset: number,
  requestedLimit: number,
  maxRows: number,
  maxPageChars: number,
): CsvPage {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new AppError("VALIDATION_FAILED", "offset は0以上の整数を指定してください");
  }
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new AppError("VALIDATION_FAILED", "limit は1以上の整数を指定してください");
  }
  const limit = Math.min(requestedLimit, maxRows);
  let headers: string[] | null = null;
  const rows: string[][] = [];
  let totalRows = 0;
  let pageChars = 0;
  let cells: string[] = [];
  let field = "";
  let rowStarted = false;
  let state: "start" | "plain" | "quoted" | "closed" = "start";

  function pushField() {
    cells.push(field);
    if (cells.length > CSV_MAX_COLUMNS) {
      malformed(`列数が${cells.length}列で、上限の${CSV_MAX_COLUMNS}列を超えています`);
    }
    field = "";
    state = "start";
  }

  function pushRow(includeBlank = false) {
    if (!rowStarted && !includeBlank) return;
    pushField();
    if (!headers) {
      const chars = cells.reduce((size, cell) => size + cell.length, 0);
      if (chars > CSV_MAX_HEADER_CHARS) {
        malformed(`ヘッダーが${chars}文字で、上限の${CSV_MAX_HEADER_CHARS}文字を超えています`);
      }
      headers = cells;
    } else {
      if (cells.length > headers.length) {
        malformed(
          `行${totalRows + 2}の列数が${cells.length}列で、ヘッダーの${headers.length}列を超えています`,
        );
      }
      if (totalRows >= offset && rows.length < limit) {
        pageChars += cells.reduce((size, cell) => size + cell.length, 0);
        if (pageChars > maxPageChars) {
          malformed(`表示対象が${pageChars}文字で、上限の${maxPageChars}文字を超えています`);
        }
        rows.push(cells);
      }
      totalRows += 1;
    }
    cells = [];
    rowStarted = false;
  }

  for (let i = csv.charCodeAt(0) === 0xfeff ? 1 : 0; i < csv.length; i += 1) {
    const ch = csv[i];
    if (state === "quoted") {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          state = "closed";
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === ",") {
      pushField();
      rowStarted = true;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      pushRow(headers !== null);
      if (ch === "\r" && csv[i + 1] === "\n") i += 1;
      continue;
    }
    if (state === "closed")
      malformed(`行${totalRows + (headers ? 2 : 1)}の引用符の後に文字があります`);
    if (ch === '"') {
      if (state !== "start") malformed(`行${totalRows + (headers ? 2 : 1)}の引用符が不正です`);
      state = "quoted";
      rowStarted = true;
    } else {
      field += ch;
      state = "plain";
      rowStarted = true;
    }
  }
  if (state === "quoted") malformed("引用符が閉じられていません");
  pushRow();
  if (!headers) malformed("ヘッダーがありません");
  return { headers, rows, totalRows, offset, limit };
}

export function parseCsvPage(csv: string, offset: number, requestedLimit: number): CsvPage {
  return parseCsv(csv, offset, requestedLimit, CSV_PREVIEW_MAX_ROWS, CSV_MAX_PAGE_CHARS);
}

/** 小さな固定スキーマCSVを欠落なく検証する。プレビューの100行制限とは独立。 */
export function parseCsvTable(csv: string, maxRows: number): Pick<CsvPage, "headers" | "rows"> {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new AppError("VALIDATION_FAILED", "取込行数の上限が不正です");
  }
  const page = parseCsv(csv, 0, maxRows, maxRows, 6 * 1024 * 1024);
  if (page.totalRows > maxRows) {
    throw new AppError("VALIDATION_FAILED", `CSVの行数が上限の${maxRows}行を超えています`);
  }
  return { headers: page.headers, rows: page.rows };
}
