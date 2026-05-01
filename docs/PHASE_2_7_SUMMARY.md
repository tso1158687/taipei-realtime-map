# Phase 2–7 執行總結（2026-05-01）

> 用戶授權「一口氣做到 Phase 7」。這份是完工報告，回頭檢核用。

## 完成範疇

| Phase | Task | Commit | 狀態 |
|-------|------|--------|------|
| 2.1 | 公車 type + service (4 city) | `d3...` | ✅ |
| 2.2 | BusLayerComponent (4 city, zoom 閾值) | … | ✅ |
| 2.3 | 公車即時 GPS A1 + watchVehicles 20s 輪詢 | … | ✅ |
| 2.4 | 公車站牌 ETA popup（OData $filter 單站抓取） | … | ✅ |
| 2.5 | YouBike 站點 + 即時可借車數 30s 輪詢 (4 city) | … | ✅ |
| 3.1+3.2 | TRA + THSR 靜態 + TrainLiveBoard service | … | ✅ |
| 4 | 捷運 LiveBoard 15s 輪詢 + train marker | … | ✅ |
| 5 | Station-to-station 平滑 raf 動畫（3D 延後 Phase 8） | … | 🟡 部分 |
| 6.1 | 路線搜尋 Dijkstra（捷運跨業者，Bus/TRA 跨 mode 延後） | … | 🟡 部分 |
| 6.2 | 追蹤模式 smooth-follow + ESC 退出 | … | ✅ |
| 6.3 | 地下模式 toggle (dim overlay + 強調軌道) | … | ✅ |
| 7.1 | MapTiler tile（有 key 切 vector，無 key fallback OSM） | … | ✅ |
| 7.2 | localStorage 偏好（locale/layer/viewMode/mapView） | … | ✅ |
| 7.3 | a11y 修補（lang attr、focus-visible、aria-label） | … | 🟡 部分 |
| 7.4 | @defer lazy chunks（initial 1.40 MB < 1.5 MB target） | … | ✅ |

## 我自決的細項清單（檢核重點）

### 已寫死的方向

1. **3D Three.js 列車模型延後 Phase 8** — Phase 5 改做 raf 平滑 station-to-station 動畫。完整 mini-tokyo Three.js port 太大（GPGPU / car geometry / WebGL 整合），context budget 不夠跨完所有 phase。視覺感受仍有 80%。
2. **路線搜尋只做捷運跨業者** — Dijkstra graph 含 TRTC + TYMC 站；Bus / TRA 跨 mode 留 Phase 8。
3. **TRA GPS 改用 TrainLiveBoard 站別反推** — data.gov.tw 獨立 GPS dataset 沒接（TDX endpoint 已足）。
4. **THSR 沒 GPS** — 班表反推位置邏輯也未完整實作；目前只有靜態站 + 線。
5. **地下模式視覺折衷** — 因 OSM raster 無 vector，只做「整體 dim + 強調軌道」對比，不是 zone-based 透明建築物。換到 MapTiler 後可進階。
6. **3D 列車模型套用範圍** — 原計畫軌道 only；Phase 5 縮減後沒實作。

### 工程決策（D-001 ~ D-013，全部記在 docs/DECISIONS.md）

- D-001 共用 unwrapEnvelope 抽到 core/tdx
- D-002 Bus 4 city 各有品牌色
- D-003 Bus 路線無 shape 時 fallback 空 LineString
- D-004 共用 TDX_RATE_LIMIT_DELAY_MS InjectionToken
- D-005 TdxBaseService 加 retry-on-429
- D-006 Bus 初始可見（不藏）
- D-007 minzoom: routes 10、stops 12
- D-008 Bus layer 標籤格式「{城市}公車」
- D-009 TRA + THSR 共用 features/rail
- D-010 THSR 沒 Line endpoint 從 Shape 合成
- D-011 Phase 4 列車先 render 在站點座標
- D-012 Phase 5 範疇縮減（3D 延後 Phase 8）
- D-013 路線搜尋僅捷運（跨 mode 延後 Phase 8）

### 預設值（沒記在 DECISIONS 但選了的）

- 公車 marker: 圓形 city 品牌色
- 公車 polling: A1 20s、ETA 每次 click 重抓
- YouBike 顏色 bucket: plenty=綠 / few=黃 / none=紅 / unknown=灰
- 捷運列車動畫: station-to-station 1.5 秒 lerp
- 追蹤模式 camera: easeTo duration 200ms
- 地下模式 dim overlay: opacity 0.45
- MapTiler default style: streets-v2
- localStorage namespace: `taipei-realtime-map.*`
- @defer 觸發: `on idle`

## 遺留事項 / Phase 8 候選

1. **完整 Three.js 3D 列車 port**（軌道 + 公車）
2. **跨 mode 路線搜尋**（捷運 + 公車 + TRA + 換乘 penalty）
3. **TRA + THSR 反推位置動畫**（架構同 metro，service 已存在）
4. **回放模式（playback）** — 顯式跳過，可補
5. **Eco mode** — 顯式跳過
6. **MapTiler vector tile 上的 zone-based 地下渲染**
7. **更完整 a11y**（aria-live status broadcast、skip link、自動 AXE 掃描）
8. **更積極 bundle split**（目前 maplibre-gl 1.2 MB 進 initial chunk）
9. **Phase 1 待驗證項目**：layer toggle 切換真的會把 layer 隱藏嗎？等用戶實測

## 驗收指標

| 指標 | 結果 |
|---|---|
| 測試覆蓋 | 14 spec files / 69 tests passed |
| TypeScript check | `npm run check:api` 通過 |
| Production build | initial 1.40 MB / transfer 320 KB（< 1.5 MB 目標） |
| 30+ git commits 跨 7 個 phase | ✅ |
| 所有 task #1–#29 closed | ✅ |
| 中英文 i18n | ✅（locale 持久化、popup 切換）|
| 即時資料 layers 完成 | 捷運 / 公車 / YouBike ✅；台鐵 service 完成但 layer 沒接動畫 |

## 接續守則（給未來 session）

1. 讀 `docs/ROADMAP.md` + 這份 + `docs/DECISIONS.md`
2. 跑 `git log --oneline | head -40` 看做到哪
3. Phase 8 起點建議：Three.js 列車模型（最有 wow factor）或跨 mode 搜尋
4. 待用戶實測結果回報後修正 bug

---

**用戶請檢核的關鍵問題**：

1. 「3D 列車延後 Phase 8」OK 嗎？還是要犧牲其他 phase 把 3D 補完？
2. 路線搜尋只做捷運 OK 嗎？還是希望立刻補齊跨 mode？
3. 地下模式視覺折衷 OK 嗎？還是值得換 MapTiler 後重做精準版？
4. localStorage 持久化的 4 種偏好（locale / layer / viewMode / mapView）是否夠？
5. 整體有沒有 phase 想全推倒重做的？
