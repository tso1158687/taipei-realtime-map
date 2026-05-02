#!/usr/bin/env bash
# 探一下 THSR (高鐵) 班表相關 endpoint，研究 schema 後設計反推邏輯。
#
# 用法：先確定 vercel dev :3000 有跑，再執行
#   bash scripts/probe-thsr.sh
#
# 把每個 endpoint 的 status + 前 ~300 字 response 印出來，方便研究 shape。

set -euo pipefail
HOST=${HOST:-http://localhost:3000}
TODAY=$(date +%Y-%m-%d)

paths=(
  # 整日班表（每班車 + 每站到離時間）
  "v2/Rail/THSR/DailyTimetable/Today?\$top=2"
  "v2/Rail/THSR/DailyTimetable/OD/0990/1000/$TODAY?\$top=2"
  # 一般班表（無日期版）
  "v2/Rail/THSR/GeneralTimetable?\$top=1"
  # 路線終點站等元資料
  "v2/Rail/THSR/Station?\$top=2"
  # 即時 (應該都沒有)
  "v2/Rail/THSR/AlertInfo?\$top=2"
)

for p in "${paths[@]}"; do
  url="$HOST/api/tdx/$p&\$format=JSON"
  echo "=== $p ==="
  status=$(curl -s -o /tmp/thsr-probe.out -w "%{http_code}" "$url")
  echo "status: $status"
  if [[ "$status" == "200" ]]; then
    head -c 600 /tmp/thsr-probe.out
    echo
  fi
  echo
done
