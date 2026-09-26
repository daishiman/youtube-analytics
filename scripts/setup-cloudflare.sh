#!/usr/bin/env bash
# Cloudflare リソース（D1・R2・Queues）を冪等に作成する。事前に `pnpm wrangler login` 済みであること。
# 作成済みのリソースはスキップし、最後に wrangler.toml へ入れる database_id を表示する。
set -euo pipefail
cd "$(dirname "$0")/.."

D1_NAME="youtube-analytics-db"
R2_NAME="youtube-analytics-media"
WR="pnpm exec wrangler"

$WR whoami

if $WR d1 list --json | grep -q "\"name\": \"${D1_NAME}\""; then
  echo "D1 ${D1_NAME}: 作成済み"
else
  $WR d1 create "${D1_NAME}"
fi

if $WR r2 bucket list | grep -q "name:\s*${R2_NAME}$"; then
  echo "R2 ${R2_NAME}: 作成済み"
else
  $WR r2 bucket create "${R2_NAME}"
fi

queue_exists() {
  local wanted="$1" page=1 listing
  while :; do
    listing="$($WR queues list --page "$page")" || return 2
    if printf '%s\n' "$listing" | grep -Eq "│[[:space:]]+${wanted}[[:space:]]+│"; then
      return 0
    fi
    # 最後のページの次は表を返さない。全ページを調べてから新規作成を判断する。
    if ! printf '%s\n' "$listing" | grep -q '^┌'; then
      return 1
    fi
    page=$((page + 1))
  done
}

for QUEUE_NAME in "collect-queue" "channel-cleanup-queue" "thumbnail-queue"; do
  if queue_exists "$QUEUE_NAME"; then
    echo "Queue ${QUEUE_NAME}: 作成済み"
  else
    status=$?
    if [ "$status" -ne 1 ]; then
      echo "Queue一覧の取得に失敗しました" >&2
      exit "$status"
    fi
    $WR queues create "${QUEUE_NAME}"
  fi
done

echo "--- wrangler.toml の database_id に設定する値 ---"
$WR d1 list --json | python3 -c "import json,sys;print([d['uuid'] for d in json.load(sys.stdin) if d['name']=='${D1_NAME}'][0])"
