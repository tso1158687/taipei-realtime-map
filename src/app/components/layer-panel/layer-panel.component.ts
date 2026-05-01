import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { I18nService } from '../../core/i18n';
import { LayerInfo, LayerStateService } from '../../core/layer-state';

/**
 * Top-left floating panel that lists every layer registered in
 * `LayerStateService` and lets the user toggle visibility. Each row also
 * shows a tiny status indicator:
 *   - gray dot     → idle (registered, no fetch yet)
 *   - blue pulse   → loading (fetch in flight or queued behind rate limit)
 *   - green dot    → loaded successfully
 *   - red dot      → error (hover the row to see the message)
 *
 * The panel auto-hides when no layers are registered yet, so it doesn't
 * appear as an empty box during initial paint.
 */
@Component({
  selector: 'app-layer-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (layers().length > 0) {
      <aside class="layer-panel" role="region" [attr.aria-label]="ariaLabel()">
        @for (layer of layers(); track layer.key) {
          <label class="row">
            <input
              type="checkbox"
              [checked]="layer.visible"
              (change)="onToggle(layer.key, $event)"
            />
            <span class="text">{{ labelFor(layer) }}</span>
            <span
              class="status"
              [class]="'status-' + layer.status"
              [attr.title]="layer.errorMessage || null"
              role="img"
              [attr.aria-label]="statusAriaFor(layer)"
            ></span>
          </label>
        }
      </aside>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .layer-panel {
        position: absolute;
        top: 50px;
        left: 10px;
        z-index: 10;
        min-width: 180px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        padding: 6px 8px;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
        font-size: 13px;
        font-family: inherit;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 4px;
        cursor: pointer;
        border-radius: 3px;
      }
      .row:hover {
        background: rgba(0, 0, 0, 0.04);
      }
      .row input[type='checkbox'] {
        cursor: pointer;
        width: 14px;
        height: 14px;
      }
      .row input[type='checkbox']:focus-visible {
        outline: 2px solid #0070bd;
        outline-offset: 1px;
      }
      .row:focus-within {
        background: rgba(0, 112, 189, 0.08);
      }
      .text {
        flex: 1;
        color: #222;
      }
      .status {
        flex: 0 0 8px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #c0c0c0;
      }
      .status-loading {
        background: #4a90e2;
        animation: pulse 1.4s ease-in-out infinite;
      }
      .status-loaded {
        background: #2ea44f;
      }
      .status-error {
        background: #d73a49;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 0.4;
          transform: scale(0.8);
        }
        50% {
          opacity: 1;
          transform: scale(1.1);
        }
      }
    `,
  ],
})
export class LayerPanelComponent {
  private readonly layerState = inject(LayerStateService);
  private readonly i18n = inject(I18nService);

  readonly layers = this.layerState.layers;

  readonly ariaLabel = computed(() =>
    this.i18n.locale() === 'en' ? 'Layer toggles' : '圖層切換'
  );

  labelFor(layer: LayerInfo): string {
    return this.i18n.locale() === 'en' ? layer.label.en : layer.label.zh;
  }

  statusAriaFor(layer: LayerInfo): string {
    const isEn = this.i18n.locale() === 'en';
    const map = {
      idle: isEn ? 'idle' : '尚未載入',
      loading: isEn ? 'loading' : '載入中',
      loaded: isEn ? 'loaded' : '已載入',
      error: isEn ? 'error' : '載入失敗',
    } as const;
    return map[layer.status];
  }

  onToggle(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.layerState.setVisibility(key, checked);
  }
}
