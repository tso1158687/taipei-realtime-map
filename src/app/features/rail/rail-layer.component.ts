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
  RAIL_OPERATORS,
  TDX_RATE_LIMIT_DELAY_MS,
} from '../../core/tdx';
import { RailService } from './rail.service';
import type {
  RailLine,
  RailMode,
  RailNetwork,
  RailStation,
} from './rail.types';

const layerKeyFor = (mode: RailMode): string => `rail.${mode}`;

/**
 * Renders TRA + THSR static stations and lines. Live train info (TRA
 * TrainLiveBoard) is fetched separately when the user clicks a station.
 *
 * THSR has only 12 stations on the western corridor; TRA has ~240 stations
 * spanning the entire island. minzoom thresholds keep low-zoom views clean.
 */
@Component({
  selector: 'app-rail-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class RailLayerComponent implements OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly rail = inject(RailService);
  private readonly i18n = inject(I18nService);
  private readonly layerState = inject(LayerStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rateLimitDelayMs = inject(TDX_RATE_LIMIT_DELAY_MS);

  private readonly addedSources = new Set<string>();
  private readonly addedLayers = new Set<string>();
  private popup: Popup | null = null;
  private loaded = false;

  constructor() {
    for (const mode of Object.keys(RAIL_OPERATORS) as RailMode[]) {
      const meta = RAIL_OPERATORS[mode];
      this.layerState.register(layerKeyFor(mode), {
        zh: meta.nameZh,
        en: meta.nameEn,
      });
    }

    effect(() => {
      if (this.mapService.isReady() && !this.loaded) {
        this.loaded = true;
        this.loadAllModes();
      }
    });

    effect(() => {
      const isReady = this.mapService.isReady();
      const layers = this.layerState.layers();
      if (!isReady) return;
      const map = this.mapService.getMap();
      for (const layer of layers) {
        if (!layer.key.startsWith('rail.')) continue;
        const mode = layer.key.slice('rail.'.length) as RailMode;
        const visStr = layer.visible ? 'visible' : 'none';
        for (const layerId of [
          `rail-lines-layer-${mode}`,
          `rail-stations-layer-${mode}`,
        ]) {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', visStr);
          }
        }
      }
    });
  }

  /** See bus-layer.component.ts for why this is a multiplier of rate-limit delay. */
  private static readonly FEATURE_OFFSET_MULTIPLIER = 8;

  private loadAllModes(): void {
    const modes = Object.keys(RAIL_OPERATORS) as RailMode[];
    for (const mode of modes) {
      this.layerState.setStatus(layerKeyFor(mode), 'loading');
    }
    from(modes)
      .pipe(
        concatMap((mode, index) => {
          const baseDelay = Math.max(0, this.rateLimitDelayMs);
          const delay =
            index === 0
              ? baseDelay * RailLayerComponent.FEATURE_OFFSET_MULTIPLIER
              : baseDelay;
          const wait$ = delay > 0 ? timer(delay) : of(0);
          return wait$.pipe(
            mergeMap(() => this.rail.fetchNetwork(mode)),
            tap((net) => {
              this.renderNetwork(net);
              this.layerState.setStatus(layerKeyFor(mode), 'loaded');
            }),
            catchError((err: unknown) => {
              console.error(`[RailLayer] failed to load ${mode}`, err);
              const msg = err instanceof Error ? err.message : String(err);
              this.layerState.setStatus(layerKeyFor(mode), 'error', msg);
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private renderNetwork(network: RailNetwork): void {
    if (!this.mapService.isInitialized()) return;
    this.upsertLines(network.mode, network.lines);
    this.upsertStations(network.mode, network.stations);
  }

  private upsertLines(mode: RailMode, lines: readonly RailLine[]): void {
    const map = this.mapService.getMap();
    const sourceId = `rail-lines-${mode}`;
    const layerId = `rail-lines-layer-${mode}`;
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: lines
        .filter((l) => l.geometry.coordinates.length > 0)
        .map((l) => ({
          type: 'Feature',
          geometry:
            l.geometry.type === 'LineString'
              ? {
                  type: 'LineString',
                  coordinates: l.geometry.coordinates.map((c) => [c[0], c[1]]),
                }
              : {
                  type: 'MultiLineString',
                  coordinates: l.geometry.coordinates.map((arr) =>
                    arr.map((c) => [c[0], c[1]])
                  ),
                },
          properties: {
            lineId: l.lineId,
            mode: l.mode,
            color: l.color,
            nameZh: l.name.zh,
            nameEn: l.name.en,
          },
        })),
    };
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
          8,
          1,
          12,
          2.5,
          18,
          5,
        ],
        'line-opacity': 0.85,
      },
    });
    this.addedSources.add(sourceId);
    this.addedLayers.add(layerId);
  }

  private upsertStations(
    mode: RailMode,
    stations: readonly RailStation[]
  ): void {
    const map = this.mapService.getMap();
    const sourceId = `rail-stations-${mode}`;
    const layerId = `rail-stations-layer-${mode}`;
    const data: GeoJSON.FeatureCollection = {
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
          mode: s.mode,
          nameZh: s.name.zh,
          nameEn: s.name.en,
        },
      })),
    };
    const existing = map.getSource(sourceId);
    if (existing) {
      (existing as GeoJSONSource).setData(data);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data });
    // Stations: show square-ish markers via larger circles with thicker strokes.
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      // THSR stations are sparse; show from low zoom. TRA stations also visible from low zoom.
      minzoom: mode === 'THSR' ? 7 : 9,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          mode === 'THSR' ? 4 : 2.5,
          14,
          mode === 'THSR' ? 6 : 4,
          18,
          mode === 'THSR' ? 9 : 7,
        ],
        'circle-color': '#ffffff',
        'circle-stroke-width': 2.2,
        'circle-stroke-color': RAIL_OPERATORS[mode].color,
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

  private handleStationClick(
    event: MapMouseEvent & { features?: MapGeoJSONFeature[] }
  ): void {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const coords = feature.geometry.coordinates as [number, number];
    const props = (feature.properties ?? {}) as Record<string, string>;
    const mode = (props['mode'] as RailMode) ?? 'TRA';
    const meta = RAIL_OPERATORS[mode];

    this.popup?.remove();
    this.popup = new Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(coords as LngLatLike)
      .setDOMContent(this.buildPopupDom(props, meta?.color ?? '#666'))
      .addTo(this.mapService.getMap());
  }

  private buildPopupDom(
    props: Record<string, string>,
    accentColor: string
  ): HTMLElement {
    const isEn = this.i18n.locale() === 'en';
    const wrapper = document.createElement('div');
    wrapper.style.fontFamily = 'inherit';
    wrapper.style.minWidth = '180px';
    const accent = document.createElement('div');
    accent.style.borderLeft = `4px solid ${accentColor}`;
    accent.style.paddingLeft = '8px';
    wrapper.appendChild(accent);

    const primary = document.createElement('div');
    primary.style.fontWeight = '600';
    primary.style.fontSize = '14px';
    primary.textContent = (isEn ? props['nameEn'] : props['nameZh']) ?? '';
    accent.appendChild(primary);

    const secondary = document.createElement('div');
    secondary.style.color = '#555';
    secondary.style.fontSize = '12px';
    secondary.textContent = (isEn ? props['nameZh'] : props['nameEn']) ?? '';
    accent.appendChild(secondary);

    const tag = document.createElement('div');
    tag.style.marginTop = '4px';
    tag.style.fontSize = '11px';
    tag.style.color = '#777';
    const mode = props['mode'];
    tag.textContent = mode === 'THSR' ? (isEn ? 'High Speed Rail' : '台灣高鐵') : (isEn ? 'Taiwan Railway' : '臺灣鐵路');
    accent.appendChild(tag);
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
