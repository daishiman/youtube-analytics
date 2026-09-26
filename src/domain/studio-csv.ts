import { AppError } from "../lib/errors";
import { firstCsvLine, parseCsvTable } from "./csv-table";
import { isDate } from "./dashboard-period";

export type StudioKind = "table" | "graph" | "total";
export type StudioColumnStatus = "mapped" | "unmapped";

export interface StudioColumn {
  ordinal: number;
  header: string;
  mappingKey: string | null;
  unit: string | null;
  status: StudioColumnStatus;
}

export interface StudioPeriodRow {
  rowIndex: number;
  videoId: string | null;
  isTotal: boolean;
  title: string | null;
  metrics: Record<string, number | null>;
}

export interface StudioDailyRow {
  rowIndex: number;
  date: string;
  videoId: string | null;
  views: number | null;
  engagedViews: number | null;
  averageViewPercentage: number | null;
}

export interface StudioUnresolvedRow {
  rowIndex: number;
  reason: string;
}

export interface StudioCsv {
  studioKind: StudioKind;
  columns: StudioColumn[];
  periodRows: StudioPeriodRow[];
  dailyRows: StudioDailyRow[];
  unresolvedRows: StudioUnresolvedRow[];
  totalRows: number;
  period: string | null;
  periodStatus: "unknown" | "daily";
  mappedColumns: number;
  unmappedColumns: number;
}

interface Field {
  key: string;
  unit: string;
  numeric?: "count" | "signedCount" | "decimal" | "percent" | "hms";
}

// Studio の実CSVで形式を確認できた列だけを正規化する。公開時刻は原本に残す。
const TABLE_FIELDS: Record<string, Field> = {
  コンテンツ: { key: "videoId", unit: "video_id" },
  動画のタイトル: { key: "title", unit: "text" },
  長さ: { key: "durationSeconds", unit: "seconds", numeric: "count" },
  "エンゲージ ビュー": { key: "engagedViews", unit: "count", numeric: "count" },
  平均視聴時間: { key: "averageViewDurationSeconds", unit: "seconds", numeric: "hms" },
  "平均視聴率 (%)": { key: "averageViewPercentage", unit: "percent", numeric: "percent" },
  "視聴を継続 (%)": { key: "choseToViewPercentage", unit: "percent", numeric: "percent" },
  ユニーク視聴者数: { key: "uniqueViewers", unit: "count", numeric: "count" },
  ユニークリーチ: { key: "uniqueReach", unit: "count", numeric: "count" },
  "視聴回数（共視聴）": { key: "coViewingViews", unit: "count", numeric: "count" },
  視聴者あたりの平均視聴回数: {
    key: "averageViewsPerViewer",
    unit: "ratio",
    numeric: "decimal",
  },
  新しい視聴者数: { key: "newViewers", unit: "count", numeric: "count" },
  リピーター: { key: "returningViewers", unit: "count", numeric: "count" },
  ライトな視聴者: { key: "casualViewers", unit: "count", numeric: "count" },
  コアな視聴者: { key: "coreViewers", unit: "count", numeric: "count" },
  視聴回数: { key: "views", unit: "count", numeric: "count" },
  "総再生時間（単位: 時間）": { key: "watchHours", unit: "hours", numeric: "decimal" },
  チャンネル登録者: { key: "subscriberChange", unit: "count", numeric: "signedCount" },
  サムネイルのインプレッション: { key: "thumbnailImpressions", unit: "count", numeric: "count" },
  "サムネイルのクリック率 (%)": {
    key: "thumbnailCtr",
    unit: "percent",
    numeric: "percent",
  },
};

const DAILY_FIELDS: Record<string, Field> = {
  日付: { key: "date", unit: "jst_date" },
  "エンゲージ ビュー": { key: "engagedViews", unit: "count", numeric: "count" },
  視聴回数: { key: "views", unit: "count", numeric: "count" },
};
const GRAPH_FIELDS: Record<string, Field> = {
  ...DAILY_FIELDS,
  コンテンツ: { key: "videoId", unit: "video_id" },
  "平均視聴率 (%)": { key: "averageViewPercentage", unit: "percent", numeric: "percent" },
};

const STUDIO_FILE_NAMES: Record<string, StudioKind> = {
  "表データ.csv": "table",
  "グラフデータ.csv": "graph",
  "合計.csv": "total",
};

function invalid(reason: string): never {
  throw new AppError("VALIDATION_FAILED", `Studio CSV: ${reason}`);
}

/** ファイル名に依存せず必須ヘッダーの組合せでも検出する。 */
export function detectStudioCsv(csv: string, fileName: string): StudioKind | null {
  const named = STUDIO_FILE_NAMES[fileName.normalize("NFC")];
  if (named) return named;
  const firstLine = firstCsvLine(csv);
  const names = new Set(firstLine.split(","));
  const hasDailyMetric = names.has("エンゲージ ビュー") || names.has("視聴回数");
  if (
    names.has("日付") &&
    names.has("コンテンツ") &&
    (hasDailyMetric || names.has("平均視聴率 (%)"))
  ) {
    return "graph";
  }
  if (names.has("日付") && !names.has("コンテンツ") && hasDailyMetric) {
    return "total";
  }
  if (names.has("コンテンツ") && !names.has("日付") && names.has("動画のタイトル")) {
    return "table";
  }
  return null;
}

function dateCell(value: string): string | null {
  const trimmed = value.trim();
  const normalized = /^\d{4}\/\d{2}\/\d{2}$/.test(trimmed) ? trimmed.replaceAll("/", "-") : trimmed;
  return isDate(normalized) ? normalized : null;
}

function videoIdCell(value: string): string | null {
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
}

function numericCell(raw: string, kind: NonNullable<Field["numeric"]>): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (kind === "hms") {
    const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(trimmed);
    if (!match) return "invalid";
    const value = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return Number.isSafeInteger(value) ? value : "invalid";
  }
  const withoutPercent = kind === "percent" ? trimmed.replace(/%$/, "").trim() : trimmed;
  const grouped = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(withoutPercent);
  const text = grouped ? withoutPercent.replaceAll(",", "") : withoutPercent;
  const integer = kind === "count" || kind === "signedCount";
  const valid = integer ? /^-?\d+$/.test(text) : /^-?\d+(?:\.\d+)?$/.test(text);
  if (!valid || (kind !== "signedCount" && text.startsWith("-"))) return "invalid";
  const value = Number(text);
  if (!Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) return "invalid";
  return value;
}

export function parseStudioCsv(csv: string, kind: StudioKind, channelId: string | null): StudioCsv {
  if (!channelId) invalid("先にYouTubeチャンネルを連携してください");
  const table = parseCsvTable(csv, 1000);
  const headers = table.headers.map((header) => header.trim());
  if (new Set(headers).size !== headers.length) invalid("同じ列名が複数あります");
  const required =
    kind === "table"
      ? ["コンテンツ", "動画のタイトル"]
      : kind === "graph"
        ? ["日付", "コンテンツ"]
        : ["日付"];
  const missing = required.filter((name) => !headers.includes(name));
  if (missing.length) invalid(`必須列がありません: ${missing.join("、")}`);
  if (
    kind !== "table" &&
    !headers.includes("エンゲージ ビュー") &&
    !headers.includes("視聴回数") &&
    (kind !== "graph" || !headers.includes("平均視聴率 (%)"))
  ) {
    invalid("必須列がありません: エンゲージ ビューまたは視聴回数または平均視聴率 (%)");
  }
  if (table.rows.length === 0) invalid("データ行がありません");
  const fields = kind === "table" ? TABLE_FIELDS : kind === "graph" ? GRAPH_FIELDS : DAILY_FIELDS;
  const columns: StudioColumn[] = headers.map((header, ordinal) => {
    const field = fields[header];
    return {
      ordinal,
      header,
      mappingKey: field?.key ?? null,
      unit: field?.unit ?? null,
      status: field ? "mapped" : "unmapped",
    };
  });
  const get = (cells: string[], name: string) => cells[headers.indexOf(name)] ?? "";
  const periodRows: StudioPeriodRow[] = [];
  const dailyRows: StudioDailyRow[] = [];
  const unresolvedRows: StudioUnresolvedRow[] = [];
  const seen = new Set<string>();
  for (const [offset, cells] of table.rows.entries()) {
    const rowIndex = offset + 1;
    const reason = (message: string) => unresolvedRows.push({ rowIndex, reason: message });
    if (kind === "table") {
      const content = get(cells, "コンテンツ").trim();
      const title = get(cells, "動画のタイトル").trim() || null;
      const isTotal = content === "合計";
      const videoId = isTotal ? null : videoIdCell(content);
      if (!isTotal && !videoId) {
        reason("コンテンツを11文字の動画IDとして確認できません");
        continue;
      }
      if (videoId && seen.has(videoId)) {
        reason("同じ動画IDが重複しています");
        continue;
      }
      const metrics: Record<string, number | null> = {};
      let bad: string | null = null;
      for (const column of columns) {
        const field = fields[column.header];
        if (!field?.numeric) continue;
        const value = numericCell(cells[column.ordinal] ?? "", field.numeric);
        if (value === "invalid") {
          bad = `${column.header}の数値形式を確認できません`;
          break;
        }
        metrics[field.key] = value;
      }
      if (bad) {
        reason(bad);
        continue;
      }
      if (videoId) seen.add(videoId);
      periodRows.push({ rowIndex, videoId, isTotal, title, metrics });
      continue;
    }
    const date = dateCell(get(cells, "日付"));
    if (!date) {
      reason("日付をJST暦日（YYYY-MM-DD）として確認できません");
      continue;
    }
    const videoId = kind === "graph" ? videoIdCell(get(cells, "コンテンツ")) : null;
    if (kind === "graph" && !videoId) {
      reason("コンテンツを11文字の動画IDとして確認できません");
      continue;
    }
    const key = `${date}:${videoId ?? "channel"}`;
    if (seen.has(key)) {
      reason("同じ日付と動画の行が重複しています");
      continue;
    }
    const views = headers.includes("視聴回数")
      ? numericCell(get(cells, "視聴回数"), "count")
      : null;
    if (views === "invalid") {
      reason("視聴回数の数値形式を確認できません");
      continue;
    }
    const engagedViews = headers.includes("エンゲージ ビュー")
      ? numericCell(get(cells, "エンゲージ ビュー"), "count")
      : null;
    if (engagedViews === "invalid") {
      reason("エンゲージ ビューの数値形式を確認できません");
      continue;
    }
    const averageViewPercentage =
      kind === "graph" && headers.includes("平均視聴率 (%)")
        ? numericCell(get(cells, "平均視聴率 (%)"), "percent")
        : null;
    if (averageViewPercentage === "invalid") {
      reason("平均視聴率 (%)の数値形式を確認できません");
      continue;
    }
    seen.add(key);
    dailyRows.push({ rowIndex, date, videoId, views, engagedViews, averageViewPercentage });
  }
  const dates = dailyRows.map((row) => row.date).sort();
  const first = dates[0];
  const last = dates.at(-1);
  const period = first && last ? (first === last ? first : `${first}〜${last}`) : null;
  return {
    studioKind: kind,
    columns,
    periodRows,
    dailyRows,
    unresolvedRows,
    totalRows: table.rows.length,
    period,
    periodStatus: kind === "table" ? "unknown" : "daily",
    mappedColumns: columns.filter((column) => column.status === "mapped").length,
    unmappedColumns: columns.filter((column) => column.status === "unmapped").length,
  };
}
