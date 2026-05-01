import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { I18nService } from '../../core/i18n';

/**
 * Floating top-left toggle that flips between zh-TW (default) and en.
 *
 * The component is a stateless wrapper around `I18nService`; the active
 * locale is sourced from a signal so OnPush change detection refreshes
 * the visual state without manual subscriptions.
 */
@Component({
  selector: 'app-locale-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="locale-switcher"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-pressed]="locale() === 'en'"
      (click)="toggle()"
    >
      <span [class.active]="locale() === 'zh-TW'" aria-hidden="true">中</span>
      <span class="divider" aria-hidden="true">/</span>
      <span [class.active]="locale() === 'en'" aria-hidden="true">EN</span>
    </button>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .locale-switcher {
        position: absolute;
        top: 10px;
        left: 10px;
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
        user-select: none;
      }
      .locale-switcher:focus-visible {
        outline: 2px solid #0070bd;
        outline-offset: 2px;
      }
      .locale-switcher:hover {
        background: #ffffff;
      }
      .locale-switcher span {
        opacity: 0.45;
        transition: opacity 0.15s ease, font-weight 0.15s ease;
      }
      .locale-switcher span.active {
        opacity: 1;
        font-weight: 600;
      }
      .locale-switcher .divider {
        margin: 0 6px;
        opacity: 0.3;
      }
    `,
  ],
})
export class LocaleSwitcherComponent {
  private readonly i18n = inject(I18nService);

  readonly locale = this.i18n.locale;

  readonly ariaLabel = computed(() =>
    this.locale() === 'zh-TW' ? 'Switch to English' : '切換為中文'
  );

  toggle(): void {
    this.i18n.setLocale(this.locale() === 'zh-TW' ? 'en' : 'zh-TW');
  }
}
