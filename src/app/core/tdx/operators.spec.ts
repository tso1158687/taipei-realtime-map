import {
  BUS_CITIES,
  METRO_OPERATORS,
  RAIL_OPERATORS,
} from './operators';

describe('TDX operator constants', () => {
  it('exposes Taipei + Taoyuan metros with brand colors', () => {
    expect(METRO_OPERATORS.TRTC.id).toBe('TRTC');
    expect(METRO_OPERATORS.TYMC.id).toBe('TYMC');
    for (const meta of Object.values(METRO_OPERATORS)) {
      expect(meta.color, `metro ${meta.id} color`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.nameZh.length).toBeGreaterThan(0);
      expect(meta.nameEn.length).toBeGreaterThan(0);
    }
  });

  it('exposes TRA + THSR rail operators', () => {
    expect(RAIL_OPERATORS.TRA.id).toBe('TRA');
    expect(RAIL_OPERATORS.THSR.id).toBe('THSR');
  });

  it('exposes Taipei + NewTaipei bus city codes', () => {
    expect(BUS_CITIES.Taipei.id).toBe('Taipei');
    expect(BUS_CITIES.NewTaipei.id).toBe('NewTaipei');
  });

  it('keys equal ids for every operator', () => {
    for (const [key, meta] of Object.entries({
      ...METRO_OPERATORS,
      ...RAIL_OPERATORS,
    })) {
      expect(meta.id).toBe(key);
    }
  });
});
