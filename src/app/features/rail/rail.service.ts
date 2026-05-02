import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  forkJoin,
  map,
  of,
  shareReplay,
  switchMap,
  timer,
} from 'rxjs';
import { parseWktGeometry, type LineGeometry } from '../../core/geometry';
import {
  RAIL_OPERATORS,
  REALTIME_WARMUP_DELAY_MS,
  TdxBaseService,
  unwrapEnvelope,
} from '../../core/tdx';
import type {
  TdxRailShape,
  TdxRailStation,
  TdxTraLine,
  TdxTraTrainLiveBoard,
} from './rail-tdx.types';
import type {
  RailLine,
  RailMode,
  RailNetwork,
  RailStation,
  TraTrainLive,
} from './rail.types';

const EMPTY_GEOMETRY: LineGeometry = { type: 'LineString', coordinates: [] };

/**
 * Service for TRA + THSR static + live data.
 *
 * - `fetchNetwork('TRA' | 'THSR')`: stations + lines (with WKT parsed)
 * - `watchTrainLiveBoard()`: TRA TrainLiveBoard polled every 30s
 *
 * THSR has no per-train live feed in TDX V2; arrival board is per-station
 * via DailyTimetable + reverse engineering, deferred to Phase 5.
 */
@Injectable({ providedIn: 'root' })
export class RailService {
  private readonly tdx = inject(TdxBaseService);
  private readonly warmupDelayMs = inject(REALTIME_WARMUP_DELAY_MS);

  static readonly LIVEBOARD_POLL_MS = 30_000;

  private traLiveStream: Observable<readonly TraTrainLive[]> | null = null;

  fetchNetwork(mode: RailMode): Observable<RailNetwork> {
    // Stations: tolerate failure → empty list rather than blanking the whole
    // network. Cache will fill the gap on the next reload.
    const stations$ = this.tdx.get<unknown>(`v2/Rail/${mode}/Station`).pipe(
      catchError(() => of([])),
      map((p) => unwrapEnvelope<TdxRailStation>(p, 'Stations')),
      map((arr) => arr.map((s) => mapStation(s, mode)))
    );
    const lines$ = this.fetchLines(mode);
    return forkJoin({ stations: stations$, lines: lines$ }).pipe(
      map(({ stations, lines }) => ({ mode, stations, lines }))
    );
  }

  private fetchLines(mode: RailMode): Observable<RailLine[]> {
    const meta$ =
      mode === 'TRA'
        ? this.tdx
            .get<unknown>('v2/Rail/TRA/Line')
            .pipe(
              catchError(() => of([])),
              map((p) => unwrapEnvelope<TdxTraLine>(p, 'Lines'))
            )
        : of<TdxTraLine[]>([]); // THSR doesn't have a Line endpoint with same shape
    const shapes$ = this.tdx
      .get<unknown>(`v2/Rail/${mode}/Shape`)
      .pipe(
        catchError(() => of([])),
        map((p) => unwrapEnvelope<TdxRailShape>(p, 'Shapes'))
      );
    return forkJoin({ meta: meta$, shapes: shapes$ }).pipe(
      map(({ meta, shapes }) => mergeLinesAndShapes(meta, shapes, mode))
    );
  }

  /** TRA TrainLiveBoard polled every 30 s. THSR not supported — empty stream. */
  watchTraLiveBoard(): Observable<readonly TraTrainLive[]> {
    if (!this.traLiveStream) {
      this.traLiveStream = timer(this.warmupDelayMs, RailService.LIVEBOARD_POLL_MS).pipe(
        switchMap(() =>
          this.tdx.get<unknown>('v2/Rail/TRA/TrainLiveBoard').pipe(
            catchError((err: unknown) => {
              console.warn('[Rail] TRA LiveBoard poll failed', err);
              return of([]);
            })
          )
        ),
        map((p) => {
          const raw = unwrapEnvelope<TdxTraTrainLiveBoard>(
            p,
            'TrainLiveBoards'
          );
          return raw.map(mapTraLive);
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.traLiveStream;
  }
}

export function mapStation(raw: TdxRailStation, mode: RailMode): RailStation {
  return {
    id: `${mode}-${raw.StationUID}`,
    stationId: raw.StationID,
    mode,
    name: { zh: raw.StationName.Zh_tw, en: raw.StationName.En },
    position: {
      lat: raw.StationPosition.PositionLat,
      lng: raw.StationPosition.PositionLon,
    },
  };
}

export function mergeLinesAndShapes(
  meta: readonly TdxTraLine[],
  shapes: readonly TdxRailShape[],
  mode: RailMode
): RailLine[] {
  const fallbackColor = RAIL_OPERATORS[mode].color;
  const shapeByLineId = new Map<string, LineGeometry>();
  for (const s of shapes) {
    const g = parseWktGeometry(s.Geometry);
    if (g) shapeByLineId.set(s.LineID, g);
  }
  if (meta.length === 0) {
    // No metadata (e.g. THSR) — synthesise lines straight from shapes.
    return shapes
      .filter((s) => !!s.LineID)
      .map((s) => ({
        id: `${mode}-${s.LineID}`,
        lineId: s.LineID,
        mode,
        name: {
          zh: s.LineName?.Zh_tw ?? s.LineID,
          en: s.LineName?.En ?? s.LineID,
        },
        color: fallbackColor,
        geometry: shapeByLineId.get(s.LineID) ?? EMPTY_GEOMETRY,
      }));
  }
  return meta.map((line) => ({
    id: `${mode}-${line.LineID}`,
    lineId: line.LineID,
    mode,
    name: {
      zh: line.LineName?.Zh_tw ?? line.LineID,
      en: line.LineName?.En ?? line.LineID,
    },
    color: normalizeColor(line.LineColor) ?? fallbackColor,
    geometry: shapeByLineId.get(line.LineID) ?? EMPTY_GEOMETRY,
  }));
}

function mapTraLive(raw: TdxTraTrainLiveBoard): TraTrainLive {
  return {
    trainNo: raw.TrainNo,
    trainTypeName: raw.TrainTypeName
      ? { zh: raw.TrainTypeName.Zh_tw, en: raw.TrainTypeName.En }
      : undefined,
    stationId: raw.StationID,
    stationName: raw.StationName
      ? { zh: raw.StationName.Zh_tw, en: raw.StationName.En }
      : undefined,
    status: raw.TrainStationStatus,
    delayMinutes: raw.DelayTime,
    endingStationName: raw.EndingStationName
      ? { zh: raw.EndingStationName.Zh_tw, en: raw.EndingStationName.En }
      : undefined,
  };
}

function normalizeColor(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed}`;
  return undefined;
}
