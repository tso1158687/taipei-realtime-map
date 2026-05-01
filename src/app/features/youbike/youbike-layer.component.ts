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
import {
  EMPTY,
  catchError,
  combineLatest,
  concatMap,
  from,
  mergeMap,
  of,
  tap,
  timer,
} from 'rxjs';
import { I18nService } from '../../core/i18n';
import { LayerStateService } from '../../core/layer-state';
import { MapService } from '../../core/map';
import {
  BUS_CITIES,
  BusCityId,
  TDX_RATE_LIMIT_DELAY_MS,
} from '../../core/tdx';
import { YouBikeService } from './youbike.service';
import type { YouBikeAvailability, YouBikeStation } from './youbike.types';

const layerKeyFor = (city: BusCityId): string => `youbike.${city}`;

/**
 * Renders YouBike stations across the 4 covered cities. Each station's
 * fill colour reflects how many bikes are currently available to rent
 * (green: >5, yellow: 1–5, red: 0). Live availability is polled every 30s
 * via YouBikeService and merged with the static station list.
 */
@Component({
  selector: 'app-youbike-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class YouBikeLayerComponent implements OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly youbike = inject(YouBikeService);
  private readonly i18n = inject(I18nService);
  private readonly layerState = inject(LayerStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rateLimitDelayMs = inject(TDX_RATE_LIMIT_DELAY_MS);

  private readonly addedSources = new Set<string>();
  private readonly addedLayers = new Set<string>();
  private readonly stationsByCity = new Map<BusCityId, YouBikeStation[]>();
  private popup: Popup | null = null;
  private loaded = false;

  constructor() {
    for (const city of Object.keys(BUS_CITIES) as BusCityId[]) {
      const meta = BUS_CITIES[city];
      this.layerState.register(layerKeyFor(city), {
        zh: `${meta.nameZh} YouBike`,
        en: `${meta.nameEn} YouBike`,
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
        if (!layer.key.startsWith('youbike.')) continue;
        const city = layer.key.slice('youbike.'.length) as BusCityId;
        const visStr = layer.visible ? 'visible' : 'none';
        const layerId = `youbike-stations-layer-${city}`;
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visStr);
        }
      }
    });
  }

  private loadAllCities(): void {
    const cities = Object.keys(BUS_CITIES) as BusCityId[];
    for (const city of cities) {
      this.layerState.setStatus(layerKeyFor(city), 'loading');
    }

    from(cities)
      .pipe(
        concatMap((city, index) => {
          const delay = index === 0 ? 0 : Math.max(0, this.rateLimitDelayMs);
          const wait$ = delay > 0 ? timer(delay) : of(0);
          return wait$.pipe(
            mergeMap(() =>
              combineLatest([
                this.youbike.fetchStations(city),
                this.youbike.watchAvailability(city),
              ])
            ),
            tap(([stations, availabilities]) => {
              this.stationsByCity.set(city, stations);
              this.upsertStations(city, stations, availabilities);
              if (this.layerState.get(layerKeyFor(city))?.status !== 'loaded') {
                this.layerState.setStatus(layerKeyFor(city), 'loaded');
              }
            }),
            catchError((err: unknown) => {
              console.error(`[YouBikeLayer] failed to load ${city}`, err);
              const msg = err instanceof Error ? err.message : String(err);
              this.layerState.setStatus(layerKeyFor(city), 'error', msg);
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private upsertStations(
    city: BusCityId,
    stations: readonly YouBikeStation[],
    availabilities: readonly YouBikeAvailability[]
  ): void {
    const map = this.mapService.getMap();
    const sourceId = `youbike-stations-${city}`;
    const layerId = `youbike-stations-layer-${city}`;
    const data = this.toFeatureCollection(stations, availabilities);
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
      minzoom: 11,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          3,
          14,
          5,
          18,
          8,
        ],
        // Green=plenty, Yellow=few, Red=none, Grey=service down/unknown
        'circle-color': [
          'match',
          ['get', 'availabilityBucket'],
          'plenty',
          '#2ea44f',
          'few',
          '#f0a020',
          'none',
          '#d73a49',
          /* default */ '#9aa0a6',
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
    });
    this.addedSources.add(sourceId);
    this.addedLayers.add(layerId);

    map.on('click', layerId, (e) => this.handleStationClick(e));
    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
    });
  }

  private toFeatureCollection(
    stations: readonly YouBikeStation[],
    availabilities: readonly YouBikeAvailability[]
  ): GeoJSON.FeatureCollection {
    const byUid = new Map<string, YouBikeAvailability>();
    for (const a of availabilities) byUid.set(a.stationUid, a);
    return {
      type: 'FeatureCollection',
      features: stations.map((s) => {
        const a = byUid.get(s.stationUid);
        const rent = a?.availableRent ?? -1;
        const ret = a?.availableReturn ?? -1;
        const bucket =
          !a || !a.serviceAvailable
            ? 'unknown'
            : rent === 0
              ? 'none'
              : rent <= 5
                ? 'few'
                : 'plenty';
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [s.position.lng, s.position.lat],
          },
          properties: {
            id: s.id,
            stationUid: s.stationUid,
            city: s.city,
            nameZh: s.name.zh,
            nameEn: s.name.en,
            capacity: s.capacity,
            serviceType: s.serviceType ?? '',
            availableRent: rent,
            availableReturn: ret,
            availabilityBucket: bucket,
          },
        };
      }),
    };
  }

  private handleStationClick(
    event: MapMouseEvent & { features?: MapGeoJSONFeature[] }
  ): void {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const coords = feature.geometry.coordinates as [number, number];
    const props = (feature.properties ?? {}) as Record<string, string>;
    this.popup?.remove();
    this.popup = new Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(coords as LngLatLike)
      .setDOMContent(this.buildPopupDom(props))
      .addTo(this.mapService.getMap());
  }

  private buildPopupDom(props: Record<string, string>): HTMLElement {
    const isEn = this.i18n.locale() === 'en';
    const wrapper = document.createElement('div');
    wrapper.className = 'youbike-popup';
    wrapper.style.fontFamily = 'inherit';
    wrapper.style.minWidth = '200px';

    const name = document.createElement('div');
    name.style.fontWeight = '600';
    name.style.fontSize = '14px';
    name.textContent = (isEn ? props['nameEn'] : props['nameZh']) ?? '';
    wrapper.appendChild(name);

    const sub = document.createElement('div');
    sub.style.color = '#555';
    sub.style.fontSize = '12px';
    sub.textContent = (isEn ? props['nameZh'] : props['nameEn']) ?? '';
    wrapper.appendChild(sub);

    const stats = document.createElement('div');
    stats.style.marginTop = '6px';
    stats.style.fontSize = '12px';
    const rent = Number(props['availableRent'] ?? -1);
    const ret = Number(props['availableReturn'] ?? -1);
    const cap = Number(props['capacity'] ?? 0);
    if (rent < 0) {
      stats.textContent = isEn ? 'Service offline' : '服務暫停';
      stats.style.color = '#d73a49';
    } else {
      stats.textContent = isEn
        ? `Bikes ${rent} · Docks ${ret} · Capacity ${cap}`
        : `可借 ${rent} · 可還 ${ret} · 總車格 ${cap}`;
    }
    wrapper.appendChild(stats);

    if (props['serviceType']) {
      const tag = document.createElement('div');
      tag.style.marginTop = '4px';
      tag.style.fontSize = '11px';
      tag.style.color = '#777';
      tag.textContent = `YouBike ${props['serviceType']}.0`;
      wrapper.appendChild(tag);
    }
    return wrapper;
  }

  ngOnDestroy(): void {
    this.popup?.remove();
    if (!this.mapService.isInitialized()) return;
    const map = this.mapService.getMap();
    for (const id of this.addedLayers) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of this.addedSources) if (map.getSource(id)) map.removeSource(id);
    this.addedLayers.clear();
    this.addedSources.clear();
  }
}
