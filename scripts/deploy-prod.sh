#!/usr/bin/env bash
# 部署 production 到 Vercel.
#
# 前置需求：
#   - vercel CLI 已登入 (`vercel login`)
#   - 專案已 link (`vercel link`) — 看 .vercel/project.json
#   - production 環境變數 TDX_CLIENT_ID + TDX_CLIENT_SECRET 已設好
#     設定方式：vercel env add TDX_CLIENT_ID production
#
# 使用：
#   bash scripts/deploy-prod.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "== 1/4 檢查 working tree 是否乾淨 =="
if [[ -n "$(git status --porcelain)" ]]; then
  echo "  git working tree 不乾淨，先 commit / stash 再來"
  git status --short
  exit 1
fi
echo "  ✓ 乾淨"

echo
echo "== 2/4 跑 unit tests =="
npx ng test --watch=false

echo
echo "== 3/4 production build (本地驗證) =="
npx ng build

echo
echo "== 4/4 vercel deploy --prod =="
vercel deploy --prod

echo
echo "✓ 部署完成。"
echo "  記得開瀏覽器測：站點/路線出現？等 30 秒看捷運列車有沒有出來？"
