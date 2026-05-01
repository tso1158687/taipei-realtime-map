import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { I18nService } from '../../core/i18n';
import { ViewModeService } from '../../core/view-mode';

/**
 * Top-left toggle (below the locale switcher) that flips the global view
 * mode between 'default' and 'underground'. The map and feature layers
 * subscribe to ViewModeService.mode and re-paint themselves.
 */
@Component({
  selector: 'app-view-mode-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="view-mode-toggle"
      [class.on]="isUnderground()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-pressed]="isUnderground()"
      (click)="toggle()"
    >
      {{ buttonText() }}
    </button>
  `,
  styles: [
    `
      :host { display: contents; }
      .view-mode-toggle {
        position: absolute;
        top: 50px;
        left: 220px;
        z-index: 10;
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.95);
        color: #222;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      }
      .view-mode-toggle.on {
        background: #1f2937;
        color: #fff;
        border-color: rgba(255, 255, 255, 0.2);
      }
      .view-mode-toggle:focus-visible {
        outline: 2px solid #0070bd;
        outline-offset: 2px;
      }
    `,
  ],
})
export class ViewModeToggleComponent {
  private readonly view = inject(ViewModeService);
  private readonly i18n = inject(I18nService);

  protected readonly isUnderground = computed(
    () => this.view.mode() === 'underground'
  );

  protected readonly buttonText = computed(() => {
    const isEn = this.i18n.locale() === 'en';
    return this.isUnderground()
      ? isEn ? 'Surface' : '地面'
      : isEn ? 'Underground' : '地下';
  });

  protected readonly ariaLabel = computed(() => {
    const isEn = this.i18n.locale() === 'en';
    return this.isUnderground()
      ? isEn ? 'Switch to surface view' : '切換為地面模式'
      : isEn ? 'Switch to underground view' : '切換為地下模式';
  });

  toggle(): void {
    this.view.toggle();
  }
}
