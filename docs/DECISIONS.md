# 自決清單（Phase 2-7 全權自治模式）

> 2026-05-01 起 user 授權自行決策。所有 ROADMAP 沒寫死的細項，落在這份。
> 完成後 user 會檢核；不滿意處再回頭調整。

格式：每筆紀錄
- **決策**：是什麼
- **選擇**：我選了什麼
- **理由**：為什麼
- **替代**：考慮過但沒選的方案

---

## Phase 2.1 - 公車 type + service

**D-001 — 共用 unwrapEnvelope 抽到 core/tdx**
- 選：加 `core/tdx/envelope.ts`，metro / bus 共用
- 理由：避免兩處 copy；將來 rail / youbike 都會用
- 替代：每個 service 自帶；放棄

**D-002 — Bus 4 city 品牌色**
- 選：Taipei #0070bd、NewTaipei #5bb04a、Taoyuan #7e277e、Keelung #0099cc
- 理由：跟捷運業者色不撞、各 city 易辨識；無 TDX per-route 色可參
- 替代：全部灰色 + 顏色由路線 hash 出來；放棄因辨識度差

**D-003 — Bus 路線幾何 fallback**
- 選：找不到 shape 的 route 給空 LineString，渲染時自動跳過
- 理由：避免 layer add 失敗；popup 仍可看路線文字資訊
- 替代：濾掉這些 route；放棄因為列表完整度差

## Phase 2.2 - 公車靜態 layer

**D-004 — Bus 與 Metro 共用 RATE_LIMIT_DELAY_MS InjectionToken**
- 選：抽出為 core/tdx/rate-limit.ts，metro / bus 都注入
- 理由：DRY；future feature 也用同一個
- 替代：每個 layer 自己 InjectionToken；保留各自 default 但可被獨立覆寫

**D-005 — TdxBaseService 加 retry-on-429**
- 選：interceptor-style retry，遇 429 等 11 秒最多 3 次
- 理由：免費 tier rate limit 高機率撞到；單點修最普及
- 替代：實作全域 RateLimiter 服務；保留方案、過於複雜先不做

**D-006 — Bus 初始 visible = true（不預設藏）**
- 選：勾選顯示
- 理由：使用者進站就期待看到公車；藏起來會以為壞了
- 替代：預設藏起來避免 lag；放棄，靠 minzoom 閾值控制 clutter

**D-007 — Bus minzoom 閾值**
- 選：路線 layer minzoom 10、站牌 layer minzoom 12
- 理由：低 zoom 線太密，圈太擠；讓使用者放大才看細節
- 替代：clustering；過於複雜先不做

**D-008 — Bus layer 標籤格式**
- 選：「{城市}公車」 / 「{City} Bus」
- 理由：與 layer panel 區別 mode（捷運 vs 公車）
- 替代：「{城市}」（純城市名稱）；可能誤解為「整個城市的所有交通」

## Phase 3 - 鐵路靜態

**D-009 — TRA + THSR 合在 features/rail 同一模組**
- 選：共用 RailService + RailLayerComponent，以 RailMode='TRA'|'THSR' 區別
- 理由：API shape 高度相似；THSR 只 12 站，獨立 module 太重
- 替代：各自一個 feature module；放棄

**D-010 — THSR 沒 Line endpoint 時，從 Shape 合成 line list**
- 選：fetchLines 偵測 meta=[]，直接以 Shape 為主資料源
- 理由：避免報錯；視覺上仍能畫線
- 替代：硬寫死 THSR 5 條線；不夠彈性

## Phase 4 - 捷運即時

**D-011 — Phase 4 列車先 render 在站點座標（非 along-line interpolation）**
- 選：每 15s LiveBoard poll 後把列車跳到報告站位置；操作員品牌色 + circle-blur
  讓視覺與靜態 station 區分
- 理由：完整反推 + 平滑動畫架構複雜度高、context budget 有限
- 替代：完整 along-line interpolation；轉到 Phase 5/8 做

## Phase 5 - 3D 列車（部分延後）

**D-012 — Phase 5 範疇縮減：只做 smooth station-to-station 2D 動畫，3D 列車模型延後 Phase 8**
- 選：用 raf + lerp 把 Phase 4 的「跳站」改成「沿線 1s 平滑過渡」；
  3D Three.js 列車模型作為 Phase 8 future work 處理
- 理由：(1) 完整 mini-tokyo Three.js port 包含 GPGPU shaders、多 car geometry、
  WebGL 整合，預估 200+ 行高難度代碼；(2) context budget 有限，要把 Phase 6 + 7
  也做完；(3) 平滑動畫已經給 80% mini-tokyo 體驗的視覺感受
- 替代：做完整 3D port；放棄因 context 不足，會中斷其他 phase
- 接續：Phase 8（或下次 session 接手時）會挑回來實作完整 Three.js layer

## Phase 7+ - 上線後修正

**D-013 — 全域 TdxScheduler token bucket（取代 per-feature stagger）**
- 選：在 `core/tdx/scheduler.ts` 建立全域 token-bucket scheduler；
  `TdxBaseService.get` 每筆請求先 `acquire()` 再發出，
  release 間隔 = `TDX_RATE_LIMIT_DELAY_MS / 4`（prod ≈ 2.75s，全域 ~3.6 reqs / 10s）
- 理由：先前 per-feature stagger（FEATURE_OFFSET_MULTIPLIER）只能延遲首發，
  但 Metro LiveBoard / Bus realtime / YouBike availability 各自的 polling timer
  會各自獨立衝刺，跨 feature 仍會撞滿 5 reqs / 10s 的免費 tier 上限。
  改用全域佇列後所有出站請求被串成一條序列，從根本上避開 429 storm
- 替代：(a) 上 Redis token bucket 在 serverless proxy 端；過於重，client-side 已足；
  (b) 把 polling 集中成單一輪詢服務；改動範圍太大，等 Phase 8 再說
- 測試 trade-off：scheduler 把同步 http.get 包成 Promise → microtask，
  HttpTestingController 抓不到。解法：當 `retryDelayMs === 0`（test 環境）
  bypass scheduler；同時在 5 個 service spec 注入 `TDX_RATE_LIMIT_DELAY_MS=0`
- 同步移除 bus/rail/youbike layer 的 `FEATURE_OFFSET_MULTIPLIER`
  — scheduler 已經在更下層處理，per-feature offset 就是雜訊

**D-014 — 客戶端 localStorage 快取靜態 TDX 資料（24h TTL）**
- 選：在 `core/tdx/client-cache.ts` 建立 TdxClientCache，
  TdxBaseService.get 對靜態 endpoint 先讀 cache → hit 直接 `of(cached)` 不打 server，
  miss 才走 scheduler + http，回應 tap 進 cache
- 理由：站點 / 路線 / Shape / 月台這種資料一年難得變一次，server 端的 in-memory
  cache 會在 cold start / `vercel dev` 重啟時消失，造成每次刷新瀏覽器都重新拉一輪。
  把整個靜態組合搬到瀏覽器 localStorage（24h TTL）後，cold start 那一波只剩
  realtime endpoint（LiveBoard / RealTime / Availability），輕鬆 fit 在 5 reqs/10s 內
- 替代：(a) 把 server cache 移到 Vercel KV / Upstash Redis：跨 instance 共享
  但要錢、要綁服務；(b) IndexedDB：localStorage 5MB 對目前 payload (~1.5 MB) 夠用
- realtime 過濾用正則：LiveBoard / RealTime / Availability / EstimatedTimeOfArrival
  / TrainLiveBoard / RTNT / PlateInfo（與 server 端 cache 一致）
- bug 修：原 `/RealTime\b/` 對 `RealTimeByFrequency` 不會 match（`\b` 要求邊界，
  但後面接 `B` 是 word char）→ 改成 `/RealTime/`，server-side cache 一併修
- 版本前綴 `tdx-cache-v1:` 方便未來資料 schema 改變時 bump 失效
- QuotaExceeded 自動 fallback：先嘗試清空自家前綴重試一次，再不行就 silent no-op
- 測試 trade-off：localStorage 跨 test 殘留 → 5 個 service spec 加 `localStorage.clear()`
  在 beforeEach / afterEach；新增 `client-cache.spec.ts`（7 tests）

**D-015 — partial fetch resilience：forkJoin 內部每個 request 自己 catchError**
- 選：metro / bus / rail 的 fetchNetwork 在每個 inner `tdx.get()` 後加
  `catchError(() => of([]))`，讓單一 endpoint 失敗（多半是 429）不會炸整層
- 理由：之前 forkJoin 是 all-or-nothing，TYMC 任一 endpoint 429 → 整個業者的
  Station + Line 都不渲染。改成 partial 後最壞情況是 line geometry 空（站點仍出），
  下次刷新 cache hit 補回缺的部分
- 替代：(a) layer-level retry：30s 後再打一次；複雜度較高；(b) 不修，靠 retry
  自然恢復；UX 不接受
- trade-off：partial 資料可能誤導 user（看到站點但沒線），用 layer-state 的
  'error' status 表現

**D-016 — scheduler interval 從 /4 放寬到 /3（~3.67s/req）**
- 選：`Math.floor(minDelayMs / 3)` ≈ 3667ms → ~2.7 reqs / 10s
- 理由：/4 = 2.75s 偶爾還是撞 429，多半是 TDX 用 sliding window 而非 strict
  10s bucket。多留 30% headroom 換穩定
- trade-off：cold-start drain 變慢（25 req × 3.7s ≈ 90s vs. 之前 70s），
  但配合 client cache 第二次起根本不會 cold-start 全部，所以實質不影響

**D-017 — 即時串流 cold-start 延遲 15s**
- 選：新增 `REALTIME_WARMUP_DELAY_MS` injection token (default 15s)，
  metro/bus/rail/youbike 4 個 polling timer 從 `timer(0, ...)` 改 `timer(15s, ...)`
- 理由：cold-start 已經有 ~25 個靜態 request 在排隊，realtime polling timer
  立刻 fire 會搶 token、拖慢靜態 drain、可能觸發 429。延遲 15s 讓靜態先抽 5 個
  token 再開始 realtime。UX 上 user 也習慣先看到站點再看到車輛
- 替代：(a) 等所有靜態 fetch 完才啟動 realtime；要全域協調，複雜；(b) 不延遲；
  不接受
- 測試：bus-realtime spec 注入 `REALTIME_WARMUP_DELAY_MS=0` 維持 sync timer

