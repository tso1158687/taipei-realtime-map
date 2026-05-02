#!/usr/bin/env bash
# YouBike endpoint probe.
#
# Usage: with `vercel dev` running on :3000, simply:
#   bash scripts/probe-youbike.sh
#
# Hits the local proxy (which already attaches the OIDC bearer) and reports
# which path variants return 200 / 404 / etc.

set -euo pipefail
HOST=${HOST:-http://localhost:3000}

paths=(
  # v2 — what the app currently uses
  "v2/Bike/Station/Taipei"
  "v2/Bike/Availability/Taipei"
  # v2 with City segment
  "v2/Bike/Station/City/Taipei"
  "v2/Bike/Availability/City/Taipei"
  # v3 — TDX's newer namespace
  "v3/Bike/Station/Taipei"
  "v3/Bike/Availability/Taipei"
  "v3/Bike/Station/City/Taipei"
  "v3/Bike/Availability/City/Taipei"
)

printf "%-6s %s\n" "STATUS" "PATH"
printf "%-6s %s\n" "------" "----"
for p in "${paths[@]}"; do
  url="$HOST/api/tdx/$p?\$top=1&\$format=JSON"
  status=$(curl -s -o /tmp/youbike-probe.out -w "%{http_code}" "$url")
  printf "%-6s /api/tdx/%s\n" "$status" "$p"
  if [[ "$status" == "200" ]]; then
    head -c 120 /tmp/youbike-probe.out
    echo
  fi
done
