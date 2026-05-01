import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { EMPTY, catchError, concatMap, from, mergeMap, of, tap, timer } from 'rxjs';
import { I18nService } from '../../core/i18n';
import { LayerStateService } from '../../core/layer-state';
import { MapService } from '../../core/map';
import {
  BUS_CITIES,
  BusCityId,
  TDX_RATE_LIMIT_DELAY_MS,
} from '../../core/tdx';
import { BusService } from './bus.service';
import type { BusEta, BusNetwork, BusRoute, BusStop } from './bus.types';

const layerKeyFor = (city: BusCityId): string => `bus.${city}`;

function formatEta(eta: BusEta, isEn: boolean): string {
  // Status codes: 0 normal, 1 not running, 2 not started, 3 detour, 4 at stop, 5 halted
  if (eta.stopStatus === 1) return isEn ? 'Not running' : '今日停駛';
  if (eta.stopStatus === 2) return isEn ? 'Not started' : '尚未發車';
  if (eta.stopStatus === 3) return isEn ? 'Detoured' : '繞道';
  if (eta.stopStatus === 4) return isEn ? 'At stop' : '進站中';
  if (eta.stopStatus === 5) return isEn ? 'Halted' : '暫停';
  if (eta.estimateTimeSeconds == null) return isEn ? 'Unknown' : '—';
  if (eta.estimateTimeSeconds < 60) return isEn ? 'Approaching' : '即將進站';
  const minutes = Math.round(eta.estimateTimeSeconds / 60);
  return isEn ? `${minutes} min` : `${minutes} 分鐘`;
}

/**
 * Renders Bus static data (routes + stops) for all four covered cities
 * (Taipei + NewTaipei + Taoyuan + Keelung) onto the shared MapLibre map.
 *
 * Bus data is dense (~700 routes × ~5000 stops per city) so we lean on
 * MapLibre layer minzoom thresholds to keep the rendering legible:
 *   - bus-routes-* layers: minzoom 10
 *   - bus-stops-*  layers: minzoom 12
 *
 * Cities are fetched sequentially with TDX_RATE_LIMIT_DELAY_MS spacing to
 * avoid blowing the free-tier 5 reqs / 10s rate limit. Server-side cache
 * makes warm reloads instant; only first cold visit pays the wait.
 */
@Component({
  selector: 'app-bus-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class BusLayerComponent implements OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly bus = inject(BusService);
  private readonly i18n = inject(I18nService);
  private readonly layerState = inject(LayerStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rateLimitDelayMs = inject(TDX_RATE_LIMIT_DELAY_MS);

  private readonly addedSources = new Set<string>();
  private readonly addedLayers = new Set<string>();
  private popup: Popup | null = null;
  private loaded = false;

  constructor() {
    for (const city of Object.keys(BUS_CITIES) as BusCityId[]) {
      const meta = BUS_CITIES[city];
      this.layerState.register(layerKeyFor(city), {
        zh: `${meta.nameZh}公車`,
        en: `${meta.nameEn} Bus`,
      });
    }

    effect(() => {
      if (this.mapService.isReady() && !this.loaded) {
        this.loaded = true;
        this.loadAllCities();
      }
    });

    effect(() => {
      const isReady = this.mapService.isReady();
      const layers = this.layerState.layers();
      if (!isReady) return;
      const map = this.mapService.getMap();
      for (const layer of layers) {
        if (!layer.key.startsWith('bus.')) continue;
        const city = layer.key.slice('bus.'.length) as BusCityId;
        const visStr = layer.visible ? 'visible' : 'none';
        for (const layerId of [
          `bus-routes-layer-${city}`,
          `bus-stops-layer-${city}`,
        ]) {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', visStr);
          }
        }
      }
    });
  }

  private loadAllCities(): void {
    const cities = Object.keys(BUS_CITIES) as BusCityId[];
    for (const city of cities) {
      this.layerState.setStatus(layerKeyFor(city), 'loading');
    }

    // Cities still concatMap'd (sequential) so the layer panel ticks one
    // at a time, but global TdxScheduler enforces the actual rate limit
    // across all features → no need for an extra feature offset here.
    from(cities)
      .pipe(
        concatMap((city) => {
          const baseDelay = Math.max(0, this.rateLimitDelayMs);
          const wait$ = baseDelay > 0 ? timer(0) : of(0);
          return wait$.pipe(
            mergeMap(() => this.bus.fetchNetwork(city)),
            tap((net) => {
              this.renderNetwork(net);
              this.layerState.setStatus(layerKeyFor(city), 'loaded');
            }),
            catchError((err: unknown) => {
              console.error(`[BusLayer] failed to load ${city}`, err);
              const msg = err instanceof Error ? err.message : String(err);
              this.layerState.setStatus(
                layerKeyFor(city),
                'error',
                msg
              );
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private renderNetwork(network: BusNetwork): void {
    if (!this.mapService.isInitialized()) return;
    this.upsertRoutes(network.city, network.routes);
    this.upsertStops(network.city, network.stops);
  }

  // ---- routes ------------------------------------------------------------

  private upsertRoutes(
    city: BusCityId,
    routes: readonly BusRoute[]
  ): void {
    const map = this.mapService.getMap();
    const sourceId = `bus-routes-${city}`;
    const layerId = `bus-routes-layer-${city}`;
    const data = this.toRoutesFeatureCollection(routes);

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
      minzoom: 10,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          0.8,
          14,
          1.6,
          18,
          3.2,
        ],
        'line-opacity': 0.55,
      },
    });
    this.addedSources.add(sourceId);
    this.addedLayers.add(layerId);
  }

  private toRoutesFeatureCollection(
    routes: readonly BusRoute[]
  ): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const route of routes) {
      if (route.geometry.coordinates.length === 0) continue;
      const properties = {
        routeUid: route.routeUid,
        routeId: route.routeId,
        city: route.city,
        color: route.color,
        nameZh: route.name.zh,
        nameEn: route.name.en,
      };
      if (route.geometry.type === 'LineString') {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: route.geometry.coordinates.map((c) => [c[0], c[1]]),
          },
          properties,
        });
      } else {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'MultiLineString',
            coordinates: route.geometry.coordinates.map((arr) =>
              arr.map((c) => [c[0], c[1]])
            ),
          },
          properties,
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }

  // ---- stops -------------------------------------------------------------

  private upsertStops(city: BusCityId, stops: readonly BusStop[]): void {
    const map = this.mapService.getMap();
    const sourceId = `bus-stops-${city}`;
    const layerId = `bus-stops-layer-${city}`;
    const data = this.toStopsFeatureCollection(stops);

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
      minzoom: 12,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          1.5,
          15,
          3,
          18,
          5,
        ],
        'circle-color': '#ffffff',
        'circle-stroke-width': 1.2,
        'circle-stroke-color': BUS_CITIES[city].color,
      },
    });
    this.addedSources.add(sourceId);
    this.addedLayers.add(layerId);

    map.on('click', layerId, (e) => this.handleStopClick(e));
    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
    });
  }

  private toStopsFeatureCollection(
    stops: readonly BusStop[]
  ): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: stops.map((s) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.position.lng, s.position.lat],
        },
        properties: {
          id: s.id,
          stopUid: s.stopUid,
          stopId: s.stopId,
          city: s.city,
          nameZh: s.name.zh,
          nameEn: s.name.en,
          routeUidsCount: s.routeUids.length,
          routeUidsCsv: s.routeUids.slice(0, 6).join(','),
        },
      })),
    };
  }

  // ---- popup -------------------------------------------------------------

  private handleStopClick(
    event: MapMouseEvent & { features?: MapGeoJSONFeature[] }
  ): void {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const coords = feature.geometry.coordinates as [number, number];
    const props = (feature.properties ?? {}) as Record<string, string>;
    const cityMeta = BUS_CITIES[props['city'] as BusCityId];
    const dom = this.buildPopupDom(props, cityMeta?.color ?? '#666');
    const etaContainer = dom.querySelector<HTMLDivElement>('.eta-container');

    this.popup?.remove();
    this.popup = new Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(coords as LngLatLike)
      .setDOMContent(dom)
      .addTo(this.mapService.getMap());

    if (etaContainer) {
      this.bus
        .fetchEtas(props['city'] as BusCityId, props['stopUid'])
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (etas) => this.renderEtas(etaContainer, etas),
          error: () => {
            etaContainer.textContent =
              this.i18n.locale() === 'en' ? 'Failed to load ETAs' : '載入 ETA 失敗';
          },
        });
    }
  }

  private buildPopupDom(
    props: Record<string, string>,
    accentColor: string
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'bus-stop-popup';
    wrapper.style.fontFamily = 'inherit';
    wrapper.style.minWidth = '200px';

    const accent = document.createElement('div');
    accent.style.borderLeft = `4px solid ${accentColor}`;
    accent.style.paddingLeft = '8px';
    wrapper.appendChild(accent);

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

    const routeCount = Number(props['routeUidsCount'] ?? 0);
    if (routeCount > 0) {
      const lines = document.createElement('div');
      lines.style.marginTop = '6px';
      lines.style.fontSize = '11px';
      lines.style.color = '#777';
      lines.textContent = isEn
        ? `${routeCount} route${routeCount > 1 ? 's' : ''}`
        : `${routeCount} 條路線經過`;
      accent.appendChild(lines);
    }

    // Placeholder for async-loaded ETA list. handleStopClick fills it in.
    const etaContainer = document.createElement('div');
    etaContainer.className = 'eta-container';
    etaContainer.style.marginTop = '6px';
    etaContainer.style.fontSize = '12px';
    etaContainer.style.borderTop = '1px solid #eee';
    etaContainer.style.paddingTop = '6px';
    etaContainer.textContent = isEn ? 'Loading…' : '載入中…';
    accent.appendChild(etaContainer);

    return wrapper;
  }

  private renderEtas(container: HTMLElement, etas: readonly BusEta[]): void {
    const isEn = this.i18n.locale() === 'en';
    container.replaceChildren();

    if (etas.length === 0) {
      container.textContent = isEn
        ? 'No buses scheduled'
        : '目前無路線資料';
      return;
    }

    // Show top 6 by ascending estimate time, prioritising 'normal' status.
    const ranked = [...etas]
      .map((e) => ({
        ...e,
        rank:
          e.stopStatus === 0 || e.stopStatus === 4
            ? e.estimateTimeSeconds ?? 99_999
            : 999_999,
      }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 6);

    for (const eta of ranked) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.padding = '2px 0';
      const left = document.createElement('span');
      left.textContent = isEn ? eta.routeName.en || eta.routeId : eta.routeName.zh || eta.routeId;
      const right = document.createElement('span');
      right.style.color = '#555';
      right.textContent = formatEta(eta, isEn);
      row.appendChild(left);
      row.appendChild(right);
      container.appendChild(row);
    }
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
