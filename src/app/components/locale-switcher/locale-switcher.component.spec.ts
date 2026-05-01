import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n';
import { LocaleSwitcherComponent } from './locale-switcher.component';

describe('LocaleSwitcherComponent', () => {
  let i18n: I18nService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    i18n = TestBed.inject(I18nService);
  });

  function getButton(host: HTMLElement): HTMLButtonElement {
    const btn = host.querySelector<HTMLButtonElement>('button.locale-switcher');
    if (!btn) throw new Error('button not found');
    return btn;
  }

  it('renders 中 / EN with the active span marked when locale=zh-TW', () => {
    const fixture = TestBed.createComponent(LocaleSwitcherComponent);
    fixture.detectChanges();
    const button = getButton(fixture.nativeElement);
    const spans = Array.from(button.querySelectorAll('span'));
    const activeText = spans.find((s) => s.classList.contains('active'))?.textContent;
    expect(activeText).toBe('中');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the button toggles the I18nService locale', () => {
    const fixture = TestBed.createComponent(LocaleSwitcherComponent);
    fixture.detectChanges();
    expect(i18n.locale()).toBe('zh-TW');
    getButton(fixture.nativeElement).click();
    fixture.detectChanges();
    expect(i18n.locale()).toBe('en');
    // and the visual state flips
    const activeText = fixture.nativeElement
      .querySelectorAll('span.active')[0]?.textContent;
    expect(activeText).toBe('EN');
  });

  it('aria-label switches direction based on current locale', () => {
    const fixture = TestBed.createComponent(LocaleSwitcherComponent);
    fixture.detectChanges();
    const button = getButton(fixture.nativeElement);
    expect(button.getAttribute('aria-label')).toBe('Switch to English');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('切換為中文');
  });
});
