import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LayerPanelComponent } from './components/layer-panel/layer-panel.component';
import { LocaleSwitcherComponent } from './components/locale-switcher/locale-switcher.component';
import { MapShellComponent } from './components/map-shell/map-shell.component';
import { BusLayerComponent, BusVehicleLayerComponent } from './features/bus';
import { MetroLayerComponent } from './features/metro';
import { RailLayerComponent } from './features/rail';
import { YouBikeLayerComponent } from './features/youbike';

@Component({
  selector: 'app-root',
  imports: [
    MapShellComponent,
    MetroLayerComponent,
    BusLayerComponent,
    BusVehicleLayerComponent,
    RailLayerComponent,
    YouBikeLayerComponent,
    LocaleSwitcherComponent,
    LayerPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // map-shell first so the map is constructed before layer components run
  // their effects.
  template: `
    <app-map-shell />
    <app-metro-layer />
    <app-bus-layer />
    <app-bus-vehicle-layer />
    <app-rail-layer />
    <app-youbike-layer />
    <app-locale-switcher />
    <app-layer-panel />
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
