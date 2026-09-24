/** 画面の選択欄とサーバの受付判定が共有するファイル形式・サイズ。 */
export const IMPORT_RULES = {
  csv: { exts: [".csv"], maxBytes: 5 * 1024 * 1024, label: "CSV" },
  caption: { exts: [".srt", ".vtt"], maxBytes: 1024 * 1024, label: "字幕" },
  image: { exts: [".png", ".jpg", ".jpeg", ".webp"], maxBytes: 10 * 1024 * 1024, label: "画像" },
} as const;

export type ImportKind = keyof typeof IMPORT_RULES;
