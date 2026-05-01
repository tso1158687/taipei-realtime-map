import { parseWktGeometry } from './wkt';

describe('parseWktGeometry', () => {
  it('parses LINESTRING into LineString', () => {
    const g = parseWktGeometry('LINESTRING(1 2, 3 4, 5 6)');
    expect(g?.type).toBe('LineString');
    expect(g?.coordinates.length).toBe(3);
  });

  it('parses MULTILINESTRING with multiple groups into MultiLineString', () => {
    const g = parseWktGeometry('MULTILINESTRING((1 2, 3 4), (5 6, 7 8))');
    expect(g?.type).toBe('MultiLineString');
    if (g?.type === 'MultiLineString') {
      expect(g.coordinates.length).toBe(2);
    }
  });

  it('normalises a single-group MULTILINESTRING to LineString', () => {
    const g = parseWktGeometry('MULTILINESTRING((1 2, 3 4))');
    expect(g?.type).toBe('LineString');
  });

  it('handles whitespace and high-precision floats', () => {
    const g = parseWktGeometry(
      ' LINESTRING ( 121.54377191 25.04165481 , 121.54644309 25.04159841 ) '
    );
    expect(g?.type).toBe('LineString');
    if (g?.type === 'LineString') {
      expect(g.coordinates[0][0]).toBeCloseTo(121.54377191, 6);
    }
  });

  it('returns null for unsupported / malformed input', () => {
    expect(parseWktGeometry('')).toBeNull();
    expect(parseWktGeometry(undefined)).toBeNull();
    expect(parseWktGeometry(null)).toBeNull();
    expect(parseWktGeometry('POINT(1 2)')).toBeNull();
    expect(parseWktGeometry('POLYGON((1 2, 3 4, 5 6, 1 2))')).toBeNull();
    expect(parseWktGeometry('garbage')).toBeNull();
  });

  it('drops degenerate coords (single point) and empty groups', () => {
    expect(parseWktGeometry('LINESTRING(1 2)')).toBeNull();
    expect(parseWktGeometry('MULTILINESTRING()')).toBeNull();
  });
});
