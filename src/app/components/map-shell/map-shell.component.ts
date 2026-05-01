import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';
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
    this.mapService.initialize(this.container().nativeElement);
  }

  ngOnDestroy(): void {
    this.mapService.destroy();
  }
}
