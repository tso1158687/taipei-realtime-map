# 開發環境設定

## 1. 取得 TDX 憑證

1. 到 [TDX 運輸資料流通服務](https://tdx.transportdata.tw/) 註冊會員（個人 / 學術）。
2. 登入後進入「會員中心 → API 金鑰管理」。
3. 點「新增金鑰」，取得 **Client ID** 與 **Client Secret**（一個帳號最多 3 組）。
4. 免費方案：50 req/sec、50,000 calls/day。

> Client Secret 只會在建立時顯示一次，記得馬上複製到密碼管理器。

## 2. 本機環境設定

> ⚠️ **不要手動建立 `.env.local`**。Vercel CLI 對手寫的檔案有時不會
> 注入到 function runtime，會造成 `/api/health` 一直回 `hasCredentials:
> false`。請走下面的官方流程，由 `vercel env pull` 寫出檔案。

```bash
# 一次性：把 Vercel CLI 裝起來、登入、把專案連到雲端
npm install -g vercel
vercel login
vercel link
```

接著把憑證設到雲端 development 環境，再拉回本機：

```bash
vercel env add TDX_CLIENT_ID development
# 互動式：把 Client ID 貼進去 enter

vercel env add TDX_CLIENT_SECRET development
# 互動式：把 Client Secret 貼進去 enter

# 由 Vercel 寫出 .env.local（這個格式 vercel dev 必讀）
vercel env pull .env.local --environment=development
```

> `.env.local` 已在 `.gitignore` 內，**永遠不要 commit**。
>
> 這個流程的好處：(1) 雲端與本機同源；(2) 之後跨機器或新成員上手只
> 需 `vercel env pull` 一行就能跑起來；(3) `vercel deploy` 預覽 / 上線
> 自動帶上同一組憑證。

`.env.local.example` 只是格式範本，**不再建議直接 cp**。

## 3. 本機開發

兩種跑法：

### 3.1 純 Angular dev server（不含 serverless functions）

```bash
npm start
# 開 http://localhost:4200
```

這個模式下 `/api/*` 不會運作。適合單純做 UI / 樣式調整。

### 3.2 Vercel CLI（含 serverless functions，最接近 production）

```bash
# 一次性
npm install -g vercel
vercel login
vercel link  # 把本地專案連到 Vercel 專案

# 每次開發
vercel dev
# 開 http://localhost:3000
```

`vercel dev` 會同時跑 Angular 與 `/api/*` 路由，並自動讀取 `.env.local`。

### 3.3 驗證 TDX 憑證

啟動後（不論哪種模式，但 `/api/*` 需要 `vercel dev`）：

```bash
curl http://localhost:3000/api/health
```

預期回應：

```json
{
  "ok": true,
  "hasCredentials": true,
  "tokenAcquired": true,
  "tokenLength": 1234,
  "timestamp": "2026-05-01T..."
}
```

如果 `ok: false`，看 `error` 欄位排查：
- `TDX_CLIENT_ID and/or TDX_CLIENT_SECRET are not set` → `.env.local` 沒讀到
- `TDX token exchange failed: 401` → 憑證錯了，回 TDX 會員中心檢查

驗證 proxy 能讀到實際資料：

```bash
curl 'http://localhost:3000/api/tdx/v3/Rail/Metro/Network/TRTC?$top=1&$format=JSON'
```

應回傳台北捷運路網結構 JSON。

## 4. 部署到 Vercel

```bash
vercel              # preview 部署
vercel --prod       # production 部署
```

部署前在 Vercel Dashboard → Project → Settings → Environment Variables 設定：

| Key | Value |
| --- | --- |
| `TDX_CLIENT_ID` | 你的 Client ID |
| `TDX_CLIENT_SECRET` | 你的 Client Secret |

兩個都標記 `Production`、`Preview`、`Development` 都套用即可。

## 5. 常用指令

```bash
npm start            # ng serve (port 4200)
npm run build        # production build
npm test             # vitest unit tests
npm run check:api    # 對 /api/ 程式碼跑 TypeScript 型別檢查
vercel dev           # 含 serverless functions 的本機 server
```

## 6. 故障排除

| 症狀 | 排查方向 |
| --- | --- |
| `/api/health` 回 503 | `.env.local` 內容空 / Vercel env vars 未設 |
| `/api/health` 回 502，error 含 `401` | TDX Client ID / Secret 錯誤 |
| `/api/tdx/...` 回 429 | TDX 配額超量；檢查呼叫頻率 |
| `/api/tdx/...` 回 502 + `Upstream TDX fetch failed` | 網路問題或 TDX 服務本身異常 |
| Vercel build 失敗：`tsc -p tsconfig.api.json` | 在 `/api` 用了 `any` 或型別錯誤；本機跑 `npm run check:api` 修正後再 push |
