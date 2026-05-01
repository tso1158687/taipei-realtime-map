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

