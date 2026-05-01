# taipei-realtime-map ROADMAP

> 2026-05-01 — 用戶決策：「一口氣做到 Phase 7」全餐 + 加碼 YouBike。
> 後續 session 接手時把這份當權威文件，不要另起爐灶。

## 已完成

- Phase 0：proxy / npm / core / test infra
- Phase 1：捷運（TRTC + TYMC）站點 + 路線 + popup
- Phase 1+：地圖控制按鈕、中/英切換、Layer toggle 面板 + 載入狀態

## 範疇決議

### 交通工具覆蓋（Phase 2 + 3）

| Mode | Coverage | 即時 |
|---|---|---|
| 捷運 | TRTC + TYMC | LiveBoard + 反推位置動畫（Phase 4）|
| 公車 | 台北、新北、桃園、基隆 | A1 GPS 點位（Phase 2.3）+ ETA popup |
| 台鐵 | 全省 | TrainLiveBoard + data.gov.tw GPS（Phase 3.1）|
| 高鐵 | 西部全線 | DailyTimetable 反推位置（Phase 3.2）|
| YouBike | 台北、新北、桃園、基隆 | 即時可借/可還車數 30s refresh（Phase 2.5）|

### 即時 / 3D 深度（Phase 4 + 5）

**完整 mini-tokyo 體驗**：即時動點 + 3D 列車模型。

3D 範圍：**軌道 only**（捷運 + 台鐵 + 高鐵）。
公車與 YouBike 維持 2D circle marker（mini-tokyo 也只 3D 列車）。

### Phase 6 進階互動

- 路線搜尋（Dijkstra 跨 mode：捷運 + 公車 + TRA）
- 追蹤模式（smooth-follow 鏡頭，非硬鎖）
- 地下模式（zone-based heuristic 判斷地下段）

回放模式 (mini-tokyo 有的 playback) 跳過。

### Phase 7 production

- Tile 換 MapTiler Streets v2（免費 10 萬/月，要註冊 key）
- localStorage 記憶 locale / layer toggle / 地圖中心 zoom
- AXE / WCAG AA 通過
- Bundle 拆分 + lazy load，目標 initial < 1.5 MB

## 細項 default（無需再問）

| 項目 | Default | 註記 |
|---|---|---|
| MapTiler style | Streets v2，Phase 7 末加 dark mode toggle | 視覺最接近 mini-tokyo |
| MapTiler key | Frontend env var（free key 可暴露） | 升 paid 時走 proxy |
| 公車 icon | 圓 marker，依路線品牌色 | 站位太多方塊會打架 |
| 公車 zoom 閾值 | zoom<12 隱藏 stops、zoom<10 連 routes 都隱藏 | 避免首頁 lag |
| Polling 間隔 | bus A1 20s、Metro LiveBoard 15s、TRA 30s、YouBike 30s | 配合 5/10s rate limit + API 更新頻率 |
| 路線搜尋 | 跨 mode Dijkstra + 換乘 penalty 5min | mini-tokyo 風格 |
| 追蹤模式 | smooth-follow 鏡頭 | 跟丟比較不暈 |
| 地下模式 | zone heuristic：捷運段間預設地下，特定路線（文湖線）特例 | TDX 沒提供 underground 標籤 |
| YouBike colour | green=多、yellow=中、red=少 | 直觀 |
| 公車 icon hover | 顯示路線編號 + 終點站 | mini-tokyo 風格 |

## 執行順序（17 個 task：#13-#29）

```
13: ROADMAP + memory（這個）
─────────────────────── Phase 2 ───────────────────────
14: 公車型別 + BusService
15: BusLayerComponent 靜態（4 city）
16: 公車即時 GPS + 動畫
17: 公車 ETA popup
18: YouBike 站點 + 即時車數
─────────────────────── Phase 3 ───────────────────────
19: 台鐵靜態 + GPS 即時
20: 高鐵靜態 + 班表反推位置
─────────────────────── Phase 4 ───────────────────────
21: 捷運 LiveBoard 即時 + 反推動畫
─────────────────────── Phase 5 ───────────────────────
22: Three.js 列車 layer（軌道 only）
─────────────────────── Phase 6 ───────────────────────
23: 路線搜尋（Dijkstra）
24: 追蹤模式
25: 地下模式 toggle
─────────────────────── Phase 7 ───────────────────────
26: 換 MapTiler tile
27: localStorage 記憶偏好
28: AXE / WCAG AA 通過
29: Bundle 拆分 + lazy load
```

預估 30–40 個 commit，會跨多個對話 session。每 task 完成 commit 一次。

## 跨對話接續守則

當下個 session 進來時應該：
1. `git log --oneline | head -20` 看做到哪
2. `mcp__cowork__list_tasks` 看 task list 進度
3. 讀 `docs/ROADMAP.md`（這份）
4. 讀 `.claude/CLAUDE.md`、`docs/ASSESSMENT.md`、`docs/SETUP.md`
5. 檢查 memory（含 feedback_commit_per_milestone、reference_vercel_env_workflow、project_taipei_realtime_map）
6. 從 TaskList 中第一個 pending task 接手

## 顯式不做

- 航班 / 飛機（資料無 GPS）
- 3D 建築物（OSM raster 沒 vector）
- 回放模式 / Eco 模式 / playback
- Mapbox（成本問題改 OSM → MapTiler）
- 公車 / YouBike 的 3D（只 marker）
