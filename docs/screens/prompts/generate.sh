#!/bin/bash
# 6画面を codex の内蔵画像生成で並列生成し、session dir から PNG を回収する
D="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$D/prompts/logs"; mkdir -p "$LOG"
GEN="${CODEX_HOME:-$HOME/.codex}/generated_images"
SHARED="$D/prompts/_shared.prompt.txt"
[ -f "$SHARED" ] || { echo "shared prompt not found: $SHARED" >&2; exit 1; }
run() {
  slug="$1"
  body="$D/prompts/$slug.prompt.txt"
  [ -f "$body" ] || { echo "screen prompt not found: $body" >&2; return 1; }
  for attempt in 1 2 3; do
    log="$LOG/$slug.$attempt.log"
    instr="Read both $SHARED and $body in full. Treat the shared file as the common design contract and the screen file as the screen-specific body; together they form one prompt. Generate the image using your built-in text-to-image image generation tool (gpt-image). Do NOT draw it with code (no PIL/SVG/HTML screenshots). It must look like a real high-fidelity Japanese web app UI screenshot. Portrait orientation. Save the final PNG to $D/$slug.png. Output only the PNG."
    command codex exec --dangerously-bypass-approvals-and-sandbox "$instr" > "$log" 2>&1 < /dev/null
    sid=$(grep -oiE 'session id[:=]? *[0-9a-f-]{8,}' "$log" | head -1 | grep -oE '[0-9a-f-]{8,}$')
    if [ -f "$D/$slug.png" ] && head -c4 "$D/$slug.png" | xxd -p | grep -q '^89504e47'; then echo "$slug OK(saved)"; return; fi
    if [ -n "$sid" ] && [ -d "$GEN/$sid" ]; then
      src=$(ls -t "$GEN/$sid"/*.png 2>/dev/null | head -1)
      if [ -n "$src" ] && head -c4 "$src" | xxd -p | grep -q '^89504e47'; then cp "$src" "$D/$slug.png"; echo "$slug OK(recovered)"; return; fi
    fi
    echo "$slug retry $attempt"
  done
  echo "$slug FAILED"
}
SLUGS="${*:-01-login 02-dashboard 03-ai-analysis 04-actions 05-settings 06-videos}"
for s in $SLUGS; do run "$s" & done
wait
