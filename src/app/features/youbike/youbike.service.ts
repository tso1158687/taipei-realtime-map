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
  REALTIME_WARMUP_DELAY_MS,
  TdxBaseService,
  unwrapEnvelope,
} from '../../core/tdx';
import type {
  TdxBikeAvailability,
  TdxBikeStation,
} from './youbike-tdx.types';
import type { YouBikeAvailability, YouBikeStation } from './youbike.types';

/**
 * YouBike static stations + live availability per city.
 *
 * - `fetchStations(city)`: one-shot per session; static metadata.
 * - `watchAvailability(city)`: 30s polling, shareReplay for multi-subscribe.
 */
@Injectable({ providedIn: 'root' })
export class YouBikeService {
  private readonly tdx = inject(TdxBaseService);
  private readonly warmupDelayMs = inject(REALTIME_WARMUP_DELAY_MS);

  static readonly POLL_INTERVAL_MS = 30_000;

  private readonly availabilityStreams = new Map<
    BusCityId,
    Observable<readonly YouBikeAvailability[]>
  >();

  fetchStations(city: BusCityId): Observable<YouBikeStation[]> {
    // TDX YouBike v2 paths now require a /City/ segment:
    //   v2/Bike/Station/Taipei         → 404
    //   v2/Bike/Station/City/Taipei    → 200
    return this.tdx.get<unknown>(`v2/Bike/Station/City/${city}`).pipe(
      map((payload) => {
        const raw = unwrapEnvelope<TdxBikeStation>(payload, 'BikeStations');
        return raw.map((s) => mapStation(s, city));
      })
    );
  }

  watchAvailability(
    city: BusCityId
  ): Observable<readonly YouBikeAvailability[]> {
    let stream = this.availabilityStreams.get(city);
    if (!stream) {
      stream = timer(this.warmupDelayMs, YouBikeService.POLL_INTERVAL_MS).pipe(
        switchMap(() =>
          this.tdx.get<unknown>(`v2/Bike/Availability/City/${city}`).pipe(
            catchError((err: unknown) => {
              console.warn(`[YouBike] ${city} availability poll failed`, err);
              return of([]);
            })
          )
        ),
        map((payload) => {
          const raw = unwrapEnvelope<TdxBikeAvailability>(
            payload,
            'BikeAvailabilities'
          );
          return raw.map(mapAvailability);
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.availabilityStreams.set(city, stream);
    }
    return stream;
  }
}

export function mapStation(
  raw: TdxBikeStation,
  city: BusCityId
): YouBikeStation {
  const serviceType =
    raw.ServiceType === 1 || raw.ServiceType === 2 ? raw.ServiceType : null;
  return {
    id: `${city}-${raw.StationUID}`,
    stationUid: raw.StationUID,
    city,
    name: { zh: raw.StationName.Zh_tw, en: raw.StationName.En },
    position: {
      lat: raw.StationPosition.PositionLat,
      lng: raw.StationPosition.PositionLon,
    },
    capacity: raw.BikesCapacity ?? 0,
    serviceType,
  };
}

export function mapAvailability(
  raw: TdxBikeAvailability
): YouBikeAvailability {
  return {
    stationUid: raw.StationUID,
    serviceAvailable: raw.ServiceStatus === 1,
    availableRent: raw.AvailableRentBikes,
    availableReturn: raw.AvailableReturnBikes,
  };
}
