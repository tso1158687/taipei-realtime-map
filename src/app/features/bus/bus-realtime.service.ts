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
  type BusCityId,
  TdxBaseService,
  unwrapEnvelope,
} from '../../core/tdx';
import type { TdxBusVehicle } from './bus-tdx.types';
import type { BusVehicle } from './bus.types';

/**
 * Polls TDX `/v2/Bus/RealTimeByFrequency/City/{city}` every 20 seconds and
 * emits the latest vehicle GPS snapshot.
 *
 * Phase 2.3 just emits raw positions per poll — between polls the markers
 * "teleport" to their new location. Smooth interpolation between samples
 * is deferred to Phase 5 (Three.js animation layer).
 *
 * `shareReplay` makes multiple subscribers (e.g. BusVehicleLayerComponent
 * for the same city) share one polling stream. Errors are swallowed (empty
 * array) so a transient 5xx doesn't kill the timer.
 */
@Injectable({ providedIn: 'root' })
export class BusRealtimeService {
  private readonly tdx = inject(TdxBaseService);

  /** Default poll cadence for A1 vehicle positions. */
  static readonly POLL_INTERVAL_MS = 20_000;

  private readonly streams = new Map<BusCityId, Observable<BusVehicle[]>>();

  watchVehicles(city: BusCityId): Observable<BusVehicle[]> {
    let stream = this.streams.get(city);
    if (!stream) {
      stream = timer(0, BusRealtimeService.POLL_INTERVAL_MS).pipe(
        switchMap(() =>
          this.tdx
            .get<unknown>(`v2/Bus/RealTimeByFrequency/City/${city}`)
            .pipe(
              catchError((err: unknown) => {
                console.warn(`[BusRealtime] ${city} poll failed`, err);
                return of([]);
              })
            )
        ),
        map((payload) => {
          const raw = unwrapEnvelope<TdxBusVehicle>(payload, 'BusA1Datas');
          return raw.map((v) => mapVehicle(v, city));
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.streams.set(city, stream);
    }
    return stream;
  }
}

export function mapVehicle(
  raw: TdxBusVehicle,
  city: BusCityId
): BusVehicle {
  return {
    id: `${city}-${raw.PlateNumb}`,
    plateNumb: raw.PlateNumb,
    city,
    routeUid: raw.RouteUID,
    routeId: raw.RouteID,
    direction: raw.Direction,
    position: {
      lat: raw.BusPosition.PositionLat,
      lng: raw.BusPosition.PositionLon,
    },
    azimuth: raw.Azimuth,
    speed: raw.Speed,
  };
}
