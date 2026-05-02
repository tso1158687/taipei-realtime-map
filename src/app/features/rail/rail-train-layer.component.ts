import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GeoJSONSource, MapMouseEvent, Popup } from 'maplibre-gl';
import { combineLatest } from 'rxjs';
import { I18nService } from '../../core/i18n';
import { LayerStateService } from '../../core/layer-state';
import { MapService } from '../../core/map';
import { RAIL_OPERATORS } from '../../core/tdx';
import { RailService } from './rail.service';
import type { RailMode, RailStation, TraTrainLive } from './rail.types';

const layerKeyFor = (mode: RailMode): string => `rail.${mode}`;
const SOURCE_ID = 'rail-trains-tra';
const HALO_LAYER_ID = 'rail-trains-tra-halo';
const CORE_LAYER_ID = 'rail-trains-tra-core';

/**
 * Renders TRA live train positions on top of the static rail layer.
 *
 * TDX `v2/Rail/TRA/TrainLiveBoard` reports each running train's currently
 * occupied station. There's no GPS — markers snap to the station coordinate
 * each poll. Trains hop between stations every 30 seconds. (THSR has no
 * equivalent endpoint in V2; see Phase 8.C for timetable-based inference.)
 *
 * Visually a TRA train is a small filled circle in the operator's brand
 * color with a soft glow halo, drawn slightly larger than a static station
 * marker so users can tell them apart.
 */
@Component({
  selector: 'app-rail-train-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class RailTrainLayerComponent {
  private readonly mapService = inject(MapService);
  private readonly rail = inject(RailService);
  private readonly layerState = inject(LayerStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(I18nService);

  /** stationId → station (for coordinate lookup). */
  private stationsById = new Map<string, RailStation>();
  private layerInstalled = false;
  private active: (() => void) | null = null;
  private popup: Popup | null = null;

  constructor() {
    effect(() => {
      const isReady = this.mapService.isReady();
      const layers = this.layerState.layers();
      if (!isReady) return;
      const layer = layers.find((l) => l.key === layerKeyFor('TRA'));
      // Subscribe as soon as the layer is visible (mirror metro/bus train
      // layers — gating on 'loaded' would mean ~90s of cold-start with no
      // train data because the sequential static fetches haven't all
      // completed yet).
      const shouldRun =
        !!layer && layer.visible && layer.status !== 'error';
      if (shouldRun && !this.active) {
        this.ensureLayer();
        const sub = combineLatest([
          this.rail.fetchNetwork('TRA'),
          this.rail.watchTraLiveBoard(),
        ])
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(([network, trains]) => {
            this.cacheStations(network.stations);
            this.updateSource(trains);
          });
        this.active = () => sub.unsubscribe();
      } else if (!shouldRun && this.active) {
        this.active();
        this.active = null;
        this.clearSource();
      }
    });
  }

  private cacheStations(stations: readonly RailStation[]): void {
    if (this.stationsById.size === stations.length) return;
    this.stationsById = new Map(stations.map((s) => [s.stationId, s]));
  }

  /** Build the GeoJSON source + layers exactly once. */
  private ensureLayer(): void {
    if (this.layerInstalled) return;
    const map = this.mapService.getMap();
    const color = RAIL_OPERATORS.TRA.color;

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'trainNo',
      });
    }

    if (!map.getLayer(HALO_LAYER_ID)) {
      map.addLayer({
        id: HALO_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 9,
          'circle-color': color,
          'circle-opacity': 0.25,
          'circle-blur': 0.6,
        },
      });
    }
    if (!map.getLayer(CORE_LAYER_ID)) {
      map.addLayer({
        id: CORE_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 5,
          'circle-color': color,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    map.on('click', CORE_LAYER_ID, this.onClick);
    map.on('mouseenter', CORE_LAYER_ID, this.onMouseEnter);
    map.on('mouseleave', CORE_LAYER_ID, this.onMouseLeave);
    this.layerInstalled = true;

    this.destroyRef.onDestroy(() => {
      map.off('click', CORE_LAYER_ID, this.onClick);
      map.off('mouseenter', CORE_LAYER_ID, this.onMouseEnter);
      map.off('mouseleave', CORE_LAYER_ID, this.onMouseLeave);
      this.popup?.remove();
    });
  }

  private updateSource(trains: readonly TraTrainLive[]): void {
    const map = this.mapService.getMap();
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    const features = trains
      .map((t) => {
        const station = this.stationsById.get(t.stationId);
        if (!station) return null; // station coords not loaded yet
        return {
          type: 'Feature' as const,
          properties: {
            trainNo: t.trainNo,
            trainTypeZh: t.trainTypeName?.zh ?? '',
            trainTypeEn: t.trainTypeName?.en ?? '',
            endingZh: t.endingStationName?.zh ?? '',
            endingEn: t.endingStationName?.en ?? '',
            delay: t.delayMinutes,
            stationZh: station.name.zh,
            stationEn: station.name.en,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [station.position.lng, station.position.lat],
          },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    source.setData({ type: 'FeatureCollection', features });
  }

  private clearSource(): void {
    if (!this.mapService.isInitialized()) return;
    const source = this.mapService.getMap().getSource(SOURCE_ID) as
      | GeoJSONSource
      | undefined;
    source?.setData({ type: 'FeatureCollection', features: [] });
  }

  // ----- popup interaction --------------------------------------------------

  private readonly onClick = (
    e: MapMouseEvent & { features?: { properties?: Record<string, unknown> }[] }
  ): void => {
    const f = e.features?.[0];
    if (!f) return;
    const props = (f.properties ?? {}) as Record<string, string | number>;
    const isEn = this.i18n.locale() === 'en';
    const trainType = isEn
      ? (props['trainTypeEn'] as string) || 'Train'
      : (props['trainTypeZh'] as string) || '列車';
    const ending = isEn
      ? (props['endingEn'] as string)
      : (props['endingZh'] as string);
    const station = isEn
      ? (props['stationEn'] as string)
      : (props['stationZh'] as string);
    const delay = Number(props['delay'] ?? 0);
    const delayLine = delay > 0
      ? (isEn ? `Delayed ${delay} min` : `誤點 ${delay} 分鐘`)
      : (isEn ? 'On time' : '準點');
    const towards = ending
      ? (isEn ? `→ ${ending}` : `往 ${ending}`)
      : '';

    const html = `
      <div style="font-family:system-ui;font-size:13px;min-width:160px">
        <div style="font-weight:600;margin-bottom:2px">
          ${trainType} <span style="color:#666">#${props['trainNo']}</span>
        </div>
        <div style="color:#444">${station}</div>
        ${towards ? `<div style="color:#666;font-size:12px;margin-top:2px">${towards}</div>` : ''}
        <div style="color:${delay > 0 ? '#c62828' : '#2e7d32'};font-size:12px;margin-top:4px">
          ${delayLine}
        </div>
      </div>`;

    this.popup?.remove();
    this.popup = new Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(this.mapService.getMap());
  };

  private readonly onMouseEnter = (): void => {
    this.mapService.getMap().getCanvas().style.cursor = 'pointer';
  };

  private readonly onMouseLeave = (): void => {
    this.mapService.getMap().getCanvas().style.cursor = '';
  };
}
