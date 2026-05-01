/**
 * Raw response shapes from TDX V3 Metro endpoints.
 *
 * Field naming follows the upstream API exactly (PascalCase, English-only
 * keys). These types live behind the service layer; UI code should never
 * import them directly — use the internal `metro.types.ts` shapes instead.
 *
 * The shapes are intentionally narrow (containing only what the app uses).
 * Optional fields are marked `?` so adding new properties does not break
 * existing callers when TDX evolves.
 */

/** Bilingual label that TDX returns for almost every named entity. */
export interface TdxLocalizedName {
  readonly Zh_tw: string;
  readonly En: string;
}

/** Envelope wrapping `Stations` for `/v3/Rail/Metro/Station/{OperatorID}`. */
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

/** Envelope for `/v3/Rail/Metro/StationOfLine/{OperatorID}` — maps lines to stations. */
export interface TdxMetroStationOfLineResponse {
  readonly StationOfLines: readonly TdxMetroStationOfLine[];
}

export interface TdxMetroStationOfLine {
  readonly LineID: string;
  readonly LineName?: TdxLocalizedName;
  readonly Stations: readonly { readonly StationID: string; readonly Sequence: number }[];
}

/** Envelope for `/v3/Rail/Metro/Line/{OperatorID}` — line metadata + brand color. */
export interface TdxMetroLineResponse {
  readonly Lines: readonly TdxMetroLine[];
}

export interface TdxMetroLine {
  readonly LineID: string;
  readonly LineName: TdxLocalizedName;
  /** Hex color like '#a35e2c'. Some operators omit this. */
  readonly LineColor?: string;
}

/**
 * `/v3/Rail/Metro/Shape/{OperatorID}?$format=GEOJSON` returns a GeoJSON
 * FeatureCollection. We keep it minimal here.
 */
export interface TdxMetroShapeFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly TdxMetroShapeFeature[];
}

export interface TdxMetroShapeFeature {
  readonly type: 'Feature';
  readonly geometry:
    | TdxLineStringGeometry
    | TdxMultiLineStringGeometry;
  readonly properties: TdxMetroShapeProperties;
}

export interface TdxLineStringGeometry {
  readonly type: 'LineString';
  readonly coordinates: ReadonlyArray<readonly [number, number]>;
}

export interface TdxMultiLineStringGeometry {
  readonly type: 'MultiLineString';
  readonly coordinates: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

export interface TdxMetroShapeProperties {
  readonly LineID?: string;
  readonly LineName_Zh_tw?: string;
  readonly LineName_En?: string;
}
