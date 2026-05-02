import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  map,
  of,
  shareReplay,
  switchMap,
  timer,
} from 'rxjs';
import {
  type MetroOperatorId,
  REALTIME_WARMUP_DELAY_MS,
  TdxBaseService,
  unwrapEnvelope,
} from '../../core/tdx';
import type { TdxMetroLiveBoard } from './metro-tdx.types';
import type { MetroTrainSignal } from './metro.types';

/**
 * Polls Metro LiveBoard endpoints (TRTC, TYMC) for per-station train
 * signals and exposes them as a stream of `MetroTrainSignal`s.
 *
 * Phase 4 just emits the raw signal list. Phase 5 (Three.js) layers smooth
 * along-the-line interpolation on top using turf.along + station distances.
 */
@Injectable({ providedIn: 'root' })
export class MetroRealtimeService {
  private readonly tdx = inject(TdxBaseService);
  private readonly warmupDelayMs = inject(REALTIME_WARMUP_DELAY_MS);

  static readonly POLL_INTERVAL_MS = 15_000;

  private readonly streams = new Map<
    MetroOperatorId,
    Observable<readonly MetroTrainSignal[]>
  >();

  watchLiveBoard(
    operatorId: MetroOperatorId
  ): Observable<readonly MetroTrainSignal[]> {
    let stream = this.streams.get(operatorId);
    if (!stream) {
      stream = timer(this.warmupDelayMs, MetroRealtimeService.POLL_INTERVAL_MS).pipe(
        switchMap(() =>
          this.tdx
            .get<unknown>(`v2/Rail/Metro/LiveBoard/${operatorId}`)
            .pipe(
              catchError((err: unknown) => {
                console.warn(
                  `[MetroRealtime] ${operatorId} LiveBoard failed`,
                  err
                );
                return of([]);
              })
            )
        ),
        map((payload) => {
          const raw = unwrapEnvelope<TdxMetroLiveBoard>(
            payload,
            'LiveBoards'
          );
          // TDX V2 LiveBoard rows do NOT carry TrainNumber — each row is a
          // per-station "next train approaching" signal. Rows we can render
          // are the ones with at least StationID + LineID; mapSignal
          // synthesises a stable id from (LineID, StationID, TripHeadSign).
          return raw
            .filter((r) => r.StationID && r.LineID)
            .map((r) => mapSignal(r, operatorId));
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.streams.set(operatorId, stream);
    }
    return stream;
  }
}

export function mapSignal(
  raw: TdxMetroLiveBoard,
  operatorId: MetroOperatorId
): MetroTrainSignal {
  // Synthetic stable id: (Line, Station, TripHeadSign) is enough to keep
  // markers "sticky" between polls — if the same train is still approaching
  // the same station, the id matches and the marker stays put. When the
  // train moves to the next station the previous row falls off and a new
  // row at the next station appears, giving a hopping animation effect.
  const trainNumber =
    raw.TrainNumber ??
    `${raw.LineID ?? '?'}-${raw.StationID}-${raw.TripHeadSign ?? raw.DestinationStationID ?? ''}`;
  return {
    trainNumber,
    operatorId,
    stationId: raw.StationID,
    lineId: raw.LineID,
    direction: raw.Direction,
    destinationStationId: raw.DestinationStationID,
    destinationName: raw.DestinationStationName
      ? {
          zh: raw.DestinationStationName.Zh_tw,
          en: raw.DestinationStationName.En,
        }
      : undefined,
    estimateTimeSeconds: raw.EstimateTime,
  };
}
