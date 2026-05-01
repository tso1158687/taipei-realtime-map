import type { TdxLocalizedName } from '../bus/bus-tdx.types';

/** `/v2/Rail/TRA/Station` and `/v2/Rail/THSR/Station` share a similar shape. */
export interface TdxRailStation {
  readonly StationUID: string;
  readonly StationID: string;
  readonly StationName: TdxLocalizedName;
  readonly StationPosition: {
    readonly PositionLat: number;
    readonly PositionLon: number;
  };
  readonly StationAddress?: string;
  readonly StationClass?: string | number;
}

/** `/v2/Rail/TRA/Line` — TRA railway line metadata. */
export interface TdxTraLine {
  readonly LineNo?: string;
  readonly LineID: string;
  readonly LineName: TdxLocalizedName;
  readonly LineColor?: string;
  readonly IsBranch?: boolean;
}

/** `/v2/Rail/TRA/Shape` and `/v2/Rail/THSR/Shape` — WKT geometry per line. */
export interface TdxRailShape {
  readonly LineID: string;
  readonly LineName?: TdxLocalizedName;
  readonly Geometry: string;
  readonly EncodedPolyline?: string;
}

/** `/v2/Rail/TRA/StationOfLine` — line → stations sequence. */
export interface TdxTraStationOfLine {
  readonly LineID: string;
  readonly LineName?: TdxLocalizedName;
  readonly Stations: readonly {
    readonly StationID: string;
    readonly StationName?: TdxLocalizedName;
    readonly Sequence: number;
  }[];
}

/** `/v2/Rail/TRA/TrainLiveBoard` — per-train station signal. */
export interface TdxTraTrainLiveBoard {
  readonly TrainNo: string;
  readonly TrainTypeID?: string;
  readonly TrainTypeName?: TdxLocalizedName;
  readonly StationID: string;
  readonly StationName?: TdxLocalizedName;
  readonly TrainStationStatus: number; // 0 enroute / 1 stopped at station / 2 leaving etc
  readonly DelayTime: number; // minutes
  readonly ScheduledArrivalTime?: string;
  readonly ScheduledDepartureTime?: string;
  readonly RunningDirection?: number;
  readonly EndingStationID?: string;
  readonly EndingStationName?: TdxLocalizedName;
}
