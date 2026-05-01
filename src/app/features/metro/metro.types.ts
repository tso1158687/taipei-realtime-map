/**
 * Internal Metro models — what the rest of the app sees after the
 * TDX response has been normalised. Stable shape: changes here are a
 * deliberate API change for downstream consumers (UI components, tests).
 */

import type { LineGeometry } from '../../core/geometry';
import type { MetroOperatorId } from '../../core/tdx';

export interface MetroStation {
  /** Globally unique. Format: '<OperatorID>-<StationID>', e.g. 'TRTC-BR01'. */
  readonly id: string;
  readonly stationId: string;
  readonly operatorId: MetroOperatorId;
  readonly name: { readonly zh: string; readonly en: string };
  readonly position: { readonly lat: number; readonly lng: number };
  /** All lines this station serves. Empty for systems we couldn't resolve. */
  readonly lineIds: readonly string[];
}

export interface MetroLine {
  /** Format: '<OperatorID>-<LineID>', e.g. 'TRTC-BR'. */
  readonly id: string;
  readonly lineId: string;
  readonly operatorId: MetroOperatorId;
  readonly name: { readonly zh: string; readonly en: string };
  /** Hex color with leading '#'. Falls back to the operator brand color when TDX omits one. */
  readonly color: string;
  /** Route geometry; one or more LineStrings. */
  readonly geometry: MetroLineGeometry;
}

/** @deprecated Use `LineGeometry` from `core/geometry`. Kept as alias for backwards compat. */
export type MetroLineGeometry = LineGeometry;

export interface MetroNetwork {
  readonly operatorId: MetroOperatorId;
  readonly stations: readonly MetroStation[];
  readonly lines: readonly MetroLine[];
}

export interface MetroTrainSignal {
  readonly trainNumber: string;
  readonly operatorId: MetroOperatorId;
  readonly stationId: string;
  readonly lineId?: string;
  readonly direction?: number;
  readonly destinationStationId?: string;
  readonly destinationName?: { readonly zh: string; readonly en: string };
  readonly estimateTimeSeconds?: number;
}
