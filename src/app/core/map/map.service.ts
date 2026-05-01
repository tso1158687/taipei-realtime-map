import { Injectable } from '@angular/core';
import {
  Map as MapLibreMap,
  MapOptions,
  StyleSpecification,
} from 'maplibre-gl';

/** 台北市政府附近，作為地圖預設中心。 */
export const TAIPEI_CENTER: readonly [number, number] = [121.5654, 25.033];
export const DEFAULT_ZOOM = 12;
export const MIN_ZOOM = 8;
export const MAX_ZOOM = 19;

/**
 * MapLibre style: pure OSM raster tiles. No vector tile dependency, no API
 * key required. Trade-off: 3D buildings and dynamic styling are not
 * available; that limitation was an explicit project decision.
 *
 * For production use, replace the upstream tile URL with a self-hosted
 * cache or a tile provider that allows your traffic level — the public
 * `tile.openstreetmap.org` endpoint has a fair-use policy.
 */
const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-raster',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

/**
 * Application-wide MapLibre wrapper.
 *
 * Owns the singleton map instance. Components inject this service rather than
 * importing maplibre-gl directly, so render logic stays out of UI templates
 * and the map can be mocked in tests.
 */
@Injectable({ providedIn: 'root' })
export class MapService {
  private map: MapLibreMap | null = null;

  /**
   * Create the map inside the given container. Must be called exactly once,
   * typically from a host component's `ngAfterViewInit`.
   */
  initialize(
    container: HTMLElement,
    options: Partial<MapOptions> = {}
  ): MapLibreMap {
    if (this.map) {
      throw new Error('MapService already initialized');
    }
    this.map = new MapLibreMap({
      container,
      style: OSM_RASTER_STYLE,
      center: [...TAIPEI_CENTER],
      zoom: DEFAULT_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
      ...options,
    });
    return this.map;
  }

  /** Returns the map instance. Throws if `initialize` has not been called. */
  getMap(): MapLibreMap {
    if (!this.map) {
      throw new Error('MapService is not initialized; call initialize() first');
    }
    return this.map;
  }

  isInitialized(): boolean {
    return this.map !== null;
  }

  /** Tear down the map (e.g. in tests or hot-module reloads). */
  destroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
