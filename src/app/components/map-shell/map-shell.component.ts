import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';
import {
  FullscreenControl,
  GeolocateControl,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl';
import { MapService } from '../../core/map';
import { TrackingService } from '../../core/tracking';

/**
 * Owns the DOM container for MapLibre and drives its lifecycle.
 *
 * Layer components (e.g. metro / bus / rail) sit alongside this component
 * under the App root and add their own sources/layers via `MapService`,
 * keyed off `mapService.isReady()`.
 */
@Component({
  selector: 'app-map-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #container class="map-container" role="application" aria-label="Taipei realtime transit map"></div>`,
  styles: [
    `
      :host {
        display: block;
        position: absolute;
        inset: 0;
      }
      .map-container {
        position: absolute;
        inset: 0;
      }
    `,
  ],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class MapShellComponent implements AfterViewInit, OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly tracking = inject(TrackingService);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  protected onEscape(): void {
    this.tracking.clear();
  }

  ngAfterViewInit(): void {
    const map = this.mapService.initialize(this.container().nativeElement);
    // Standard MapLibre chrome. Stack zoom/compass + fullscreen + geolocate
    // top-right; scale bar bottom-left so attribution stays bottom-right.
    map.addControl(
      new NavigationControl({ visualizePitch: false, showCompass: true }),
      'top-right'
    );
    map.addControl(new FullscreenControl(), 'top-right');
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserLocation: true,
      }),
      'top-right'
    );
    map.addControl(new ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');

    // Click on empty map area cancels tracking. Layer-specific clicks
    // (e.g. metro train) bubble first so this only fires when nothing is hit.
    map.on('click', (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: this.trackableLayerIds(),
      });
      if (features.length === 0) this.tracking.clear();
    });
  }

  private trackableLayerIds(): string[] {
    const map = this.mapService.getMap();
    return ['metro-trains-layer-TRTC', 'metro-trains-layer-TYMC'].filter(
      (id) => !!map.getLayer(id)
    );
  }

  ngOnDestroy(): void {
    this.mapService.destroy();
  }
}
