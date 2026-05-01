import type { LineGeometry } from '../../core/geometry';
import type { RailOperatorId } from '../../core/tdx';

export type RailMode = RailOperatorId; // 'TRA' | 'THSR'

export interface RailStation {
  /** Format: '<RailMode>-<StationUID>'. */
  readonly id: string;
  readonly stationId: string;
  readonly mode: RailMode;
  readonly name: { readonly zh: string; readonly en: string };
  readonly position: { readonly lat: number; readonly lng: number };
}

export interface RailLine {
  readonly id: string;
  readonly lineId: string;
  readonly mode: RailMode;
  readonly name: { readonly zh: string; readonly en: string };
  readonly color: string;
  readonly geometry: LineGeometry;
}

export interface RailNetwork {
  readonly mode: RailMode;
  readonly stations: readonly RailStation[];
  readonly lines: readonly RailLine[];
}

export interface TraTrainLive {
  readonly trainNo: string;
  readonly trainTypeName?: { readonly zh: string; readonly en: string };
  readonly stationId: string;
  readonly stationName?: { readonly zh: string; readonly en: string };
  readonly status: number;
  readonly delayMinutes: number;
  readonly endingStationName?: { readonly zh: string; readonly en: string };
}
