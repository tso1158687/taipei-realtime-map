import { TestBed } from '@angular/core/testing';
import { DICTIONARIES, DICTIONARY_EN, DICTIONARY_ZH_TW } from './dictionaries';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  let service: I18nService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(I18nService);
  });

  it('defaults to zh-TW', () => {
    expect(service.locale()).toBe('zh-TW');
    expect(service.t('app.title')).toBe('台北即時交通 3D 地圖');
  });

  it('switches dictionary when locale changes', () => {
    service.setLocale('en');
    expect(service.locale()).toBe('en');
    expect(service.t('app.title')).toBe('Taipei Realtime Transit 3D Map');
  });

  it('exposes the current dictionary as a computed signal', () => {
    expect(service.dictionary()).toBe(DICTIONARY_ZH_TW);
    service.setLocale('en');
    expect(service.dictionary()).toBe(DICTIONARY_EN);
  });

  it('keeps the same set of keys across all locales', () => {
    const zhKeys = Object.keys(DICTIONARY_ZH_TW).sort();
    for (const [locale, dict] of Object.entries(DICTIONARIES)) {
      const keys = Object.keys(dict).sort();
      expect(keys, `locale ${locale} key mismatch`).toEqual(zhKeys);
    }
  });
});
