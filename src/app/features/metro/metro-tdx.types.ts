/**
 * Raw response shapes from TDX V2 Metro endpoints.
 *
 * Field naming follows the upstream API exactly (PascalCase, English-only
 * keys). These types live behind the service layer; UI code should never
 * import them directly — use the internal `metro.types.ts` shapes instead.
 *
 * Many V2 endpoints return a bare array (no envelope), but a handful wrap
 * data in `{ <Key>: [...] }`. The service uses `unwrapEnvelope` to handle
 * both shapes uniformly.
 */

/** Bilingual label that TDX returns for almost every named entity. */
export interface TdxLocalizedName {
  readonly Zh_tw: string;
  readonly En: string;
}

/** `/v2/Rail/Metro/Station/{OperatorID}` → array of stations. */
export interface TdxMetroStationResponse {
  readonly UpdateTime?: string;
  readonly AuthorityCode?: string;
  readonly Stations: readonly TdxMetroStation[];
}

export interface TdxMetroStation {
  readonly StationUID: string;
  readonly StationID: string;
  readonly StationName: TdxLocalizedName;
  readonly StationPosition: {
    readonly PositionLat: number;
    readonly PositionLon: number;
    readonly GeoHash?: string;
  };
  readonly LineID?: string;
  readonly LocationCity?: string;
}

/** `/v2/Rail/Metro/StationOfLine/{OperatorID}` — maps lines to stations. */
export interface TdxMetroStationOfLineResponse {
  readonly StationOfLines: readonly TdxMetroStationOfLine[];
}

export interface TdxMetroStationOfLine {
  readonly LineID: string;
  readonly LineName?: TdxLocalizedName;
  readonly Stations: readonly { readonly StationID: string; readonly Sequence: number }[];
}

/** `/v2/Rail/Metro/Line/{OperatorID}` — line metadata + brand color. */
export interface TdxMetroLineResponse {
  readonly Lines: readonly TdxMetroLine[];
}

export interface TdxMetroLine {
  readonly LineNo?: string;
  readonly LineID: string;
  readonly LineName: TdxLocalizedName;
  /** Hex color like '#0a59ae'. Some operators omit this. */
  readonly LineColor?: string;
  readonly IsBranch?: boolean;
}

/**
 * `/v2/Rail/Metro/Shape/{OperatorID}` returns one record per line. The
 * geometry is a **WKT** string (LINESTRING / MULTILINESTRING) rather than
 * GeoJSON; passing `$format=GEOJSON` is silently ignored. We parse the WKT
 * client-side in `metro.service.ts`.
 *
 * `EncodedPolyline` is also returned (Google polyline algorithm) but we do
 * not use it — WKT is straightforward enough for our scale.
 */
export interface TdxMetroShapeResponse {
  readonly Shapes: readonly TdxMetroShape[];
}

export interface TdxMetroShape {
  readonly LineNo?: string;
  readonly LineID: string;
  readonly LineName?: TdxLocalizedName;
  /** WKT geometry: 'LINESTRING(x y, x y, ...)' or 'MULTILINESTRING((...), (...))'. */
  readonly Geometry: string;
  readonly EncodedPolyline?: string;
}

/**
 * `/v2/Rail/Metro/LiveBoard/{Operator}` — per-station live train signals.
 *
 * Each row represents the next train approaching / present at a station.
 * Schema varies a little between operators; fields below cover TRTC + TYMC.
 */
export interface TdxMetroLiveBoard {
  readonly StationID: string;
  readonly StationName?: TdxLocalizedName;
  readonly TrainNumber?: string;
  readonly LineID?: string;
  readonly Direction?: number;
  readonly DestinationStationID?: string;
  readonly DestinationStationName?: TdxLocalizedName;
  readonly TripHeadSign?: string;
  readonly EstimateTime?: number; // seconds
  readonly ServiceStatus?: number;
  readonly IsLastBound?: boolean;
  readonly UpdateTime?: string;
}
