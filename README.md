# 台北即時交通 3D 地圖

仿 [Mini Tokyo 3D](https://github.com/nagix/mini-tokyo-3d) 的台北版本：把整個雙北 +
桃園 + 基隆地區的軌道、公車、共享單車即時動態整合到同一張地圖上。

> 純前端 + Vercel serverless：一份 Angular 21 應用接 TDX（運輸資料流通服務）
> 與 OpenStreetMap，沒有自家後端、沒有資料庫。

## 功能

- **捷運（Metro）** — 台北捷運（TRTC）+ 桃園捷運（TYMC）：站點、路線、即時列車
  位置（每 15s 從 LiveBoard 同步）
- **台鐵（TRA）** — 全省靜態路網 + TrainLiveBoard 即時車次（每 30s）
- **高鐵（THSR）** — 西部全線靜態路網（V2 沒提供 GPS，班表反推位置在
  Phase 8.C ROADMAP 中）
- **公車** — 台北 / 新北 / 桃園 / 基隆 4 都，路線 + 站牌 + A1 GPS 即時點位 +
  ETA 預估 popup
- **YouBike** — 4 都站點，每 30s 即時可借 / 可還車數，依車數變色
- **互動** — 中／英切換、layer 開關、地下模式、跨 mode 路線搜尋、列車追蹤鏡頭

## 快速開始

```bash
git clone <this repo>
cd taipei-realtime-map
npm install
```

接著走 [`docs/SETUP.md`](docs/SETUP.md) 申請 TDX 金鑰、用 `vercel env pull` 拉
環境變數，再 `vercel dev` 就能跑：

```bash
vercel dev   # 預設 :3000
```

## 技術棧

| 層 | 用什麼 |
| -- | -- |
| 前端 | Angular 21（standalone、signals、OnPush、zoneless） |
| 地圖 | MapLibre GL（OSM raster 預設、可切 MapTiler vector） |
| 即時資料 | TDX V2 / V3 REST API |
| 代理層 | Vercel Serverless Functions（保護 OIDC token、伺服器端 token bucket、in-memory cache） |
| 測試 | Vitest + Angular HttpClientTesting（17 spec 檔 / 86 tests） |

## 部署到 Vercel

```bash
# 一次性
vercel link
vercel env add TDX_CLIENT_ID production
vercel env add TDX_CLIENT_SECRET production
# （preview 環境也建議加同一組）

# 部署
vercel deploy --prod
```

詳細設定見 [`docs/SETUP.md`](docs/SETUP.md) §4。

## 速率限制怎麼處理

TDX 免費 tier 大約 5 reqs / 10s。本專案分三層擋：

1. **客戶端 24h localStorage cache**（`core/tdx/client-cache.ts`）— 站點 / 路線 /
   Shape 等靜態資料只在第一次載入時打 server，之後 24 小時內全部本地命中。
2. **客戶端 token bucket**（`core/tdx/scheduler.ts`）— 把所有 TDX 請求排成
   每 ~3.7 秒一個的序列。
3. **伺服器端 token bucket**（`api/_lib/scheduler.ts`）— 跨多 tab / HMR 重 inject
   時的 single source of truth。每 2.5 秒釋放一個 token，撞 429 自動冷卻 10 秒。

詳細決策過程記在 [`docs/DECISIONS.md`](docs/DECISIONS.md) D-013 ~ D-018。

## 專案結構

```
api/                     Vercel serverless functions
├── _lib/
│   ├── cache.ts         in-memory response cache
│   ├── scheduler.ts     server-side token bucket
│   └── tdx-token.ts     OIDC client_credentials helper
├── tdx.ts               主 proxy（/api/tdx/* → upstream TDX）
└── health.ts            /api/health 探活

src/app/
├── core/                共用 infra（map、tdx、i18n、layer-state、tracking、search…）
└── features/
    ├── metro/           捷運靜態 + LiveBoard 列車
    ├── bus/             公車 + 即時 GPS + ETA
    ├── rail/            台鐵 + 高鐵 + TRA TrainLiveBoard
    └── youbike/         YouBike 站點 + 即時可借車數

docs/
├── SETUP.md             詳細設定、環境變數、故障排除
├── ROADMAP.md           Phase 定義 + 各 phase 範疇決議
├── DECISIONS.md         逐項設計決策紀錄（D-001 起）
└── ASSESSMENT.md        對標 mini-tokyo-3d 的差異分析
```

## 限制

- **高鐵沒有即時 GPS**：TDX V2 沒這個 API，目前只有靜態路網。
- **TDX 免費配額**：所有訪客共用同一組 Client ID，遇到流量爆炸會觸發 429
  cooldown，前端會優雅降級（用 localStorage cache 撐著）。
- **MapTiler 免費 tier**：10 萬 tile loads/月，超過會 fallback 回 OSM raster。

## 鳴謝

- [Mini Tokyo 3D](https://github.com/nagix/mini-tokyo-3d) — 設計靈感與架構參考
- [TDX 運輸資料流通服務](https://tdx.transportdata.tw/) — 提供所有即時資料
- [MapLibre GL](https://maplibre.org/) / [OpenStreetMap](https://www.openstreetmap.org/) —
  地圖底圖

## License

MIT。隨便拿去用、改、商業用都歡迎。

## 開發指令

```bash
npm start            # ng serve (port 4200，純 Angular 不含 serverless)
npm run build        # production build
npm test             # vitest unit tests
npm run check:api    # 對 /api/ 程式碼跑 TypeScript 型別檢查
vercel dev           # 含 serverless functions 的本機 server (port 3000)
```
