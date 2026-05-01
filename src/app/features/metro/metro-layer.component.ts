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
import { I18nService } from '../../core/i18n';
import { MapService } from '../../core/map';
import { METRO_OPERATORS, MetroOperatorId } from '../../core/tdx';
import { MetroService } from './metro.service';
import type { MetroLine, MetroNetwork, MetroStation } from './metro.types';

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
    for (const operatorId of operatorIds) {
      this.metro
        .fetchNetwork(operatorId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (net) => this.renderNetwork(net),
          error: (err) =>
            console.error(`[MetroLayer] failed to load ${operatorId}`, err),
        });
    }
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

    const nameZh = document.createElement('div');
    nameZh.style.fontWeight = '600';
    nameZh.style.fontSize = '14px';
    nameZh.textContent = props['nameZh'] ?? '';
    accent.appendChild(nameZh);

    const nameEn = document.createElement('div');
    nameEn.style.color = '#555';
    nameEn.style.fontSize = '12px';
    nameEn.textContent = props['nameEn'] ?? '';
    accent.appendChild(nameEn);

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
