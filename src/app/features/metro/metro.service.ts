import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { parseWktGeometry } from '../../core/geometry';
import {
  METRO_OPERATORS,
  type MetroOperatorId,
  TdxBaseService,
} from '../../core/tdx';
import type {
  TdxMetroLine,
  TdxMetroLineResponse,
  TdxMetroShape,
  TdxMetroShapeResponse,
  TdxMetroStation,
  TdxMetroStationOfLine,
  TdxMetroStationOfLineResponse,
  TdxMetroStationResponse,
} from './metro-tdx.types';
import type {
  MetroLine,
  MetroLineGeometry,
  MetroNetwork,
  MetroStation,
} from './metro.types';

/**
 * Service for loading static Metro data from TDX (Taipei + Taoyuan).
 *
 * Each public method returns Observables of internal `MetroStation` / `MetroLine`
 * shapes — callers never see raw TDX field names. The mapping helpers are
 * exported for use in tests; production callers should stick to the
 * methods on the service.
 */
@Injectable({ providedIn: 'root' })
export class MetroService {
  private readonly tdx = inject(TdxBaseService);

  fetchStations(operatorId: MetroOperatorId): Observable<MetroStation[]> {
    return forkJoin({
      stations: this.tdx.get<TdxMetroStationResponse | TdxMetroStationResponse['Stations']>(
        `v2/Rail/Metro/Station/${operatorId}`
      ),
      stationOfLine: this.tdx.get<
        TdxMetroStationOfLineResponse | TdxMetroStationOfLineResponse['StationOfLines']
      >(`v2/Rail/Metro/StationOfLine/${operatorId}`),
    }).pipe(
      map(({ stations, stationOfLine }) => {
        const rawStations = unwrapEnvelope<TdxMetroStation>(stations, 'Stations');
        const rawSoL = unwrapEnvelope<TdxMetroStationOfLine>(
          stationOfLine,
          'StationOfLines'
        );
        const lineIdsByStation = buildLineIdsByStation(rawSoL);
        return rawStations.map((s) => mapStation(s, operatorId, lineIdsByStation));
      })
    );
  }

  fetchLines(operatorId: MetroOperatorId): Observable<MetroLine[]> {
    return forkJoin({
      meta: this.tdx.get<TdxMetroLineResponse | TdxMetroLineResponse['Lines']>(
        `v2/Rail/Metro/Line/${operatorId}`
      ),
      shapes: this.tdx.get<TdxMetroShapeResponse | TdxMetroShapeResponse['Shapes']>(
        `v2/Rail/Metro/Shape/${operatorId}`
      ),
    }).pipe(
      map(({ meta, shapes }) => {
        const rawMeta = unwrapEnvelope<TdxMetroLine>(meta, 'Lines');
        const rawShapes = unwrapEnvelope<TdxMetroShape>(shapes, 'Shapes');
        return mergeLinesAndShapes(rawMeta, rawShapes, operatorId);
      })
    );
  }

  fetchNetwork(operatorId: MetroOperatorId): Observable<MetroNetwork> {
    return forkJoin({
      stations: this.fetchStations(operatorId),
      lines: this.fetchLines(operatorId),
    }).pipe(map(({ stations, lines }) => ({ operatorId, stations, lines })));
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers — exported for tests
// ---------------------------------------------------------------------------

/**
 * TDX V3 sometimes returns the data array directly (no envelope) and
 * sometimes wraps it in `{ <Key>: [...] }`. Be defensive.
 */
export function unwrapEnvelope<T>(
  payload: unknown,
  key: string
): readonly T[] {
  if (Array.isArray(payload)) {
    return payload as readonly T[];
  }
  if (
    payload &&
    typeof payload === 'object' &&
    key in payload &&
    Array.isArray((payload as Record<string, unknown>)[key])
  ) {
    return (payload as Record<string, readonly T[]>)[key];
  }
  return [];
}

export function buildLineIdsByStation(
  rows: readonly TdxMetroStationOfLine[]
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    for (const s of row.Stations ?? []) {
      const arr = out.get(s.StationID) ?? [];
      if (!arr.includes(row.LineID)) arr.push(row.LineID);
      out.set(s.StationID, arr);
    }
  }
  return out;
}

export function mapStation(
  raw: TdxMetroStation,
  operatorId: MetroOperatorId,
  lineIdsByStation: Map<string, string[]>
): MetroStation {
  const lineIds = lineIdsByStation.get(raw.StationID) ?? (raw.LineID ? [raw.LineID] : []);
  return {
    id: `${operatorId}-${raw.StationID}`,
    stationId: raw.StationID,
    operatorId,
    name: { zh: raw.StationName.Zh_tw, en: raw.StationName.En },
    position: {
      lat: raw.StationPosition.PositionLat,
      lng: raw.StationPosition.PositionLon,
    },
    lineIds,
  };
}

export function mergeLinesAndShapes(
  rawLines: readonly TdxMetroLine[],
  rawShapes: readonly TdxMetroShape[],
  operatorId: MetroOperatorId
): MetroLine[] {
  const fallbackColor = METRO_OPERATORS[operatorId].color;
  const shapeByLineId = new Map<string, MetroLineGeometry>();
  for (const shape of rawShapes) {
    const geometry = parseWktGeometry(shape.Geometry);
    if (geometry) shapeByLineId.set(shape.LineID, geometry);
  }
  return rawLines.map((line) => {
    const geometry =
      shapeByLineId.get(line.LineID) ??
      ({ type: 'LineString', coordinates: [] } as MetroLineGeometry);
    return {
      id: `${operatorId}-${line.LineID}`,
      lineId: line.LineID,
      operatorId,
      name: { zh: line.LineName.Zh_tw, en: line.LineName.En },
      color: normalizeColor(line.LineColor) ?? fallbackColor,
      geometry,
    };
  });
}

function normalizeColor(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed}`;
  return undefined;
}
