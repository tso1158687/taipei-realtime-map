# 台北即時交通 3D 地圖 — 可行性評估與規劃

> 參考專案：[`mini-tokyo-3d`](https://github.com/nagix/mini-tokyo-3d)（v4.0.0-beta.2）
> 目標：在 `taipei-realtime-map`（Angular 21）上做一個台北版本
> 評估日期：2026-05-01

---

## 1. 現況快照

### 來源專案 `mini-tokyo-3d`
- **技術棧**：vanilla JS（無 TS）+ Rollup + Mapbox GL v3 + Three.js + Deck.gl + Turf.js
- **資料來源主軸**：日本 ODPT（Public Transportation Open Data Center）+ 自建後端 `mini-tokyo.appspot.com`
- **核心特色**：
  - 火車 / 飛機 即時 3D 動畫（Three.js 自製 car geometry）
  - 班次表 + 即時位置插值動畫
  - 路線搜尋、地下模式、回放模式、軌道追蹤
  - 11 種語言 i18n
- **架構優點**：資料層與渲染層分離乾淨；可以只換掉 loader 而保留 Animation / Three.js 渲染

### 目標專案 `taipei-realtime-map`
- 完全空的 Angular 21 CLI scaffold（只有 `app.ts` + `app.routes.ts`）
- 已配置：Tailwind 4、Vitest、Prettier、TypeScript strict
- `.claude/CLAUDE.md` 規範：standalone components、signals、`OnPush`、reactive forms、避免 `any`

### 結論
**不是「把 mini-tokyo-3d 改個座標」這麼簡單** — 這是「拿 mini-tokyo-3d 的概念，用 Angular + 台灣資料源重寫」。但好消息是核心動畫與 3D 渲染邏輯可以以函式庫方式抽出沿用。

---

## 2. mini-tokyo-3d 功能拆解 vs 台北可實作度

| 功能 | mini-tokyo-3d 來源 | 台北可用資料 | 可行性 |
|---|---|---|---|
| **捷運即時列車位置** | ODPT `odpt:Train` (15 秒更新) | TDX `Rail/Metro/LiveBoard/TRTC`（站別到離站看板）+ 推算 | 🟡 中等：台北捷運**沒有**逐車 GPS，只有站別到離站訊號，需要由 LiveBoard 反推位置插值 |
| **台鐵即時列車位置** | — | TDX `Rail/TRA/TrainLiveBoard`（區間） + `data.gov.tw` 動態座標資料集 | 🟢 高：台鐵有 GPS 動態資料 |
| **高鐵即時列車位置** | — | TDX `Rail/THSR/DailyTimetable` + 站別到離站 | 🟡 中等：類捷運狀況，無逐車 GPS |
| **公車即時位置** | — | TDX `Bus/RealTimeByFrequency/City/Taipei` (A1/A2 GPS 點位) | 🟢 高：A1 即為車輛 GPS 即時座標 |
| **靜態車站 / 路線資料** | 自製 stations.json / railways.json | TDX `Metro/Network`、`Metro/Station`、`Metro/StationOfLine`、`Bus/Route`、`Rail/Station` | 🟢 高：直接用 TDX，需要轉換成內部格式 |
| **班次表（時刻表）** | 自製 timetable.json | TDX `Metro/StationTimeTable`、`Rail/TRA/GeneralTrainTimetable`、GTFS dump | 🟢 高 |
| **3D 軌道幾何** | 自製 features.json (GeoJSON + geobuf) | TDX `Metro/Shape`、`Bus/Shape`、`Rail/RailwayShape` 提供 LineString | 🟢 高 |
| **3D 建築物** | 自製建築物 geometry | OSM building footprints + height（MapTiler / Overture Maps） | 🟢 高 |
| **航班** | 自製 flight + ATIS 後端 | TDX `Air/Flight/{TPE,TSA,RMQ,KHH}` 提供進離港但**無逐機 GPS** | 🔴 低：除非串 OpenSky / FlightRadar24（要錢），不然只能畫航班表 |
| **路線搜尋** | 自製 search 後端 | 需自建（用 Dijkstra / A\* on TDX network） | 🟡 中等：演算法不難，但需要自己做 |
| **地圖底圖** | Mapbox GL（要 token） | MapLibre GL + MapTiler / OSM tiles（免費或低成本） | 🟢 建議改用 MapLibre 避開 Mapbox 計費 |
| **i18n（zh-TW、en、ja）** | 11 語言字典 | 直接套用既有架構，新增 zh-TW 條目 | 🟢 高 |

**主要落差**：台北捷運／高鐵不像東京 JR / 私鐵公開逐車 GPS，**列車在路線上的精確位置必須靠「最近站別 + 預估到離站時間」反推**。這會讓動畫精度比東京版差，但仍可看出「列車正在 X 站到 Y 站之間」這種粒度。

---

## 3. TDX API 串接重點

### 認證方式
- 註冊 TDX 會員 → 取得 `Client ID` + `Client Secret`（最多 3 組）
- 使用 OIDC Client Credentials flow：
  ```
  POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token
  grant_type=client_credentials&client_id=...&client_secret=...
  ```
- 拿到 `access_token`（JWT，1 天有效）→ 帶 `Authorization: Bearer <token>` 呼叫 API
- 免費方案 50 次/秒、5 萬次/日（足夠）

### 主要會用到的 endpoints（V3 Swagger）
- `GET /v3/Rail/Metro/LiveBoard/TRTC` — 台北捷運站別到離站
- `GET /v3/Rail/Metro/Network/TRTC` — 路網結構
- `GET /v3/Rail/Metro/Shape/TRTC` — 路線 GeoJSON
- `GET /v3/Rail/Metro/Station/TRTC` — 車站靜態資料 + 座標
- `GET /v3/Rail/TRA/TrainLiveBoard` — 台鐵即時
- `GET /v3/Bus/RealTimeByFrequency/City/Taipei` — 公車 GPS（A1）
- `GET /v3/Bus/EstimatedTimeOfArrival/City/Taipei` — 公車預估到站

### 更新頻率建議
- 捷運 LiveBoard：每 10–15 秒輪詢
- 公車 A1：每 20 秒
- 台鐵：每 30 秒
- 靜態資料：啟動載入一次 + 每日刷新

---

## 4. 建議技術架構（Angular 版）

```
src/app/
├── core/
│   ├── tdx/                      # TDX API client (signals + RxJS)
│   │   ├── tdx-auth.service.ts   # OIDC token 快取與自動刷新
│   │   ├── tdx-metro.service.ts  # 捷運 endpoints
│   │   ├── tdx-rail.service.ts   # 台鐵 / 高鐵
│   │   ├── tdx-bus.service.ts    # 公車
│   │   └── models/               # TypeScript 型別 (從 Swagger 產生)
│   ├── map/
│   │   ├── map.service.ts        # MapLibre GL 包裝
│   │   ├── three-layer.ts        # Three.js custom layer (移植自 mini-tokyo-3d)
│   │   └── animation.service.ts  # 列車動畫插值引擎
│   └── i18n/
│       └── dictionary-zh-TW.json
├── features/
│   ├── metro/                    # 捷運模組（lazy loaded）
│   ├── bus/                      # 公車模組（lazy loaded）
│   ├── rail/                     # 台鐵 / 高鐵模組（lazy loaded）
│   └── search/                   # 路線搜尋
├── ui/
│   ├── controls/                 # zoom, compass, layer toggle
│   ├── panels/                   # train-detail, station-detail
│   └── popups/
└── app.ts
```

### 關鍵技術選擇
| 選擇 | 理由 |
|---|---|
| **MapLibre GL** 取代 Mapbox GL | 免 token、相容 Mapbox style；Mapbox 從 v2 開始要付費 |
| **Three.js** 直接沿用 | mini-tokyo-3d 的 car geometry 與動畫引擎可以直接抽出包成 Angular service |
| **signals** 管 UI 狀態，**RxJS** 管資料流 | 符合 Angular 21 慣例與 `.claude/CLAUDE.md` 規範 |
| **Web Worker** 做幾何計算 | 與 mini-tokyo-3d 一致，避免主執行緒卡頓 |
| **Tailwind 4** 做 UI | 已配置好；直接用 utility class |
| **TDX token 走 server proxy 或 dev-only env** | Client ID/Secret **不能** bundle 到前端，需要後端中繼或 build-time 注入 access token |

### 安全性風險
TDX 的 Client Secret 如果直接放前端會被偷。三個選項：
1. **後端 proxy**（推薦長期方案）：自建 Node/Cloudflare Worker，前端只打自己後端
2. **Functions-as-a-Service**（Vercel / Netlify Functions）做 token 交換
3. **本機開發階段**：用 `environment.ts` 注入，不入版控（`.gitignore`）

---

## 5. 建議的實作路線圖

| 階段 | 目標 | 預估範疇 |
|---|---|---|
| **Phase 0：基礎建置** | TDX 認證打通 + 第一支 API 在 Angular 印出捷運站列表 | TDX auth service、environment 配置、第一個 service + signal |
| **Phase 1：2D 基本地圖** | MapLibre 顯示台北 + 捷運站 marker + 路線 polyline | map.service、metro.service、shape 載入 |
| **Phase 2：捷運即時 LiveBoard** | 站別即時看板（先不做動畫，用 marker 閃爍 / 列表） | LiveBoard 輪詢、UI panel |
| **Phase 3：公車即時 GPS** | 公車 A1 點位在地圖上動 | RealTimeByFrequency 輪詢、marker 動畫 |
| **Phase 4：3D 列車模型** | 移植 Three.js layer + car geometry | 整合 mini-tokyo-3d/src/layers + animation |
| **Phase 5：班次表反推位置** | 把 LiveBoard + 班次表組合成連續的捷運列車動畫 | 插值演算法 |
| **Phase 6：搜尋 / 追蹤 / 地下模式** | 進階互動 | 路徑演算法、UI panels |
| **Phase 7：i18n、a11y、效能** | WCAG AA、AXE 通過、prod build < 1MB | 字典、focus management、bundle 分析 |

---

## 6. 決策結論（2026-05-01 確認）

| # | 議題 | 決議 | 影響 |
|---|---|---|---|
| 1 | TDX API Key 處理 | **Vercel / Netlify Functions proxy** | 需要建一個 `/api/tdx/*` 的 serverless function，負責 OIDC token 換取 + 快取 + 轉發。Client Secret 永遠在 server side。 |
| 2 | 底圖供應商 | **MapLibre GL + OSM raster** | 免 key、免費；但**沒有 3D 建築物**（vector tile 才有樓高資料）。3D 列車不受影響。 |
| 3 | MVP 範疇 | **全部一次來**：台北捷運 + 桃園捷運 + 台北 / 新北公車 + 台鐵 + 高鐵 | 用 Angular lazy-loaded feature modules 切：`features/metro`、`features/bus`、`features/rail`。 |
| 4 | 3D 列車模型 | **要做**（移植 mini-tokyo-3d 的 Three.js layer） | 把 mini-tokyo-3d/src/layers/three-layer.js + car-geometry.js + animation.js 抽出來包成 Angular core service。 |
| 5 | 航班 | **不做** | TDX Air endpoint 不串。少一個 feature module。 |
| 6 | 部署平台 | **Vercel** | Functions 寫在 `/api/`，Angular build artefact 放在 `dist/`，用 Vercel CLI 一鍵 deploy。 |
| 7 | TDX 認證 | 使用者已有 Client ID + Secret | 以 Vercel env vars (`TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`) 注入；本機開發放 `.env.local`（gitignored）。 |

### 衍生影響
- 沒有 3D 建築物（決議 2）→ 視覺上「列車在平面地圖上跑 3D 模型」，比 mini-tokyo 簡樸但仍有立體感
- 範疇大（決議 3）+ 3D（決議 4）→ 預估會跨多個 session，需要嚴格分階段交付才不會卡住

---

## 6.5 測試策略

| 層 | 工具 | 怎麼測 | 何時加 |
|---|---|---|---|
| **純邏輯 services**（座標插值、班次反推、TDX URL 組合） | Vitest（已配置） | 純函式、好測，覆蓋率目標 ≥ 80% | 每寫一個 service 一起寫 `.spec.ts` |
| **HTTP services**（TDX clients） | Vitest + `provideHttpClientTesting` | mock HTTP，驗證 URL、headers、錯誤路徑、token 過期重試 | 每個 service 一起寫 |
| **Component**（panel、popup、controls） | Vitest + `@angular/core/testing` TestBed | 渲染驗證、signal 互動、a11y attribute 檢查 | UI feature 完成時補 |
| **Map / Three.js layer** | smoke test 為主（驗證可建構、layer add 不爆） | jsdom 對 WebGL 不友善，深度 visual 測試需 e2e | 移植時加最小 smoke |
| **i18n** | snapshot test 字典 keys 在每個語言都齊全 | 防止漏譯 | 加新字串時自動驗 |
| **E2E** | 暫不導入；之後可選 Playwright | 整合驗證 ng serve + proxy 全套流程 | Phase 7 再考慮 |

**約定**：每個 `*.service.ts` / `*.ts` 含邏輯都要有對應 `.spec.ts`；CI 上跑 `npm test` 全綠才算 phase 完成。

---

## 7. 我建議的最小可行版本（MVP）

如果想快速看到成果，我建議從這個範圍切入：

> **「台北捷運 2D MapLibre 即時看板」**
>
> - 台北捷運所有站點 + 路線（TDX 靜態資料）
> - 每 15 秒輪詢 LiveBoard
> - 站點 marker 在有列車進站時閃爍 + popup 顯示「目前停靠 / 即將進站」
> - 中文 + 英文切換
> - 無 3D、無公車、無台鐵
>
> 這個 MVP 我估計可以在幾個 session 內完成，做完之後我們再決定是否擴大到 3D / 公車 / 台鐵。

---

## 參考資料
- [TDX 運輸資料流通服務](https://tdx.transportdata.tw/)
- [TDX V3 Rail Metro Swagger](https://tdx.transportdata.tw/api-service/swagger)
- [TDX SampleCode (官方範例)](https://github.com/tdxmotc/SampleCode)
- [TDX 介接指南](https://bookdown.org/chiajungyeh/TDX_Guide/)
- [mini-tokyo-3d GitHub](https://github.com/nagix/mini-tokyo-3d)
- [台鐵列車即時位置動態資料 (data.gov.tw)](https://data.gov.tw/dataset/161161)
