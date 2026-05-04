import type {
  ThsrInferredPosition,
  ThsrScheduledStop,
  ThsrScheduledTrain,
} from './thsr-timetable.types';

/**
 * Pure helpers for inferring THSR train positions from timetable data.
 *
 * THSR has no per-train GPS in TDX V2 — we know the schedule and the
 * station coordinates, and that's it. The inference is intentionally
 * naive (no real-time delay correction) but accurate enough to give the
 * map a sense of "trains are moving" instead of just static rails.
 */

/** Convert "HH:MM" + a `YYYY-MM-DD` date string to an epoch ms timestamp. */
export function combineDateTime(dateYmd: string, hhmm: string): number {
  // Parse manually so we always get local time interpretation regardless
  // of how the host's Date parser handles ambiguous formats.
  const [y, mo, d] = dateYmd.split('-').map((s) => parseInt(s, 10));
  const [h, mi] = hhmm.split(':').map((s) => parseInt(s, 10));
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return Number.NaN;
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

/**
 * Where is `train` at `nowMs`?
 *
 *   - If `now` is before the first stop or after the last → null (not
 *     running yet / already finished).
 *   - If `now` is within a stop's [arrival, departure] window → atStation
 *     marker at that stop's coordinates.
 *   - Otherwise: linearly interpolate between the previous stop's
 *     departure and the next stop's arrival.
 *
 * `coordsByStationId` maps stationId → {lat, lng}. Trains whose stops
 * include unknown stations are skipped (return null) — better to omit
 * than to teleport.
 */
export function inferPosition(
  train: ThsrScheduledTrain,
  nowMs: number,
  coordsByStationId: ReadonlyMap<
    string,
    { readonly lat: number; readonly lng: number }
  >
): ThsrInferredPosition | null {
  const stops = train.stops;
  if (stops.length < 2) return null;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (nowMs < first.arrivalMs - 60_000) return null; // not yet started
  if (nowMs > last.departureMs + 60_000) return null; // already arrived

  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i];
    if (nowMs >= stop.arrivalMs && nowMs <= stop.departureMs) {
      const c = coordsByStationId.get(stop.stationId);
      if (!c) return null;
      return makeAtStation(train, stop, c);
    }
    if (i + 1 < stops.length) {
      const next = stops[i + 1];
      if (nowMs > stop.departureMs && nowMs < next.arrivalMs) {
        const a = coordsByStationId.get(stop.stationId);
        const b = coordsByStationId.get(next.stationId);
        if (!a || !b) return null;
        const span = next.arrivalMs - stop.departureMs;
        const progress = span > 0 ? (nowMs - stop.departureMs) / span : 0;
        return {
          trainNo: train.trainNo,
          direction: train.direction,
          destination: train.destination,
          position: {
            lat: a.lat + (b.lat - a.lat) * progress,
            lng: a.lng + (b.lng - a.lng) * progress,
          },
          atStation: false,
          nearestStationId: stop.stationId,
          progress,
        };
      }
    }
  }
  return null;
}

function makeAtStation(
  train: ThsrScheduledTrain,
  stop: ThsrScheduledStop,
  coord: { readonly lat: number; readonly lng: number }
): ThsrInferredPosition {
  return {
    trainNo: train.trainNo,
    direction: train.direction,
    destination: train.destination,
    position: { lat: coord.lat, lng: coord.lng },
    atStation: true,
    nearestStationId: stop.stationId,
    progress: Number.NaN,
  };
}

/** Bulk variant — returns positions for every train currently in service. */
export function inferAllPositions(
  trains: readonly ThsrScheduledTrain[],
  nowMs: number,
  coordsByStationId: ReadonlyMap<
    string,
    { readonly lat: number; readonly lng: number }
  >
): ThsrInferredPosition[] {
  const out: ThsrInferredPosition[] = [];
  for (const t of trains) {
    const p = inferPosition(t, nowMs, coordsByStationId);
    if (p) out.push(p);
  }
  return out;
}
