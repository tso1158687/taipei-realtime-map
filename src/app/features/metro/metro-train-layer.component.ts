import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  NgZone,
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

/** Smooth-transition state per train. */
interface TrainAnim {
  trainNumber: string;
  signal: MetroTrainSignal;
  fromLng: number;
  fromLat: number;
  toLng: number;
  toLat: number;
  transitionStartMs: number;
}

const TRANSITION_DURATION_MS = 1500;

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

  private readonly zone = inject(NgZone);
  private readonly addedSources = new Set<string>();
  private readonly addedLayers = new Set<string>();
  private readonly stationsByOp = new Map<
    MetroOperatorId,
    Map<string, MetroStation>
  >();
  /** opId → train animation state */
  private readonly anims = new Map<MetroOperatorId, Map<string, TrainAnim>>();
  /** opId → unsubscribe */
  private readonly active = new Map<MetroOperatorId, () => void>();
  private rafHandle: number | null = null;

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
    const stations = this.stationsByOp.get(op);
    if (!stations) return;

    // De-duplicate by trainNumber.
    const byTrain = new Map<string, MetroTrainSignal>();
    for (const s of signals) {
      const prev = byTrain.get(s.trainNumber);
      if (
        !prev ||
        (s.estimateTimeSeconds ?? 99_999) <
          (prev.estimateTimeSeconds ?? 99_999)
      ) {
        byTrain.set(s.trainNumber, s);
      }
    }

    // Update or create train anim entries with new target station.
    let opAnims = this.anims.get(op);
    if (!opAnims) {
      opAnims = new Map();
      this.anims.set(op, opAnims);
    }
    const now = performance.now();
    const newKeys = new Set<string>();
    for (const sig of byTrain.values()) {
      const station = stations.get(sig.stationId);
      if (!station) continue;
      newKeys.add(sig.trainNumber);
      const prev = opAnims.get(sig.trainNumber);
      if (
        prev &&
        (prev.toLng !== station.position.lng ||
          prev.toLat !== station.position.lat)
      ) {
        // Capture current rendered position as new "from", animate to new station.
        const t = Math.min(
          1,
          (now - prev.transitionStartMs) / TRANSITION_DURATION_MS
        );
        const curLng = prev.fromLng + (prev.toLng - prev.fromLng) * t;
        const curLat = prev.fromLat + (prev.toLat - prev.fromLat) * t;
        opAnims.set(sig.trainNumber, {
          trainNumber: sig.trainNumber,
          signal: sig,
          fromLng: curLng,
          fromLat: curLat,
          toLng: station.position.lng,
          toLat: station.position.lat,
          transitionStartMs: now,
        });
      } else if (!prev) {
        // First time seeing this train: start at its station (no transition).
        opAnims.set(sig.trainNumber, {
          trainNumber: sig.trainNumber,
          signal: sig,
          fromLng: station.position.lng,
          fromLat: station.position.lat,
          toLng: station.position.lng,
          toLat: station.position.lat,
          transitionStartMs: now - TRANSITION_DURATION_MS,
        });
      } else {
        // Same station — keep prev (no rebase).
        prev.signal = sig;
      }
    }
    // Drop trains no longer in feed.
    for (const key of opAnims.keys()) {
      if (!newKeys.has(key)) opAnims.delete(key);
    }

    this.ensureRaf();
  }

  private ensureRaf(): void {
    if (this.rafHandle !== null) return;
    // Run RAF outside Angular zone to avoid CD churn 60 times/sec.
    this.zone.runOutsideAngular(() => {
      const tick = () => {
        this.rafHandle = requestAnimationFrame(tick);
        this.renderFrame();
      };
      this.rafHandle = requestAnimationFrame(tick);
    });
  }

  private renderFrame(): void {
    if (!this.mapService.isInitialized()) return;
    const map = this.mapService.getMap();
    const now = performance.now();
    let anyActive = false;
    for (const [op, opAnims] of this.anims) {
      const features: GeoJSON.Feature[] = [];
      for (const a of opAnims.values()) {
        const t = Math.min(
          1,
          (now - a.transitionStartMs) / TRANSITION_DURATION_MS
        );
        if (t < 1) anyActive = true;
        const lng = a.fromLng + (a.toLng - a.fromLng) * t;
        const lat = a.fromLat + (a.toLat - a.fromLat) * t;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            trainNumber: a.trainNumber,
            stationId: a.signal.stationId,
            lineId: a.signal.lineId ?? '',
            direction: a.signal.direction ?? 0,
            destinationZh: a.signal.destinationName?.zh ?? '',
            destinationEn: a.signal.destinationName?.en ?? '',
          },
        });
      }
      const source = map.getSource(`metro-trains-${op}`) as
        | GeoJSONSource
        | undefined;
      source?.setData({ type: 'FeatureCollection', features });
    }
    // If all transitions completed and no active opAnims, stop the loop.
    if (!anyActive) {
      if (this.rafHandle !== null) {
        cancelAnimationFrame(this.rafHandle);
        this.rafHandle = null;
      }
    }
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
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    if (!this.mapService.isInitialized()) return;
    const map = this.mapService.getMap();
    for (const id of this.addedLayers) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of this.addedSources) if (map.getSource(id)) map.removeSource(id);
    this.addedLayers.clear();
    this.addedSources.clear();
  }
}
