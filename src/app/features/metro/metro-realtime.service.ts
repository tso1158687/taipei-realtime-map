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
      stream = timer(0, MetroRealtimeService.POLL_INTERVAL_MS).pipe(
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
          return raw
            .filter((r) => r.TrainNumber)
            .map((r) => mapSignal(r, operatorId));
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.streams.set(operatorId, stream);
    }
    return stream;
  }
}

function mapSignal(
  raw: TdxMetroLiveBoard,
  operatorId: MetroOperatorId
): MetroTrainSignal {
  return {
    trainNumber: raw.TrainNumber!,
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
