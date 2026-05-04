/**
 * Raw response shapes from `/v2/Rail/THSR/DailyTimetable/Today`.
 *
 * Field names follow TDX exactly. Times are local "HH:MM" strings (no
 * timezone, no seconds), to be combined with the per-row `TrainDate`
 * (YYYY-MM-DD) when reconstructing absolute timestamps.
 */

interface TdxLocalizedName {
  readonly Zh_tw: string;
  readonly En: string;
}

export interface TdxThsrTrainInfo {
  readonly TrainNo: string;
  readonly Direction: 0 | 1; // 0 = south-bound, 1 = north-bound
  readonly StartingStationID: string;
  readonly StartingStationName: TdxLocalizedName;
  readonly EndingStationID: string;
  readonly EndingStationName: TdxLocalizedName;
  readonly Note?: Record<string, unknown>;
}

export interface TdxThsrStopTime {
  readonly StopSequence: number;
  readonly StationID: string;
  readonly StationName: TdxLocalizedName;
  /** "HH:MM" — local time, same date as `TrainDate`. */
  readonly ArrivalTime: string;
  readonly DepartureTime: string;
}

export interface TdxThsrDailyTimetableRow {
  readonly TrainDate: string; // "YYYY-MM-DD"
  readonly DailyTrainInfo: TdxThsrTrainInfo;
  readonly StopTimes: readonly TdxThsrStopTime[];
}

// ---------------------------------------------------------------------------
// Internal shapes — UI layer talks to these.
// ---------------------------------------------------------------------------

/** A train scheduled to run today. */
export interface ThsrScheduledTrain {
  readonly trainNo: string;
  readonly direction: 0 | 1;
  readonly origin: { readonly zh: string; readonly en: string };
  readonly destination: { readonly zh: string; readonly en: string };
  readonly stops: readonly ThsrScheduledStop[];
}

export interface ThsrScheduledStop {
  readonly sequence: number;
  readonly stationId: string;
  /** Epoch ms — already combined with TrainDate. */
  readonly arrivalMs: number;
  readonly departureMs: number;
}

/** Output of the position inference: where a train is at a given moment. */
export interface ThsrInferredPosition {
  readonly trainNo: string;
  readonly direction: 0 | 1;
  readonly destination: { readonly zh: string; readonly en: string };
  readonly position: { readonly lat: number; readonly lng: number };
  /** True when the train is dwelling at a station; false when between two stops. */
  readonly atStation: boolean;
  /** Station id when atStation; otherwise the previous stop's id. */
  readonly nearestStationId: string;
  /** 0 → just left previous stop, 1 → arriving at next stop. NaN when atStation. */
  readonly progress: number;
}
