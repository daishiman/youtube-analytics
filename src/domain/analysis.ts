// AI分析（依頼・スキル連携・取込）の語彙と上限。サーバ・画面・テストが同じ値を引く。
// スキル側（.claude/skills/yt-analyze の .mjs）は TS を import できないため、同じ値の一致はテストで確かめる

/** 集約『分析依頼』の状態。待機中 → 実行中 → 完了|失敗|取消 の一方向（migrations の CHECK と同じ集合） */
export const REQUEST_STATUSES = ["待機中", "実行中", "完了", "失敗", "取消"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** 取消できる（まだ終わっていない）状態 */
export const ACTIVE_STATUSES = ["待機中", "実行中"] as const satisfies readonly RequestStatus[];
/** 再実行できる状態 */
export const RETRYABLE_STATUSES = ["失敗", "取消"] as const satisfies readonly RequestStatus[];

export const isActiveStatus = (s: string): s is (typeof ACTIVE_STATUSES)[number] =>
  (ACTIVE_STATUSES as readonly string[]).includes(s);
export const isRetryableStatus = (s: string): s is (typeof RETRYABLE_STATUSES)[number] =>
  (RETRYABLE_STATUSES as readonly string[]).includes(s);

/** 依頼の作成経路（画面・スキルの自動作成・画面の結果取込） */
export const CREATED_VIA = ["web", "skill", "import"] as const;
export type CreatedVia = (typeof CREATED_VIA)[number];
export const CREATED_VIA_LABELS: Record<CreatedVia, string> = {
  web: "画面",
  skill: "自動",
  import: "取込",
};

/** 進捗の段（stage 1〜3。0 は未着手） */
export const STAGE_LABELS = ["", "データ取得", "分析・HTML生成", "反映"] as const;

/** 補足指示の最大文字数 */
export const INSTRUCTION_MAX = 1000;

/** 文字数（サロゲートペアを1文字と数える。サーバの上限検査と画面のカウンタで同じ数え方にする） */
export const countChars = (s: string): number => Array.from(s).length;

/** スキル API の版（X-Skill-Api-Version）。互換の無い変更をしたら上げる */
export const SKILL_API_VERSION = "1";

/** 結果 JSON を受ける本文の上限（スキルの POST と画面の取込で共通。report_html 2MB を含めて収まる大きさ） */
export const REPORT_BODY_MAX_BYTES = 3_500_000;
