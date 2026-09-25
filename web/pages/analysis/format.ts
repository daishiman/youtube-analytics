// AI分析画面の小さな整形・検査（画面部品から切り離してテストしやすくする）
import { CAUSE_METRIC_INFO, isCauseMetric } from "../../../src/domain/report-schema";
import { lineAt } from "../../../src/lib/json-text";
import type { RequestStatus } from "../../api";
import type { BadgeTone } from "../../components/StatusBadge";

export const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  待機中: "neutral",
  実行中: "warn",
  完了: "ok",
  失敗: "danger",
  取消: "neutral",
};

/** 進捗バーの色（失敗は赤・取消は灰。ほかは既定色） */
export const progressTone = (status: RequestStatus): "danger" | "muted" | undefined =>
  status === "失敗" ? "danger" : status === "取消" ? "muted" : undefined;

export const formatRange = (start: string, end: string) =>
  `${start.replaceAll("-", "/")}〜${end.replaceAll("-", "/")}`;

/** 数値を小数桁固定・桁区切りに（スキルの compute.mjs の show と同じ）。null は「—」 */
export function showNumber(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 指標キーの表示名。5原因指標は日本語ラベル、それ以外はキーのまま */
export const metricLabel = (metric: string | null): string =>
  metric === null ? "—" : isCauseMetric(metric) ? CAUSE_METRIC_INFO[metric].label : metric;

/** 原因指標の値を単位付きで（インプレッションは整数、ほかは小数2桁。スキルの digitsOf と同じ） */
export function formatMetric(metric: string, v: number | null | undefined): string {
  const text = showNumber(v, metric === "impressions" ? 0 : 2);
  return text === "—" || !isCauseMetric(metric) ? text : `${text}${CAUSE_METRIC_INFO[metric].unit}`;
}

/** 目標比（target_gap×100 を小数1桁）。マイナスは ▲、null は判定保留（スキルの gapText と同じ） */
export function gapText(gap: number | null): string {
  if (gap === null) return "判定保留";
  const v = Math.round(gap * 100 * 10) / 10;
  return v < 0 ? `▲${showNumber(-v, 1)}%` : `+${showNumber(v, 1)}%`;
}

export type JsonCheck =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; line: number | null; message: string; hint: string };

/**
 * 貼り付けた結果JSONの構文を送信前に検査する（最終判定はサーバ）。
 * JSON.parse の例外文から行番号を出す（新しい V8 は "line N column M"、古いものは "position N"）
 */
export function checkJson(text: string): JsonCheck {
  const trimmed = text.trim();
  if (!trimmed)
    return {
      ok: false,
      line: null,
      message: "JSONが入力されていません",
      hint: "Claude Code が出力した結果JSONを貼り付けてください",
    };
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return {
        ok: false,
        line: 1,
        message: "JSONの形式が正しくありません 1行目",
        hint: "{ で始まるオブジェクト形式のJSONを貼り付けてください",
      };
    return { ok: true, value: value as Record<string, unknown> };
  } catch (err) {
    const line = errorLine(text, err instanceof Error ? err.message : "");
    return {
      ok: false,
      line,
      message: line ? `JSONの形式が正しくありません ${line}行目` : "JSONの形式が正しくありません",
      hint: "カンマ・引用符・括弧の閉じ忘れがないか確かめてください",
    };
  }
}

export function errorLine(text: string, message: string): number | null {
  const offset = errorOffset(text, message);
  if (offset !== null) return lineAt(text, offset);
  // 末尾で切れている（Unexpected end of JSON input）は最終行
  if (INCOMPLETE.test(message)) return text.split("\n").length;
  // 位置を載せない例外文（新しい Chrome の `Unexpected token '}', "…" is not valid JSON` など）は自分で探す
  const bad = firstBadOffset(text);
  return bad === null ? null : lineAt(text, bad);
}

/** 例外文の位置（"position N" か "line N column M"）を文字位置に。無ければ null */
function errorOffset(text: string, message: string): number | null {
  const byPos = /position (\d+)/.exec(message);
  if (byPos) return Number(byPos[1]);
  const byLine = /line (\d+) column (\d+)/.exec(message);
  if (!byLine) return null;
  const lines = text.split("\n").slice(0, Number(byLine[1]) - 1);
  return lines.reduce((n, l) => n + l.length + 1, 0) + Number(byLine[2]) - 1;
}

/** 「途中で切れているだけ」を表す例外文（V8・Safari・Firefox） */
const INCOMPLETE = /end of (JSON )?input|end of data|Unexpected EOF/i;

/**
 * 先頭 n 文字が「後ろを足しても正しくならない」かを二分探索し、最初に壊れる文字の位置を返す。
 * 途中で切れただけの先頭部分は、例外文の位置が末尾を指すか「end of input」系になる
 */
function firstBadOffset(text: string): number | null {
  const broken = (n: number) => {
    const head = text.slice(0, n);
    try {
      JSON.parse(head);
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (INCOMPLETE.test(message)) return false;
      const at = errorOffset(head, message);
      return at === null || at < head.length;
    }
  };
  if (!broken(text.length)) return null;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (broken(mid)) hi = mid;
    else lo = mid + 1;
  }
  return Math.max(lo - 1, 0);
}

/** 形を決めていない値（発見の根拠・心理の根拠・アイデア）を1行の文字列に */
export function plain(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(plain).join("、") : "—";
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${plain(v)}`)
    .join(" / ");
}
