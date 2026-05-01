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
import { combineLatest } from 'rxjs';
import { LayerStateService } from '../../core/layer-state';
import { MapService } from '../../core/map';
import { METRO_OPERATORS, MetroOperatorId } from '../../core/tdx';
import { MetroRealtimeService } from './metro-realtime.service';
import { MetroService } from './metro.service';
import type {
  MetroStation,
  MetroTrainSignal,
} from './metro.types';

/**
 * Phase 4 minimal live-train rendering: place a marker at each train's
 * currently reported station. Trains "jump" between stations on each
 * 15-second poll. Phase 5 adds along-the-line interpolation + 3D models.
 *
 * Trains are visually distinct from stations: a slightly larger filled
 * circle in the operator's brand color with a soft glow halo.
 */
@Component({
  selector: 'app-metro-train-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class MetroTrainLayerComponent implements OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly metro = inject(MetroService);
  private readonly realtime = inject(MetroRealtimeService);
  private readonly layerState = inject(LayerStateService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly addedSources = new Set<string>();
  private readonly addedLayers = new Set<string>();
  private readonly stationsByOp = new Map<
    MetroOperatorId,
    Map<string, MetroStation>
  >();
  /** opId → unsubscribe */
  private readonly active = new Map<MetroOperatorId, () => void>();

  constructor() {
    effect(() => {
      const isReady = this.mapService.isReady();
      const layers = this.layerState.layers();
      if (!isReady) return;
      const map = this.mapService.getMap();
      for (const op of Object.keys(METRO_OPERATORS) as MetroOperatorId[]) {
        const layer = layers.find((l) => l.key === `metro.${op}`);
        const shouldRun =
          !!layer && layer.visible && layer.status === 'loaded';
        const isRunning = this.active.has(op);
        if (shouldRun && !isRunning) {
          this.ensureLayer(op);
          // Need station coords + live signals together → combineLatest
          const sub = combineLatest([
            this.metro.fetchStations(op),
            this.realtime.watchLiveBoard(op),
          ])
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(([stations, signals]) => {
              this.cacheStations(op, stations);
              this.updateSource(op, signals);
            });
          this.active.set(op, () => sub.unsubscribe());
        } else if (!shouldRun && isRunning) {
          this.active.get(op)?.();
          this.active.delete(op);
          this.clearSource(op);
        }
      }
    });
  }

  private cacheStations(
    op: MetroOperatorId,
    stations: readonly MetroStation[]
  ): void {
    const m = new Map<string, MetroStation>();
    for (const s of stations) m.set(s.stationId, s);
    this.stationsByOp.set(op, m);
  }

  private ensureLayer(op: MetroOperatorId): void {
    const map = this.mapService.getMap();
    const sourceId = `metro-trains-${op}`;
    const layerId = `metro-trains-layer-${op}`;
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      minzoom: 10,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          3,
          14,
          6,
          18,
          11,
        ],
        'circle-color': METRO_OPERATORS[op].color,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        // soft "running" glow vs stations' minimal stroke
        'circle-blur': 0.15,
      },
    });
    this.addedSources.add(sourceId);
    this.addedLayers.add(layerId);
  }

  private updateSource(
    op: MetroOperatorId,
    signals: readonly MetroTrainSignal[]
  ): void {
    if (!this.mapService.isInitialized()) return;
    const map = this.mapService.getMap();
    const source = map.getSource(`metro-trains-${op}`) as GeoJSONSource | undefined;
    if (!source) return;
    const stations = this.stationsByOp.get(op);
    if (!stations) return;

    // De-duplicate by trainNumber: a train can show up as approaching
    // multiple stations; keep the row with the smallest estimateTime.
    const byTrain = new Map<string, MetroTrainSignal>();
    for (const s of signals) {
      const prev = byTrain.get(s.trainNumber);
      if (!prev) {
        byTrain.set(s.trainNumber, s);
        continue;
      }
      if (
        (s.estimateTimeSeconds ?? 99_999) <
        (prev.estimateTimeSeconds ?? 99_999)
      ) {
        byTrain.set(s.trainNumber, s);
      }
    }

    const features: GeoJSON.Feature[] = [];
    for (const sig of byTrain.values()) {
      const station = stations.get(sig.stationId);
      if (!station) continue;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [station.position.lng, station.position.lat],
        },
        properties: {
          trainNumber: sig.trainNumber,
          stationId: sig.stationId,
          lineId: sig.lineId ?? '',
          direction: sig.direction ?? 0,
          destinationZh: sig.destinationName?.zh ?? '',
          destinationEn: sig.destinationName?.en ?? '',
          estimateTimeSeconds: sig.estimateTimeSeconds ?? -1,
        },
      });
    }
    source.setData({ type: 'FeatureCollection', features });
  }

  private clearSource(op: MetroOperatorId): void {
    if (!this.mapService.isInitialized()) return;
    const source = this.mapService
      .getMap()
      .getSource(`metro-trains-${op}`) as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: [] });
  }

  ngOnDestroy(): void {
    for (const stop of this.active.values()) stop();
    this.active.clear();
    if (!this.mapService.isInitialized()) return;
    const map = this.mapService.getMap();
    for (const id of this.addedLayers) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of this.addedSources) if (map.getSource(id)) map.removeSource(id);
    this.addedLayers.clear();
    this.addedSources.clear();
  }
}
