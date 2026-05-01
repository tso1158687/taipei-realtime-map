import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  OnDestroy,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  GeoJSONSource,
  LngLatLike,
  MapGeoJSONFeature,
  MapMouseEvent,
  Popup,
} from 'maplibre-gl';
import { EMPTY, catchError, concatMap, from, mergeMap, of, timer } from 'rxjs';
import { I18nService } from '../../core/i18n';
import { MapService } from '../../core/map';
import { METRO_OPERATORS, MetroOperatorId } from '../../core/tdx';
import { MetroService } from './metro.service';
import type { MetroLine, MetroNetwork, MetroStation } from './metro.types';

/**
 * Delay (ms) that MetroLayerComponent waits between operator fetches to
 * stay under TDX free-tier rate limit (~5 requests / 10s observed).
 * Exposed as an InjectionToken so tests can override it to 0.
 */
export const METRO_RATE_LIMIT_DELAY_MS = new InjectionToken<number>(
  'METRO_RATE_LIMIT_DELAY_MS',
  { providedIn: 'root', factory: () => 11_000 }
);

/**
 * Renders Metro static data (lines + stations) onto the shared MapLibre map.
 *
 * Pattern:
 *   1. Watch `MapService.isReady` via `effect()`; do nothing until the map
 *      has fired its `load` event.
 *   2. Fetch each Metro operator's network via `MetroService`.
 *   3. Add a GeoJSON source + line layer per operator (lines below points).
 *   4. Add a circle layer for stations and bind click → popup.
 *
 * Cleanup: removes any sources/layers it created on destroy, and closes the
 * active popup. Idempotent against re-renders thanks to `getSource`/`setData`.
 */
@Component({
  selector: 'app-metro-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class MetroLayerComponent implements OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly metro = inject(MetroService);
  private readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rateLimitDelayMs = inject(METRO_RATE_LIMIT_DELAY_MS);

  private readonly addedSources = new Set<string>();
  private readonly addedLayers = new Set<string>();
  private popup: Popup | null = null;
  private loaded = false;

  constructor() {
    effect(() => {
      if (this.mapService.isReady() && !this.loaded) {
        this.loaded = true;
        this.loadAllOperators();
      }
    });
  }

  private loadAllOperators(): void {
    const operatorIds = Object.keys(METRO_OPERATORS) as MetroOperatorId[];

    // Sequential per operator: first fires immediately, subsequent operators
    // wait RATE_LIMIT_DELAY_MS so the previous TDX rate-limit window has
    // rolled off. Server-side cache means the wait only matters on first
    // visit — warm cache returns each request instantly without hitting TDX.
    from(operatorIds)
      .pipe(
        concatMap((operatorId, index) => {
          // First operator fires synchronously; subsequent ones wait for the
          // rate-limit window. When the delay is 0 (e.g. in tests) we use a
          // synchronous `of` instead of `timer(0)` so microtask flush via
          // `whenStable()` is enough to observe the next call.
          const delay =
            index === 0 ? 0 : Math.max(0, this.rateLimitDelayMs);
          const wait$ = delay > 0 ? timer(delay) : of(0);
          return wait$.pipe(
            mergeMap(() => this.metro.fetchNetwork(operatorId)),
            catchError((err) => {
              console.error(
                `[MetroLayer] failed to load ${operatorId}`,
                err
              );
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((net) => this.renderNetwork(net));
  }

  private renderNetwork(network: MetroNetwork): void {
    if (!this.mapService.isInitialized()) return;
    this.upsertLines(network.operatorId, network.lines);
    this.upsertStations(network.operatorId, network.stations);
  }

  // ---- lines -------------------------------------------------------------

  private upsertLines(
    operatorId: MetroOperatorId,
    lines: readonly MetroLine[]
  ): void {
    const map = this.mapService.getMap();
    const sourceId = `metro-lines-${operatorId}`;
    const layerId = `metro-lines-layer-${operatorId}`;
    const data = this.toLinesFeatureCollection(lines);

    const existing = map.getSource(sourceId);
    if (existing) {
      (existing as GeoJSONSource).setData(data);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data });
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          1.5,
          14,
          4,
          18,
          8,
        ],
        'line-opacity': 0.85,
      },
    });
    this.addedSources.add(sourceId);
    this.addedLayers.add(layerId);
  }

  private toLinesFeatureCollection(
    lines: readonly MetroLine[]
  ): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const line of lines) {
      const properties = {
        lineId: line.lineId,
        operatorId: line.operatorId,
        color: line.color,
        nameZh: line.name.zh,
        nameEn: line.name.en,
      };
      if (line.geometry.type === 'LineString') {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: line.geometry.coordinates.map((c) => [c[0], c[1]]),
          },
          properties,
        });
      } else {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'MultiLineString',
            coordinates: line.geometry.coordinates.map((arr) =>
              arr.map((c) => [c[0], c[1]])
            ),
          },
          properties,
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }

  // ---- stations ----------------------------------------------------------

  private upsertStations(
    operatorId: MetroOperatorId,
    stations: readonly MetroStation[]
  ): void {
    const map = this.mapService.getMap();
    const sourceId = `metro-stations-${operatorId}`;
    const layerId = `metro-stations-layer-${operatorId}`;
    const data = this.toStationsFeatureCollection(stations);

    const existing = map.getSource(sourceId);
    if (existing) {
      (existing as GeoJSONSource).setData(data);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data });
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          2.5,
          14,
          5,
          18,
          9,
        ],
        'circle-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-stroke-color': METRO_OPERATORS[operatorId].color,
      },
    });
    this.addedSources.add(sourceId);
    this.addedLayers.add(layerId);

    // Click → popup. mouseenter/leave changes cursor for affordance.
    map.on('click', layerId, (e) => this.handleStationClick(e));
    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
    });
  }

  private toStationsFeatureCollection(
    stations: readonly MetroStation[]
  ): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: stations.map((s) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.position.lng, s.position.lat],
        },
        properties: {
          id: s.id,
          stationId: s.stationId,
          operatorId: s.operatorId,
          nameZh: s.name.zh,
          nameEn: s.name.en,
          lineIds: s.lineIds.join(','),
        },
      })),
    };
  }

  // ---- popup -------------------------------------------------------------

  private handleStationClick(
    event: MapMouseEvent & { features?: MapGeoJSONFeature[] }
  ): void {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const coords = feature.geometry.coordinates as [number, number];
    const props = (feature.properties ?? {}) as Record<string, string>;
    const operatorMeta = METRO_OPERATORS[props['operatorId'] as MetroOperatorId];

    const dom = this.buildPopupDom(props, operatorMeta?.color ?? '#666');
    this.popup?.remove();
    this.popup = new Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(coords as LngLatLike)
      .setDOMContent(dom)
      .addTo(this.mapService.getMap());
  }

  private buildPopupDom(
    props: Record<string, string>,
    accentColor: string
  ): HTMLElement {
    // setDOMContent rather than setHTML avoids any concerns about XSS in
    // station names from upstream data.
    const wrapper = document.createElement('div');
    wrapper.className = 'metro-popup';
    wrapper.style.fontFamily = 'inherit';
    wrapper.style.minWidth = '180px';

    const accent = document.createElement('div');
    accent.style.borderLeft = `4px solid ${accentColor}`;
    accent.style.paddingLeft = '8px';
    wrapper.appendChild(accent);

    // When the user has switched to English we surface the English name as
    // the primary line and demote the Chinese name to the subtitle (and
    // vice versa). The locale snapshot is captured when the popup opens;
    // toggling the language while a popup is open does not retro-fit.
    const isEn = this.i18n.locale() === 'en';
    const primaryText = (isEn ? props['nameEn'] : props['nameZh']) ?? '';
    const secondaryText = (isEn ? props['nameZh'] : props['nameEn']) ?? '';

    const primary = document.createElement('div');
    primary.style.fontWeight = '600';
    primary.style.fontSize = '14px';
    primary.textContent = primaryText;
    accent.appendChild(primary);

    if (secondaryText) {
      const secondary = document.createElement('div');
      secondary.style.color = '#555';
      secondary.style.fontSize = '12px';
      secondary.textContent = secondaryText;
      accent.appendChild(secondary);
    }

    if (props['lineIds']) {
      const lines = document.createElement('div');
      lines.style.marginTop = '4px';
      lines.style.fontSize = '11px';
      lines.style.color = '#777';
      lines.textContent = props['lineIds'].split(',').join(' · ');
      accent.appendChild(lines);
    }

    return wrapper;
  }

  // ---- lifecycle ---------------------------------------------------------

  ngOnDestroy(): void {
    this.popup?.remove();
    if (!this.mapService.isInitialized()) return;
    const map = this.mapService.getMap();
    for (const id of this.addedLayers) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of this.addedSources) {
      if (map.getSource(id)) map.removeSource(id);
    }
    this.addedLayers.clear();
    this.addedSources.clear();
  }
}
