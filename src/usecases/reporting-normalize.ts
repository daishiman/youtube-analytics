import type { ReportingReport } from "../adapters/google-reporting-jobs";
import { pacificDate } from "../domain/pacific-date";
import type { Bindings } from "../env";
import type {
  ReachStageRow,
  ReportingIdentity,
  ReportingRepository,
} from "../repositories/reporting-repository";

/** 公式 channel reach basic v1 の5列だけを動画・日次表に反映する。 */
export const REACH_BASIC_REPORT_TYPE = "channel_reach_basic_a1";
const REQUIRED_COLUMNS = [
  "date",
  "channel_id",
  "video_id",
  "video_thumbnail_impressions",
  "video_thumbnail_impressions_ctr",
] as const;
const STAGE_BATCH_ROWS = 2_500;
const MAX_ROWS = 50_000;
const MAX_FIELD_CHARS = 64 * 1024;
const MAX_COLUMNS = 256;

export class ReachNormalizationError extends Error {}
class ReachStaleError extends Error {}

function reachPeriodDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new ReachNormalizationError("reach period invalid");
  return pacificDate(date);
}

/** 引用符・カンマ・改行を chunk 境界を越えて扱う。行は逐次 callback へ渡す。 */
async function parseCsvStream(
  stream: ReadableStream<Uint8Array>,
  onRow: (row: string[]) => Promise<void>,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  let field = "";
  let cells: string[] = [];
  let rowStarted = false;
  let afterCr = false;
  let firstChar = true;
  const pushField = () => {
    cells.push(field);
    if (cells.length > MAX_COLUMNS) throw new ReachNormalizationError("reach CSV too many columns");
    field = "";
    state = "start";
  };
  const pushRow = async () => {
    if (!rowStarted && !field && cells.length === 0) return;
    pushField();
    await onRow(cells);
    cells = [];
    rowStarted = false;
  };
  const feed = async (text: string) => {
    for (const char of text) {
      if (firstChar) {
        firstChar = false;
        if (char === "\uFEFF") continue;
      }
      if (afterCr) {
        afterCr = false;
        if (char === "\n") continue;
      }
      if (state === "quoted") {
        if (char === '"') state = "closed";
        else field += char;
      } else if (state === "closed") {
        if (char === '"') {
          field += '"';
          state = "quoted";
        } else if (char === ",") {
          pushField();
          rowStarted = true;
        } else if (char === "\r" || char === "\n") {
          await pushRow();
          if (char === "\r") afterCr = true;
        } else throw new ReachNormalizationError("reach CSV invalid quoted field");
      } else if (char === '"') {
        if (state !== "start") throw new ReachNormalizationError("reach CSV invalid quote");
        state = "quoted";
        rowStarted = true;
      } else if (char === ",") {
        pushField();
        rowStarted = true;
      } else if (char === "\r" || char === "\n") {
        await pushRow();
        if (char === "\r") afterCr = true;
      } else {
        field += char;
        state = "plain";
        rowStarted = true;
      }
      if (field.length > MAX_FIELD_CHARS)
        throw new ReachNormalizationError("reach CSV field too large");
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await feed(decoder.decode(value, { stream: true }));
    }
    await feed(decoder.decode());
    if (String(state) === "quoted") throw new ReachNormalizationError("reach CSV quote unclosed");
    await pushRow();
  } finally {
    reader.releaseLock();
  }
}

function parseMetric(raw: string, label: string, max: number): number | null {
  if (raw === "") return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))
    throw new ReachNormalizationError(`${label} invalid`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value > max)
    throw new ReachNormalizationError(`${label} out of range`);
  return value;
}

/** 戻り値 stale は接続世代変更、pending はデータ不正・処理上限で原本のみ保持。 */
export async function normalizeStoredReachReport(input: {
  env: Bindings;
  repository: ReportingRepository;
  message: ReportingIdentity;
  generation: number;
  report: ReportingReport;
  reportTypeId: string;
  r2Key: string;
  now: string;
}): Promise<"normalized" | "unsupported" | "stale" | "pending"> {
  const { env, repository, message, generation, report, reportTypeId, r2Key, now } = input;
  if (reportTypeId !== REACH_BASIC_REPORT_TYPE) return "unsupported";
  try {
    const startMs = Date.parse(report.startTime);
    const endMs = Date.parse(report.endTime);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs - startMs < 23 * 60 * 60 * 1000 ||
      endMs - startMs > 25 * 60 * 60 * 1000
    ) {
      throw new ReachNormalizationError("reach report period must be one Pacific day");
    }
    const expectedDate = reachPeriodDate(report.startTime);
    if (!(await repository.resetReachStage(message, generation, report.id))) return "stale";
    const object = await env.MEDIA.get(r2Key);
    if (!object) throw new ReachNormalizationError("reach raw CSV missing");
    let indexes: number[] | null = null;
    let columnCount = 0;
    let totalRows = 0;
    let stage: ReachStageRow[] = [];
    const flush = async () => {
      if (!stage.length) return;
      if (!(await repository.stageReachRows(message, generation, report.id, stage))) {
        throw new ReachStaleError("reach connection changed while staging");
      }
      stage = [];
    };
    await parseCsvStream(object.body, async (row) => {
      if (!indexes) {
        if (new Set(row).size !== row.length)
          throw new ReachNormalizationError("reach duplicate header");
        indexes = REQUIRED_COLUMNS.map((name) => row.indexOf(name));
        if (indexes.some((index) => index < 0))
          throw new ReachNormalizationError("reach required column missing");
        columnCount = row.length;
        return;
      }
      if (row.length !== columnCount)
        throw new ReachNormalizationError("reach row column count mismatch");
      totalRows += 1;
      if (totalRows > MAX_ROWS)
        throw new ReachNormalizationError("reach report exceeds normalization limit");
      const [dateIndex, channelIndex, videoIndex, impressionsIndex, ctrIndex] = indexes;
      const date = row[dateIndex ?? -1] ?? "";
      const channelId = row[channelIndex ?? -1] ?? "";
      const videoId = row[videoIndex ?? -1] ?? "";
      if (date !== expectedDate)
        throw new ReachNormalizationError("reach date outside report period");
      if (!channelId || !videoId) return; // 公式の削除済みリソース/チャンネル集計行。
      if (channelId !== message.channelId)
        throw new ReachNormalizationError("reach channel mismatch");
      const impressions = parseMetric(
        row[impressionsIndex ?? -1] ?? "",
        "impressions",
        Number.MAX_SAFE_INTEGER,
      );
      if (impressions !== null && !Number.isSafeInteger(impressions)) {
        throw new ReachNormalizationError("reach impressions must be integer");
      }
      // 公式は percentage と定義。CSV 数値を百分率として保持し、推測で100倍しない。
      const ctr = parseMetric(row[ctrIndex ?? -1] ?? "", "CTR", 100);
      if (impressions === null && ctr === null) return;
      stage.push({ date, videoId, impressions, ctr });
      if (stage.length >= STAGE_BATCH_ROWS) await flush();
    });
    if (!indexes) throw new ReachNormalizationError("reach header missing");
    await flush();
    if (!(await repository.isCurrent(message, generation))) return "stale";
    return (await repository.commitReach({
      message,
      generation,
      reportId: report.id,
      reportDate: expectedDate,
      createTime: report.createTime,
      now,
    }))
      ? "normalized"
      : "stale";
  } catch (error) {
    if (error instanceof ReachStaleError) return "stale";
    // 原本は保持し、正規化完了印を付けない。次回の同期で再処理できる。
    console.error(
      "reach normalization pending",
      error instanceof Error ? error.message : "unknown error",
    );
    return "pending";
  }
}
