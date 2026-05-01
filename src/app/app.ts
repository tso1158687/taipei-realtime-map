import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MapShellComponent } from './components/map-shell/map-shell.component';

@Component({
  selector: 'app-root',
  imports: [MapShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-map-shell />`,
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
