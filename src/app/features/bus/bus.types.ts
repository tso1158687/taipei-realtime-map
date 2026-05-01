/**
 * Internal Bus models — what the rest of the app sees after the TDX
 * response has been normalised. Stable shape; changes here are a
 * deliberate API change for downstream consumers.
 */

import type { LineGeometry } from '../../core/geometry';
import type { BusCityId } from '../../core/tdx';

export interface BusRoute {
  /** Globally unique. Format: '<City>-<RouteUID>'. */
  readonly id: string;
  readonly routeUid: string;
  readonly routeId: string;
  readonly city: BusCityId;
  readonly name: { readonly zh: string; readonly en: string };
  readonly departureStop: { readonly zh: string; readonly en: string } | null;
  readonly destinationStop: { readonly zh: string; readonly en: string } | null;
  /** Hex color, falls back to the city's brand color. */
  readonly color: string;
  /**
   * Coalesced geometry from all sub-route shapes belonging to the same
   * route. May be empty when TDX returns no shape for the route.
   */
  readonly geometry: LineGeometry;
}

export interface BusStop {
  /** Globally unique. Format: '<City>-<StopUID>'. */
  readonly id: string;
  readonly stopUid: string;
  readonly stopId: string;
  readonly city: BusCityId;
  readonly name: { readonly zh: string; readonly en: string };
  readonly position: { readonly lat: number; readonly lng: number };
  /** UIDs of routes that pass through this stop. Sorted, deduplicated. */
  readonly routeUids: readonly string[];
}

export interface BusNetwork {
  readonly city: BusCityId;
  readonly routes: readonly BusRoute[];
  readonly stops: readonly BusStop[];
}

export interface BusVehicle {
  /** PlateNumb, e.g. 'EAL-1234'. Globally unique per city + day. */
  readonly id: string;
  readonly plateNumb: string;
  readonly city: BusCityId;
  readonly routeUid: string;
  readonly routeId: string;
  readonly direction: number;
  readonly position: { readonly lat: number; readonly lng: number };
  /** Compass bearing 0..360 degrees, when reported. */
  readonly azimuth?: number;
  readonly speed?: number;
}
