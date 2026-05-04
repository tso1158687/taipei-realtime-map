import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GeoJSONSource, MapMouseEvent, Popup } from 'maplibre-gl';
import { combineLatest, timer as rxTimer } from 'rxjs';
import { I18nService } from '../../core/i18n';
import { LayerStateService } from '../../core/layer-state';
import { MapService } from '../../core/map';
import { RAIL_OPERATORS, REALTIME_WARMUP_DELAY_MS } from '../../core/tdx';
import { RailService } from './rail.service';
import { inferAllPositions } from './thsr-position';
import { ThsrTimetableService } from './thsr-timetable.service';
import type { RailMode } from './rail.types';

const layerKeyFor = (mode: RailMode): string => `rail.${mode}`;
const SOURCE_ID = 'rail-trains-thsr';
const HALO_LAYER_ID = 'rail-trains-thsr-halo';
const CORE_LAYER_ID = 'rail-trains-thsr-core';
/** Refresh inferred positions this often (THSR moves ~300 km/h, so 30 s
 *  ≈ 2.5 km of progress — plenty smooth for a country-scale map). */
const TICK_INTERVAL_MS = 30_000;

/**
 * Renders THSR live train positions inferred from the daily timetable.
 *
 * TDX V2 has no per-train GPS for THSR, so we fetch today's timetable
 * once (24 h client cache) and re-evaluate every 30 s: for each scheduled
 * train, find which stop window or inter-stop interval `now` falls into,
 * then linearly interpolate between station coordinates. Trains that
 * haven't started or have finished are dropped from the source.
 *
 * Same visual treatment as TRA train layer (halo + core circle in operator
 * brand color) so the two rail systems look consistent.
 */
@Component({
  selector: 'app-thsr-train-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class ThsrTrainLayerComponent {
  private readonly mapService = inject(MapService);
  private readonly rail = inject(RailService);
  private readonly timetable = inject(ThsrTimetableService);
  private readonly layerState = inject(LayerStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(I18nService);
  private readonly warmupDelayMs = inject(REALTIME_WARMUP_DELAY_MS);

  private layerInstalled = false;
  private active: (() => void) | null = null;
  private popup: Popup | null = null;

  constructor() {
    effect(() => {
      const isReady = this.mapService.isReady();
      const layers = this.layerState.layers();
      if (!isReady) return;
      const layer = layers.find((l) => l.key === layerKeyFor('THSR'));
      const shouldRun =
        !!layer && layer.visible && layer.status !== 'error';

      if (shouldRun && !this.active) {
        this.ensureLayer();
        // combine: (network → station coords) × (today's timetable) ×
        // (a recurring tick every 30 s). On every tick we re-infer.
        const sub = combineLatest([
          this.rail.fetchNetwork('THSR'),
          this.timetable.fetchTodaySchedule(),
          rxTimer(this.warmupDelayMs, TICK_INTERVAL_MS),
        ])
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(([network, schedule]) => {
            const coords = new Map(
              network.stations.map((s) => [s.stationId, s.position])
            );
            const positions = inferAllPositions(schedule, Date.now(), coords);
            this.updateSource(positions);
          });
        this.active = () => sub.unsubscribe();
      } else if (!shouldRun && this.active) {
        this.active();
        this.active = null;
        this.clearSource();
      }
    });
  }

  private ensureLayer(): void {
    if (this.layerInstalled) return;
    const map = this.mapService.getMap();
    const color = RAIL_OPERATORS.THSR.color;

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
          'circle-radius': 11,
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
          'circle-radius': 6,
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

  private updateSource(
    positions: ReturnType<typeof inferAllPositions>
  ): void {
    const map = this.mapService.getMap();
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    const features = positions.map((p) => ({
      type: 'Feature' as const,
      properties: {
        trainNo: p.trainNo,
        destinationZh: p.destination.zh,
        destinationEn: p.destination.en,
        atStation: p.atStation ? 1 : 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.position.lng, p.position.lat],
      },
    }));
    source.setData({ type: 'FeatureCollection', features });
  }

  private clearSource(): void {
    if (!this.mapService.isInitialized()) return;
    const source = this.mapService.getMap().getSource(SOURCE_ID) as
      | GeoJSONSource
      | undefined;
    source?.setData({ type: 'FeatureCollection', features: [] });
  }

  // ----- popup --------------------------------------------------------------

  private readonly onClick = (
    e: MapMouseEvent & { features?: { properties?: Record<string, unknown> }[] }
  ): void => {
    const f = e.features?.[0];
    if (!f) return;
    const props = (f.properties ?? {}) as Record<string, string | number>;
    const isEn = this.i18n.locale() === 'en';
    const dest = isEn
      ? (props['destinationEn'] as string)
      : (props['destinationZh'] as string);
    const status = props['atStation'] === 1
      ? (isEn ? 'At station' : '停靠中')
      : (isEn ? 'En route' : '行進中');

    const html = `
      <div style="font-family:system-ui;font-size:13px;min-width:140px">
        <div style="font-weight:600;margin-bottom:2px">
          ${isEn ? 'THSR' : '高鐵'} <span style="color:#666">#${props['trainNo']}</span>
        </div>
        <div style="color:#444">${isEn ? 'To' : '往'} ${dest}</div>
        <div style="color:#666;font-size:12px;margin-top:4px">${status}</div>
        <div style="color:#999;font-size:11px;margin-top:4px">
          ${isEn ? 'Position inferred from timetable' : '位置由班表反推'}
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
