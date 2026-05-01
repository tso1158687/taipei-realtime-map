import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { parseWktGeometry, type LineGeometry } from '../../core/geometry';
import {
  BUS_CITIES,
  type BusCityId,
  TdxBaseService,
  unwrapEnvelope,
} from '../../core/tdx';
import type {
  TdxBusEta,
  TdxBusRoute,
  TdxBusShape,
  TdxBusStopOfRoute,
} from './bus-tdx.types';
import type { BusEta, BusNetwork, BusRoute, BusStop } from './bus.types';

/**
 * Service for loading static Bus data from TDX V2.
 *
 * Public surface mirrors `MetroService`:
 *   - `fetchRoutes(city)`  → routes with coalesced geometry
 *   - `fetchStops(city)`   → stops with route-uid back-links
 *   - `fetchNetwork(city)` → both, forkJoined
 *
 * Internal mappers are exported for unit tests; production callers use
 * the methods on the service.
 */
@Injectable({ providedIn: 'root' })
export class BusService {
  private readonly tdx = inject(TdxBaseService);

  fetchRoutes(city: BusCityId): Observable<BusRoute[]> {
    return forkJoin({
      routes: this.tdx.get<unknown>(`v2/Bus/Route/City/${city}`),
      shapes: this.tdx.get<unknown>(`v2/Bus/Shape/City/${city}`),
    }).pipe(
      map(({ routes, shapes }) => {
        const rawRoutes = unwrapEnvelope<TdxBusRoute>(routes, 'BusRoutes');
        const rawShapes = unwrapEnvelope<TdxBusShape>(shapes, 'BusShapes');
        return mergeRoutesAndShapes(rawRoutes, rawShapes, city);
      })
    );
  }

  fetchStops(city: BusCityId): Observable<BusStop[]> {
    return this.tdx
      .get<unknown>(`v2/Bus/StopOfRoute/City/${city}`)
      .pipe(
        map((payload) => {
          const raw = unwrapEnvelope<TdxBusStopOfRoute>(
            payload,
            'BusStopOfRoutes'
          );
          return aggregateStops(raw, city);
        })
      );
  }

  fetchNetwork(city: BusCityId): Observable<BusNetwork> {
    return forkJoin({
      routes: this.fetchRoutes(city),
      stops: this.fetchStops(city),
    }).pipe(map(({ routes, stops }) => ({ city, routes, stops })));
  }

  /**
   * Estimated arrival times at a single stop. Filtered server-side via
   * OData `$filter` so we don't pull the full city payload (~tens of MB)
   * just to find ~10 entries.
   */
  fetchEtas(city: BusCityId, stopUid: string): Observable<BusEta[]> {
    return this.tdx
      .get<unknown>(`v2/Bus/EstimatedTimeOfArrival/City/${city}`, {
        $filter: `StopUID eq '${stopUid}'`,
        $top: 50,
      })
      .pipe(
        map((payload) => {
          const raw = unwrapEnvelope<TdxBusEta>(
            payload,
            'BusEstimatedTimeOfArrivalDatas'
          );
          return raw.map(mapEta);
        })
      );
  }
}

export function mapEta(raw: TdxBusEta): BusEta {
  return {
    stopUid: raw.StopUID,
    routeUid: raw.RouteUID,
    routeId: raw.RouteID,
    routeName: {
      zh: raw.RouteName?.Zh_tw ?? '',
      en: raw.RouteName?.En ?? '',
    },
    direction: raw.Direction,
    estimateTimeSeconds: raw.EstimateTime,
    stopStatus: raw.StopStatus,
  };
}

// ---------------------------------------------------------------------------
// Mapping helpers — exported for tests
// ---------------------------------------------------------------------------

const EMPTY_GEOMETRY: LineGeometry = { type: 'LineString', coordinates: [] };

export function mergeRoutesAndShapes(
  rawRoutes: readonly TdxBusRoute[],
  rawShapes: readonly TdxBusShape[],
  city: BusCityId
): BusRoute[] {
  const fallbackColor = BUS_CITIES[city].color;
  const shapeByRouteUid = groupShapesByRouteUid(rawShapes);
  return rawRoutes.map((r) => {
    const departure =
      r.DepartureStopNameZh || r.DepartureStopNameEn
        ? {
            zh: r.DepartureStopNameZh ?? '',
            en: r.DepartureStopNameEn ?? '',
          }
        : null;
    const destination =
      r.DestinationStopNameZh || r.DestinationStopNameEn
        ? {
            zh: r.DestinationStopNameZh ?? '',
            en: r.DestinationStopNameEn ?? '',
          }
        : null;
    return {
      id: `${city}-${r.RouteUID}`,
      routeUid: r.RouteUID,
      routeId: r.RouteID,
      city,
      name: { zh: r.RouteName.Zh_tw, en: r.RouteName.En },
      departureStop: departure,
      destinationStop: destination,
      color: fallbackColor,
      geometry: shapeByRouteUid.get(r.RouteUID) ?? EMPTY_GEOMETRY,
    };
  });
}

/**
 * One TDX route may have multiple shape entries (one per direction or
 * sub-route). Coalesce them into a single MultiLineString so MapLibre
 * renders a route as one logical feature.
 */
function groupShapesByRouteUid(
  shapes: readonly TdxBusShape[]
): Map<string, LineGeometry> {
  const buckets = new Map<string, [number, number][][]>();
  for (const s of shapes) {
    const parsed = parseWktGeometry(s.Geometry);
    if (!parsed) continue;
    const list = buckets.get(s.RouteUID) ?? [];
    if (parsed.type === 'LineString') {
      list.push(parsed.coordinates.map((c) => [c[0], c[1]]));
    } else {
      for (const part of parsed.coordinates) {
        list.push(part.map((c) => [c[0], c[1]]));
      }
    }
    buckets.set(s.RouteUID, list);
  }
  const out = new Map<string, LineGeometry>();
  for (const [routeUid, lines] of buckets) {
    if (lines.length === 1) {
      out.set(routeUid, { type: 'LineString', coordinates: lines[0] });
    } else if (lines.length > 1) {
      out.set(routeUid, { type: 'MultiLineString', coordinates: lines });
    }
  }
  return out;
}

/**
 * `StopOfRoute` returns one record per (route, direction). The same physical
 * stop appears under many records. Aggregate so each stop is emitted once
 * with the union of route uids that touch it.
 */
export function aggregateStops(
  rows: readonly TdxBusStopOfRoute[],
  city: BusCityId
): BusStop[] {
  const byUid = new Map<
    string,
    {
      stop: TdxBusStopOfRoute['Stops'][number];
      routeUids: Set<string>;
    }
  >();
  for (const row of rows) {
    for (const stop of row.Stops ?? []) {
      const entry = byUid.get(stop.StopUID);
      if (entry) {
        entry.routeUids.add(row.RouteUID);
      } else {
        byUid.set(stop.StopUID, {
          stop,
          routeUids: new Set([row.RouteUID]),
        });
      }
    }
  }
  return [...byUid.values()].map(({ stop, routeUids }) => ({
    id: `${city}-${stop.StopUID}`,
    stopUid: stop.StopUID,
    stopId: stop.StopID,
    city,
    name: { zh: stop.StopName.Zh_tw, en: stop.StopName.En },
    position: {
      lat: stop.StopPosition.PositionLat,
      lng: stop.StopPosition.PositionLon,
    },
    routeUids: [...routeUids].sort(),
  }));
}
