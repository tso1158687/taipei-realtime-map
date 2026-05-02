import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LayerPanelComponent } from './components/layer-panel/layer-panel.component';
import { LocaleSwitcherComponent } from './components/locale-switcher/locale-switcher.component';
import { MapShellComponent } from './components/map-shell/map-shell.component';
import { SearchPanelComponent } from './components/search-panel/search-panel.component';
import { ViewModeToggleComponent } from './components/view-mode-toggle/view-mode-toggle.component';
import { BusLayerComponent, BusVehicleLayerComponent } from './features/bus';
import {
  MetroLayerComponent,
  MetroTrainLayerComponent,
} from './features/metro';
import { RailLayerComponent, RailTrainLayerComponent } from './features/rail';
import { YouBikeLayerComponent } from './features/youbike';

@Component({
  selector: 'app-root',
  imports: [
    MapShellComponent,
    MetroLayerComponent,
    MetroTrainLayerComponent,
    BusLayerComponent,
    BusVehicleLayerComponent,
    RailLayerComponent,
    RailTrainLayerComponent,
    YouBikeLayerComponent,
    LocaleSwitcherComponent,
    LayerPanelComponent,
    SearchPanelComponent,
    ViewModeToggleComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Critical-path components render first; heavier feature layers + the
  // search panel defer until the browser is idle, splitting the bundle
  // into a smaller initial chunk and a lazy "features" chunk.
  template: `
    <app-map-shell />
    <app-metro-layer />
    <app-locale-switcher />
    <app-view-mode-toggle />
    <app-layer-panel />
    @defer (on idle) {
      <app-metro-train-layer />
      <app-bus-layer />
      <app-bus-vehicle-layer />
      <app-rail-layer />
      <app-rail-train-layer />
      <app-youbike-layer />
      <app-search-panel />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: fixed;
        inset: 0;
        overflow: hidden;
      }
    `,
  ],
})
export class App {}
