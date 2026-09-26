#!/usr/bin/env bash
# 週次 AI 分析の起動スクリプト（launchd の com.youtube-analytics.weekly-analysis から毎週月曜 09:00 JST に呼ばれる）。
#
#   ops/launchd/run-weekly-analysis.sh [--request-id A-0001] [--dry-run]
#
# - 通常は依頼IDを渡さずに `claude -p "/yt-analyze"` を起動する。依頼はスキルが POST /api/skill/requests で作る
#   （このスクリプトはアプリの API を直接呼ばない）。
# - トークンは環境変数 YTA_SKILL_TOKEN、無ければ macOS キーチェーン（サービス名 youtube-analytics-skill）から読む。
#   トークンの値はログに出さない。
# - --dry-run は前提（トークン・claude・リポジトリ）を確かめ、実行するコマンドを表示するだけで終わる。
#
# 設定できる環境変数:
#   YTA_REPO_ROOT            リポジトリ直下（既定: このスクリプトの2つ上）
#   YTA_BASE_URL             アプリの URL（既定はスキル側の http://localhost:8791）
#   YTA_LOG_DIR              ログの置き場（既定: ~/Library/Logs/youtube-analytics）
#   YTA_LOG_RETENTION_DAYS   実行ログを残す日数（既定: 90）
#   YTA_KEYCHAIN_SERVICE     キーチェーンのサービス名（既定: youtube-analytics-skill）
#   CLAUDE_BIN               claude コマンドの場所（既定: PATH から探す）
#   YTA_CLAUDE_ALLOWED_TOOLS claude -p に許可するツール（既定: スキル CLI の node 実行と Read）
#   YTA_NOTIFY               1 なら失敗時に macOS の通知を出す（既定: 1。外部送信はしない）
#
# 終了コード:
#   0  成功
#   2  引数の誤り
#   10 トークンが見つからない
#   11 claude コマンドが見つからない
#   12 前回の実行がまだ終わっていない（多重起動の防止）
#   13 リポジトリまたはスキルが見つからない
#   20 claude は終了したが、スキルの終了コード（YT_ANALYZE_EXIT=）を読み取れない
#   それ以外  スキル（yt-analyze.mjs）の終了コード（1=その他 3=接続不可 4=401・403 5=404 6=取消）または claude の終了コード
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${YTA_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
LOG_DIR="${YTA_LOG_DIR:-$HOME/Library/Logs/youtube-analytics}"
RETENTION_DAYS="${YTA_LOG_RETENTION_DAYS:-90}"
KEYCHAIN_SERVICE="${YTA_KEYCHAIN_SERVICE:-youtube-analytics-skill}"
ALLOWED_TOOLS="${YTA_CLAUDE_ALLOWED_TOOLS:-Bash(node .claude/skills/yt-analyze/scripts/yt-analyze.mjs:*) Read}"
NOTIFY="${YTA_NOTIFY:-1}"

REQUEST_ID=""
DRY_RUN=0

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --request-id)
      [[ $# -ge 2 && -n "$2" ]] || { echo "引数の誤り: --request-id に値がありません" >&2; exit 2; }
      REQUEST_ID="$2"; shift 2 ;;
    --request-id=*)
      REQUEST_ID="${1#*=}"; shift ;;
    --dry-run)
      DRY_RUN=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "引数の誤り: 不明な引数 $1" >&2; exit 2 ;;
  esac
done
if [[ -n "$REQUEST_ID" && ! "$REQUEST_ID" =~ ^A-[0-9]{4,}$ ]]; then
  echo "引数の誤り: --request-id は A-0001 の形で指定してください（指定: ${REQUEST_ID}）" >&2
  exit 2
fi

mkdir -p "$LOG_DIR"
RUN_ID="$(TZ=Asia/Tokyo date +%Y%m%d-%H%M%S)"
RUN_LOG="$LOG_DIR/weekly-analysis-$RUN_ID.log"
exec > >(tee -a "$RUN_LOG") 2>&1

log() { printf '%s [weekly-analysis] %s\n' "$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M:%S JST')" "$*"; }

notify_failure() {
  local code="$1"
  printf '%s exit=%s log=%s\n' "$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M:%S JST')" "$code" "$RUN_LOG" > "$LOG_DIR/last-failure.txt"
  if [[ "$NOTIFY" == "1" && "$DRY_RUN" == "0" ]] && command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"週次 AI 分析が失敗しました（終了コード ${code}）。ログ: $RUN_LOG\" with title \"YouTube分析\"" >/dev/null 2>&1 || true
  fi
}

LOCK_DIR="$LOG_DIR/weekly-analysis.lock"
LOCKED=0
finish() {
  local code=$?
  if [[ "$LOCKED" == "1" ]]; then rmdir "$LOCK_DIR" 2>/dev/null || true; fi
  if [[ "$code" -eq 0 ]]; then
    log "終了: 成功（終了コード 0）"
    rm -f "$LOG_DIR/last-failure.txt"
  else
    log "終了: 失敗（終了コード ${code}）。ログ: $RUN_LOG"
    notify_failure "$code"
  fi
  # 古い実行ログを片付ける（このスクリプトが作ったものだけ）
  find "$LOG_DIR" -maxdepth 1 -name 'weekly-analysis-*.log' -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
  exit "$code"
}
trap finish EXIT

log "開始: repo=$REPO_ROOT request_id=${REQUEST_ID:-（なし: スキルが依頼を作る）} dry_run=$DRY_RUN"

# ---- 前提の確認 ----
if [[ ! -f "$REPO_ROOT/.claude/skills/yt-analyze/SKILL.md" ]]; then
  log "エラー: スキルが見つかりません: $REPO_ROOT/.claude/skills/yt-analyze/SKILL.md（YTA_REPO_ROOT を確認してください）"
  exit 13
fi

if [[ -z "${YTA_SKILL_TOKEN:-}" ]]; then
  if command -v security >/dev/null 2>&1 && YTA_SKILL_TOKEN="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)"; then
    log "トークン: キーチェーン（サービス名 ${KEYCHAIN_SERVICE}）から読みました"
  else
    YTA_SKILL_TOKEN=""
  fi
else
  log "トークン: 環境変数 YTA_SKILL_TOKEN を使います"
fi
if [[ -z "$YTA_SKILL_TOKEN" ]]; then
  log "エラー: トークンが見つかりません。YTA_SKILL_TOKEN を設定するか、キーチェーンに登録してください（ops/launchd/README.md）"
  exit 10
fi
if [[ ! "$YTA_SKILL_TOKEN" =~ ^yta_ ]]; then
  log "エラー: トークンの形式が違います（yta_ で始まる個人トークンが必要です）"
  exit 10
fi
export YTA_SKILL_TOKEN
[[ -n "${YTA_BASE_URL:-}" ]] && export YTA_BASE_URL

CLAUDE="${CLAUDE_BIN:-$(command -v claude || true)}"
if [[ -z "$CLAUDE" || ! -x "$CLAUDE" ]]; then
  log "エラー: claude コマンドが見つかりません（CLAUDE_BIN か plist の PATH を確認してください）"
  exit 11
fi

PROMPT="/yt-analyze"
[[ -n "$REQUEST_ID" ]] && PROMPT="/yt-analyze --request-id $REQUEST_ID"
PROMPT="$PROMPT
実行後、最後の行に yt-analyze.mjs の終了コードを YT_ANALYZE_EXIT=<数字> の形で1行だけ出力してください。"

log "実行するコマンド: (cd $REPO_ROOT && $CLAUDE -p \"${PROMPT%%$'\n'*}\" --allowedTools \"$ALLOWED_TOOLS\")"
if [[ "$DRY_RUN" == "1" ]]; then
  log "dry-run: 前提はそろっています。claude は起動しません"
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "エラー: 前回の実行が終わっていません（${LOCK_DIR}）。実行中でなければこのフォルダを削除してから再実行してください"
  exit 12
fi
LOCKED=1

# ---- 実行 ----
CLAUDE_OUT="$LOG_DIR/weekly-analysis-$RUN_ID.claude.txt"
set +e
( cd "$REPO_ROOT" && "$CLAUDE" -p "$PROMPT" --allowedTools "$ALLOWED_TOOLS" ) > "$CLAUDE_OUT" 2>&1
CLAUDE_CODE=$?
set -e
cat "$CLAUDE_OUT"
SKILL_CODE="$(grep -Eo 'YT_ANALYZE_EXIT=[0-9]+' "$CLAUDE_OUT" | tail -n 1 | cut -d= -f2 || true)"
rm -f "$CLAUDE_OUT"

if [[ "$CLAUDE_CODE" -ne 0 ]]; then
  log "エラー: claude が終了コード $CLAUDE_CODE で終わりました"
  exit "$CLAUDE_CODE"
fi
if [[ -z "$SKILL_CODE" ]]; then
  log "エラー: スキルの終了コード（YT_ANALYZE_EXIT=）を出力から読み取れません"
  exit 20
fi
if [[ "$SKILL_CODE" -ne 0 ]]; then
  log "エラー: /yt-analyze が終了コード $SKILL_CODE で失敗しました（4=トークンの権限 5=依頼が見つからない など。SKILL.md 参照）"
  exit "$SKILL_CODE"
fi
exit 0
