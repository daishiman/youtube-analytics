#!/usr/bin/env bash
# Cloudflare リソース（D1・R2・Queues）を冪等に作成する。事前に `pnpm wrangler login` 済みであること。
# 作成済みのリソースはスキップし、最後に wrangler.toml へ入れる database_id を表示する。
set -euo pipefail
cd "$(dirname "$0")/.."

D1_NAME="youtube-analytics-db"
R2_NAME="youtube-analytics-media"
QUEUE_NAME="collect-queue"
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

if $WR queues list | grep -q " ${QUEUE_NAME} "; then
  echo "Queue ${QUEUE_NAME}: 作成済み"
else
  $WR queues create "${QUEUE_NAME}"
fi

echo "--- wrangler.toml の database_id に設定する値 ---"
$WR d1 list --json | python3 -c "import json,sys;print([d['uuid'] for d in json.load(sys.stdin) if d['name']=='${D1_NAME}'][0])"
