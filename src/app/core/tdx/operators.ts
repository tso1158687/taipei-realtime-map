/**
 * TDX 大眾運輸業者代碼 (Operator IDs).
 *
 * Reference: https://tdx.transportdata.tw/  → 標準資料 → 業者代碼
 *
 * Only the operators we plan to render are listed here. Add new entries as
 * features expand (e.g. KRTC for 高雄捷運, TMRT for 臺中捷運).
 */

export interface OperatorMeta {
  readonly id: string;
  readonly nameZh: string;
  readonly nameEn: string;
  /** Brand color for map rendering, hex string with leading '#'. */
  readonly color: string;
}

export const METRO_OPERATORS = {
  TRTC: {
    id: 'TRTC',
    nameZh: '臺北捷運',
    nameEn: 'Taipei Metro',
    color: '#0070bd',
  },
  TYMC: {
    id: 'TYMC',
    nameZh: '桃園捷運',
    nameEn: 'Taoyuan Metro',
    color: '#7e277e',
  },
} as const satisfies Record<string, OperatorMeta>;

export type MetroOperatorId = keyof typeof METRO_OPERATORS;

export const RAIL_OPERATORS = {
  TRA: {
    id: 'TRA',
    nameZh: '臺灣鐵路',
    nameEn: 'Taiwan Railways',
    color: '#003366',
  },
  THSR: {
    id: 'THSR',
    nameZh: '台灣高鐵',
    nameEn: 'Taiwan High Speed Rail',
    color: '#f08200',
  },
} as const satisfies Record<string, OperatorMeta>;

export type RailOperatorId = keyof typeof RAIL_OPERATORS;

/** TDX City code used in /Bus/.../City/{City} endpoints. */
export const BUS_CITIES = {
  Taipei: { id: 'Taipei', nameZh: '臺北市', nameEn: 'Taipei City' },
  NewTaipei: { id: 'NewTaipei', nameZh: '新北市', nameEn: 'New Taipei City' },
} as const;

export type BusCityId = keyof typeof BUS_CITIES;
