import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LocaleSwitcherComponent } from './components/locale-switcher/locale-switcher.component';
import { MapShellComponent } from './components/map-shell/map-shell.component';
import { MetroLayerComponent } from './features/metro';

@Component({
  selector: 'app-root',
  imports: [MapShellComponent, MetroLayerComponent, LocaleSwitcherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // map-shell first so the map is constructed before layer components run
  // their effects.
  template: `
    <app-map-shell />
    <app-metro-layer />
    <app-locale-switcher />
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
