# report-design-system 取込記録

- 取込日: 2026-09-25
- 取込元: `/Users/dm/dev/dev/TireMind/平賀運送/hiragaunsou-vehicle-pl-extracted/.claude/skills/report-design-system`
- 取込元 commit: `c492ca0dd714667be503d64a27b88938259efc16` (2026-09-18) + 未コミット作業ツリー (M 9件・D `scripts/sync-kit-colors.mjs`)。取込内容は取込時点の作業ツリーと `diff -r` 一致。
- 取込方式: vendoring (無改変コピー)。vendor CSS は `assets/vendor/SOURCE.json` の sha256 で検証される (aidd-agent-kit 1.11.0 / b8399d4)。
- 取込後検証: `node scripts/selftest.mjs` 合格 / `node scripts/smoke-test.mjs` 合格 (Node v22.21.1)。
- 用途: `/yt-analyze` の統計分析 (記述・比較・分解・仮説の反証スクリーニング) と単一 HTML レポート生成。因果推論・予測は対象外。
- 更新方法: 取込元と `diff -r` で差分を確認し、無改変のまま丸ごと差し替える。本スキルを直接編集しない (YouTube 向けの差分は呼出し側 `/yt-analyze` と brief.json / analysis.mjs で表現する)。
