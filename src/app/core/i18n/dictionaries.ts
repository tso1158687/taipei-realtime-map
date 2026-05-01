/**
 * UI 字典。鍵是穩定的程式碼（dot-separated namespace），值是各語言文字。
 *
 * 加新字串時：(1) 在所有 locale 的 dictionary 同步加入；(2) 新增的 key
 * 應該在 DictionaryKey union 內自動推導。如果只在 zh-TW 加而沒在 en 加，
 * TypeScript 會用 `satisfies` 檢查到不匹配。
 */

export const DICTIONARY_ZH_TW = {
  'app.title': '台北即時交通 3D 地圖',
  'common.loading': '載入中...',
  'common.error.fetch': '資料載入失敗',
  'common.retry': '重試',
  'operator.TRTC': '臺北捷運',
  'operator.TYMC': '桃園捷運',
  'operator.TRA': '臺灣鐵路',
  'operator.THSR': '台灣高鐵',
  'city.Taipei': '臺北市',
  'city.NewTaipei': '新北市',
  'layer.metro': '捷運',
  'layer.bus': '公車',
  'layer.rail': '台鐵 / 高鐵',
} as const;

export type DictionaryKey = keyof typeof DICTIONARY_ZH_TW;

export type Dictionary = Readonly<Record<DictionaryKey, string>>;

export const DICTIONARY_EN: Dictionary = {
  'app.title': 'Taipei Realtime Transit 3D Map',
  'common.loading': 'Loading…',
  'common.error.fetch': 'Failed to load data',
  'common.retry': 'Retry',
  'operator.TRTC': 'Taipei Metro',
  'operator.TYMC': 'Taoyuan Metro',
  'operator.TRA': 'Taiwan Railways',
  'operator.THSR': 'Taiwan High Speed Rail',
  'city.Taipei': 'Taipei City',
  'city.NewTaipei': 'New Taipei City',
  'layer.metro': 'Metro',
  'layer.bus': 'Bus',
  'layer.rail': 'TRA / THSR',
};

export type Locale = 'zh-TW' | 'en';

export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = {
  'zh-TW': DICTIONARY_ZH_TW,
  en: DICTIONARY_EN,
};

export const DEFAULT_LOCALE: Locale = 'zh-TW';
