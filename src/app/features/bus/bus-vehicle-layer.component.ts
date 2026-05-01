import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GeoJSONSource } from 'maplibre-gl';
import { LayerStateService } from '../../core/layer-state';
import { MapService } from '../../core/map';
import { BUS_CITIES, BusCityId } from '../../core/tdx';
import { BusRealtimeService } from './bus-realtime.service';
import type { BusVehicle } from './bus.types';

const layerKeyFor = (city: BusCityId): string => `bus.${city}`;

/**
 * Renders live bus GPS positions on top of the static bus layers.
 *
 * For each visible `bus.{city}` layer, subscribes to BusRealtimeService and
 * pushes the latest vehicle positions into a `bus-vehicles-{city}` source.
 * Subscriptions are torn down when a city is hidden — no point polling
 * data the user can't see.
 */
@Component({
  selector: 'app-bus-vehicle-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class BusVehicleLayerComponent implements OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly realtime = inject(BusRealtimeService);
  private readonly layerState = inject(LayerStateService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly addedSources = new Set<string>();
  private readonly addedLayers = new Set<string>();
  /** city → unsubscribe function */
  private readonly active = new Map<BusCityId, () => void>();

  constructor() {
    effect(() => {
      const isReady = this.mapService.isReady();
      const layers = this.layerState.layers();
      if (!isReady) return;
      const map = this.mapService.getMap();

      for (const city of Object.keys(BUS_CITIES) as BusCityId[]) {
        const layer = layers.find((l) => l.key === layerKeyFor(city));
        const shouldRun = !!layer && layer.visible && layer.status === 'loaded';
        const isRunning = this.active.has(city);

        if (shouldRun && !isRunning) {
          this.ensureLayer(city);
          const sub = this.realtime
            .watchVehicles(city)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((vehicles) => this.updateSource(city, vehicles));
          this.active.set(city, () => sub.unsubscribe());
        } else if (!shouldRun && isRunning) {
          this.active.get(city)?.();
          this.active.delete(city);
          // Clear the source so stale markers don't linger.
          const sourceId = `bus-vehicles-${city}`;
          const source = map.getSource(sourceId);
          if (source) {
            (source as GeoJSONSource).setData({
              type: 'FeatureCollection',
              features: [],
            });
          }
        }
      }
    });
  }

  private ensureLayer(city: BusCityId): void {
    const map = this.mapService.getMap();
    const sourceId = `bus-vehicles-${city}`;
    const layerId = `bus-vehicles-layer-${city}`;
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
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
          2.5,
          14,
          4,
          18,
          7,
        ],
        'circle-color': BUS_CITIES[city].color,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
    });
    this.addedSources.add(sourceId);
    this.addedLayers.add(layerId);
  }

  private updateSource(city: BusCityId, vehicles: readonly BusVehicle[]): void {
    if (!this.mapService.isInitialized()) return;
    const map = this.mapService.getMap();
    const source = map.getSource(`bus-vehicles-${city}`) as
      | GeoJSONSource
      | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: vehicles.map((v) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [v.position.lng, v.position.lat],
        },
        properties: {
          id: v.id,
          plateNumb: v.plateNumb,
          routeUid: v.routeUid,
          direction: v.direction,
          azimuth: v.azimuth ?? null,
          speed: v.speed ?? null,
        },
      })),
    });
  }

  ngOnDestroy(): void {
    for (const stop of this.active.values()) stop();
    this.active.clear();
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
