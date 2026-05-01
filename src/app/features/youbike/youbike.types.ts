import type { BusCityId } from '../../core/tdx';

export interface YouBikeStation {
  /** Format: '<City>-<StationUID>'. */
  readonly id: string;
  readonly stationUid: string;
  readonly city: BusCityId;
  readonly name: { readonly zh: string; readonly en: string };
  readonly position: { readonly lat: number; readonly lng: number };
  readonly capacity: number;
  /** 1 = YouBike 1.0, 2 = 2.0. Defaults to 2 when unknown. */
  readonly serviceType: 1 | 2 | null;
}

export interface YouBikeAvailability {
  readonly stationUid: string;
  /** false → station out of service; rent/return counts may be stale. */
  readonly serviceAvailable: boolean;
  readonly availableRent: number;
  readonly availableReturn: number;
}
