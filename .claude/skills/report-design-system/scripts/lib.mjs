// build-report.mjs と check-report.mjs の共有部分。埋め込むCSS/JSの正本はここで1回だけ組み立てる。
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDOR_FILES, vendorPath } from "./sync-kit.mjs";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPORT_CSS = join(SKILL_DIR, "assets/report.css");
export const REPORT_JS = join(SKILL_DIR, "assets/report.js");

/**
 * キット部品CSSの先頭にある配色の @import 行。単一HTMLでは配色CSSを直前に埋め込むので、この1行だけを除く。
 * 除去はこの完全一致の1行に限る (別の @import が増えたら除かずに残し、check の E02 で止める)。
 */
export const KIT_COLOR_IMPORT = '@import url("../hiraga/hiraga-color-system.css");\n';

/** 埋め込むCSS (vendor 配色 → vendor キット部品 → report.css の順。後ろほど優先) */
export const embeddedCss = () =>
  [...VENDOR_FILES.map((f) => readFileSync(vendorPath(f), "utf8").replace(KIT_COLOR_IMPORT, "")), readFileSync(REPORT_CSS, "utf8")]
    .map((s) => s.trimEnd())
    .join("\n");
/** 埋め込むJS */
export const embeddedJs = () => readFileSync(REPORT_JS, "utf8").trimEnd();

/** セクションの種別。ソースの並びはこの順 (conclusion 1つ → factor 1つ以上 → 必要な場合だけ action 1つ) */
export const KINDS = { conclusion: "結論", factor: "要因", action: "打ち手" };
export const ORDER = /^conclusion( factor)+( action)?$/;
/**
 * 打ち手の出所 (data-source)。キットの .badge に記号と文言を併記して表示する (色だけで伝えない)。
 *   data    = 担当・期限・効果をデータと既存の決まりから決められた
 *   hearing = データで決められない点をユーザーへのヒアリングで確定した
 *   pending = ヒアリングしても未確定。該当項目に「要確認」と書き、検査は警告 (W04) を出す
 */
export const ACT_SOURCES = {
  data: ["badge-active", "● データで算出"],
  hearing: ["badge-tag", "◆ ヒアリングで確定"],
  pending: ["badge-warning", "△ 要確認"],
};
/** 打ち手の必須項目 (dl.act-meta の dt。この順で書く) */
export const ACT_FIELDS = ["効果", "担当", "期限"];

/** 生成・最終検査で共有する文章契約。片側だけの語彙変更を防ぐ。 */
export const OVERVIEW_JARGON = /p値|p\s*[<=>]|有意(?:差)?|効果量|信頼区間|標準偏差|分散|回帰(?:係数)?|決定係数|R[²2]|相関係数|ジニ係数|IQR|オッズ比|ハザード比|検定/i;
export const TECHNICAL_STAT = /中央値|標準偏差|分散|変動係数|効果量|信頼区間|相関|回帰|決定係数|R[²2]|ジニ係数|IQR|p値|オッズ比|ハザード比/i;

/** 厳格検証で描画・証跡の双方が要求する幅。 */
export const RENDER_WIDTHS = Object.freeze([375, 768, 1280, 1600]);

const IMPACT = /^([+\-−▲])?(\d+(?:\.\d+)?)$/;

/** data-impact を正規化する。Unicode マイナスと悪化記号も負数として扱う。 */
export function parseImpact(raw) {
  const match = String(raw ?? "").trim().match(IMPACT);
  if (!match) return null;
  const negative = match[1] === "-" || match[1] === "−" || match[1] === "▲";
  return { value: (negative ? -1 : 1) * Number(match[2]), digits: match[2] };
}

/** 通常 build では警告に留め、厳格 done だけが拒否する未確定アクション。 */
export const hasPendingActions = (html) => /<li\b[^>]*class="[^"]*\bact\b[^"]*"[^>]*\bdata-source="pending"/.test(String(html));

/** review.json の機械契約。プロンプトと検査で値を重複定義しない。 */
export const REVIEW_CONDITIONS = Object.freeze(["矛盾なし", "漏れなし", "整合性あり", "依存関係整合"]);
export const REVIEW_VERDICTS = Object.freeze(["PASS", "FAIL"]);
export const REVIEW_SEVERITIES = Object.freeze(["must", "should"]);
export const REVIEW_STATUSES = Object.freeze(["open", "fixed", "accepted"]);
export const REVIEW_FINDING_FIELDS = Object.freeze(["条件", "severity", "status", "箇所", "指摘", "提案"]);
export const REFERENCE_MAX_LINE_LENGTH = 500;

/** レポートの情報量。標準を既定にし、質問待ちで初回生成を止めない。 */
export const DEFAULT_REPORT_DETAIL = "標準";
export const REPORT_DETAILS = Object.freeze({
  要点: Object.freeze({ token: "concise", factorsMax: 2, factsMin: 2, factsMax: 3, statsMin: 2, statsMax: 3 }),
  標準: Object.freeze({ token: "standard", factorsMax: 3, factsMin: 2, factsMax: 5, statsMin: 2, statsMax: 5 }),
  詳細: Object.freeze({ token: "detailed", factorsMax: 5, factsMin: 2, factsMax: 7, statsMin: 2, statsMax: 7 }),
});
export const REPORT_DETAIL_BY_TOKEN = Object.freeze(Object.fromEntries(Object.entries(REPORT_DETAILS).map(([label, value]) => [value.token, { label, ...value }])));

export const isFilled = (value) =>
  Array.isArray(value) ? value.length > 0 : value != null && String(value).trim() !== "";
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/**
 * review.json の宣言的な形と、配布する最終 HTML への接続を検査する。
 * 指摘を fixed にした場合も target は必ず最終 HTML の hash に更新する。
 */
export function reviewContractErrors(review, finalHtmlHash) {
  const errors = [];
  if (review?.target !== finalHtmlHash) errors.push("review.target は現在の最終 HTML の sha256 と一致させる");

  const conditions = review?.条件;
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) {
    errors.push("review.条件 は4条件の判定を持つオブジェクトにする");
  } else {
    for (const condition of REVIEW_CONDITIONS) {
      if (!(condition in conditions)) errors.push(`review.条件.${condition} がありません`);
      else if (!REVIEW_VERDICTS.includes(conditions[condition])) errors.push(`review.条件.${condition} は ${REVIEW_VERDICTS.join(" か ")} にする`);
      else if (conditions[condition] !== "PASS") errors.push(`review.条件.${condition} が FAIL です。最終 HTML を改善して全4条件を PASS にする`);
    }
    for (const condition of Object.keys(conditions)) {
      if (!REVIEW_CONDITIONS.includes(condition)) errors.push(`review.条件.${condition} は未知の条件です`);
    }
  }

  if (!Array.isArray(review?.findings)) {
    errors.push("review.findings が配列ではありません");
    return errors;
  }
  for (const [index, finding] of review.findings.entries()) {
    const at = `指摘 ${index + 1}`;
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      errors.push(`${at}: オブジェクトではありません`);
      continue;
    }
    for (const field of REVIEW_FINDING_FIELDS) if (!isFilled(finding[field])) errors.push(`${at}: ${field} が空です`);
    if (isFilled(finding.条件) && !REVIEW_CONDITIONS.includes(finding.条件)) errors.push(`${at}: 条件は ${REVIEW_CONDITIONS.join(" / ")} のどれか`);
    if (isFilled(finding.severity) && !REVIEW_SEVERITIES.includes(finding.severity)) errors.push(`${at}: severity は ${REVIEW_SEVERITIES.join(" か ")}`);
    if (isFilled(finding.status) && !REVIEW_STATUSES.includes(finding.status)) errors.push(`${at}: status は ${REVIEW_STATUSES.join(" / ")} のどれか`);
    if (finding.severity === "must" && finding.status === "open") errors.push(`${at}: 未解決の must です。fixed か accepted にする — ${finding.指摘 || "指摘なし"}`);
  }
  return errors;
}

/** data-impact と results.steps の数値照合。小数指標を誤受理しない小さな計算誤差だけを許す。 */
export const IMPACT_ABSOLUTE_TOLERANCE = 1e-9;
export const IMPACT_RELATIVE_TOLERANCE = 1e-9;
export const nearlyEqual = (actual, expected, absolute = IMPACT_ABSOLUTE_TOLERANCE, relative = IMPACT_RELATIVE_TOLERANCE) =>
  Number.isFinite(actual) && Number.isFinite(expected)
  && Math.abs(actual - expected) <= absolute + relative * Math.max(Math.abs(actual), Math.abs(expected));
