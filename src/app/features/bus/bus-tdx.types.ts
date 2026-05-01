/**
 * Raw response shapes from TDX V2 Bus endpoints.
 *
 * Field naming follows the upstream API exactly (PascalCase + Zh_tw / En
 * subfields, or flat *Zh / *En suffix in some cases). Internal app code
 * should never import these directly — use `bus.types.ts`.
 *
 * V2 Bus endpoints all return bare arrays; the envelope-style wrapper does
 * not appear in practice, but `unwrapEnvelope` handles both for safety.
 */

import type { TdxLocalizedName } from '../metro/metro-tdx.types';

export type { TdxLocalizedName };

/** `/v2/Bus/Route/City/{City}` — list of routes with metadata. */
export interface TdxBusRoute {
  readonly RouteUID: string;
  readonly RouteID: string;
  readonly RouteName: TdxLocalizedName;
  readonly DepartureStopNameZh?: string;
  readonly DepartureStopNameEn?: string;
  readonly DestinationStopNameZh?: string;
  readonly DestinationStopNameEn?: string;
  readonly City?: string;
  readonly CityCode?: string;
  readonly BusRouteType?: number;
  readonly HasSubRoutes?: boolean;
}

/** `/v2/Bus/StopOfRoute/City/{City}` — stops grouped by route + direction. */
export interface TdxBusStopOfRoute {
  readonly RouteUID: string;
  readonly RouteID: string;
  readonly RouteName: TdxLocalizedName;
  readonly Direction: number;
  readonly Stops: readonly TdxBusStop[];
}

export interface TdxBusStop {
  readonly StopUID: string;
  readonly StopID: string;
  readonly StopName: TdxLocalizedName;
  readonly StopBoarding?: number;
  readonly StopSequence: number;
  readonly StopPosition: {
    readonly PositionLat: number;
    readonly PositionLon: number;
    readonly GeoHash?: string;
  };
}

/**
 * `/v2/Bus/Shape/City/{City}` — WKT geometry per route + direction.
 * Same WKT shape as the Metro Shape endpoint.
 */
export interface TdxBusShape {
  readonly RouteUID: string;
  readonly RouteID: string;
  readonly RouteName?: TdxLocalizedName;
  readonly SubRouteUID?: string;
  readonly SubRouteID?: string;
  readonly Direction?: number;
  readonly Geometry: string; // WKT LINESTRING / MULTILINESTRING
  readonly EncodedPolyline?: string;
}

/** `/v2/Bus/RealTimeByFrequency/City/{City}` — A1 GPS vehicle positions. */
export interface TdxBusVehicle {
  readonly PlateNumb: string;
  readonly OperatorID?: string;
  readonly RouteUID: string;
  readonly RouteID: string;
  readonly RouteName?: TdxLocalizedName;
  readonly SubRouteUID?: string;
  readonly SubRouteID?: string;
  readonly Direction: number;
  readonly BusPosition: {
    readonly PositionLat: number;
    readonly PositionLon: number;
  };
  readonly Speed?: number;
  readonly Azimuth?: number;
  readonly DutyStatus?: number;
  readonly BusStatus?: number;
  readonly GPSTime?: string;
  readonly UpdateTime?: string;
}
