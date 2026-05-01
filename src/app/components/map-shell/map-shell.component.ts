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
})
export class MapShellComponent implements AfterViewInit, OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

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
  }

  ngOnDestroy(): void {
    this.mapService.destroy();
  }
}
