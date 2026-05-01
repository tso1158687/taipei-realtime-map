import type { LineGeometry } from './types';

/**
 * Parse a TDX-format WKT string into our internal `LineGeometry`.
 *
 * Supported inputs:
 *   - `LINESTRING(x y, x y, ...)`
 *   - `MULTILINESTRING((x y, x y), (x y, x y), ...)`
 *
 * Whitespace handling is lenient. Returns `null` on anything else (POINT,
 * POLYGON, garbage, empty) so the caller can decide whether to fall back
 * to an empty geometry, log a warning, or skip the record entirely.
 *
 * Used by both `MetroService` (Rail/Metro/Shape endpoint) and `BusService`
 * (Bus/Shape endpoint), which both return geometry as WKT strings.
 */
export function parseWktGeometry(
  wkt: string | undefined | null
): LineGeometry | null {
  if (!wkt) return null;
  const trimmed = wkt.trim();
  if (/^MULTILINESTRING/i.test(trimmed)) {
    return parseWktMultiLineString(trimmed);
  }
  if (/^LINESTRING/i.test(trimmed)) {
    return parseWktLineString(trimmed);
  }
  return null;
}

function parseWktLineString(wkt: string): LineGeometry | null {
  const inner = stripWktHead(wkt, 'LINESTRING');
  if (inner === null) return null;
  const coords = parseCoordList(inner);
  return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : null;
}

function parseWktMultiLineString(wkt: string): LineGeometry | null {
  const inner = stripWktHead(wkt, 'MULTILINESTRING');
  if (inner === null) return null;
  // Match each "(...)" group inside the outer parentheses.
  const groups: ReadonlyArray<readonly [number, number]>[] = [];
  const groupRegex = /\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = groupRegex.exec(inner)) !== null) {
    const coords = parseCoordList(match[1]);
    if (coords.length >= 2) groups.push(coords);
  }
  if (groups.length === 0) return null;
  if (groups.length === 1) {
    return { type: 'LineString', coordinates: groups[0] };
  }
  return { type: 'MultiLineString', coordinates: groups };
}

function stripWktHead(wkt: string, head: string): string | null {
  const re = new RegExp(`^${head}\\s*\\(([\\s\\S]+)\\)\\s*$`, 'i');
  const m = re.exec(wkt);
  return m ? m[1] : null;
}

function parseCoordList(raw: string): [number, number][] {
  const out: [number, number][] = [];
  for (const pair of raw.split(',')) {
    const parts = pair.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([x, y]);
  }
  return out;
}
