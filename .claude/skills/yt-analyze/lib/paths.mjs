// /yt-analyze と report-design-system の場所（pipeline.mjs・render.mjs が共用する）。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** .claude/skills/yt-analyze */
export const SKILL_HOME = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** report-design-system の場所（既定は yt-analyze と同じ skills ディレクトリ。環境変数 RDS_HOME で上書き可） */
export const RDS_HOME = process.env.RDS_HOME ? resolve(process.env.RDS_HOME) : resolve(SKILL_HOME, "..", "report-design-system");
/** report-design-system の scripts/ にあるファイル（report.mjs・compose.mjs など） */
export const rdsScript = (file) => join(RDS_HOME, "scripts", file);
