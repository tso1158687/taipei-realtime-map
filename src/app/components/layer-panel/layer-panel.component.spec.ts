import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/i18n';
import { LayerStateService } from '../../core/layer-state';
import { LayerPanelComponent } from './layer-panel.component';

describe('LayerPanelComponent', () => {
  let layerState: LayerStateService;
  let i18n: I18nService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    layerState = TestBed.inject(LayerStateService);
    i18n = TestBed.inject(I18nService);
    layerState._resetForTesting();
  });

  it('hides itself when no layers are registered', () => {
    const fixture = TestBed.createComponent(LayerPanelComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
  });

  it('renders one row per registered layer', () => {
    layerState.register('metro.TRTC', { zh: '臺北捷運', en: 'Taipei Metro' });
    layerState.register('metro.TYMC', { zh: '桃園捷運', en: 'Taoyuan Metro' });
    const fixture = TestBed.createComponent(LayerPanelComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const rows = Array.from(host.querySelectorAll('.row'));
    expect(rows.length).toBe(2);
    const labels = rows.map((r) => r.querySelector('.text')?.textContent?.trim());
    expect(labels).toContain('臺北捷運');
    expect(labels).toContain('桃園捷運');
  });

  it('shows English labels when locale is en', () => {
    layerState.register('metro.TRTC', { zh: '臺北捷運', en: 'Taipei Metro' });
    i18n.setLocale('en');
    const fixture = TestBed.createComponent(LayerPanelComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const text = host.querySelector('.text')?.textContent?.trim();
    expect(text).toBe('Taipei Metro');
  });

  it('clicking the checkbox flips the visibility in LayerStateService', () => {
    layerState.register('metro.TRTC', { zh: '臺北捷運', en: 'Taipei Metro' });
    const fixture = TestBed.createComponent(LayerPanelComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const checkbox = host.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(layerState.get('metro.TRTC')?.visible).toBe(true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(layerState.get('metro.TRTC')?.visible).toBe(false);
  });

  it('reflects status changes via the .status-* class', () => {
    layerState.register('metro.TRTC', { zh: '臺北', en: 'Taipei' });
    const fixture = TestBed.createComponent(LayerPanelComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.status.status-idle')).toBeTruthy();

    layerState.setStatus('metro.TRTC', 'loading');
    fixture.detectChanges();
    expect(host.querySelector('.status.status-loading')).toBeTruthy();

    layerState.setStatus('metro.TRTC', 'error', 'fetch failed');
    fixture.detectChanges();
    const errorDot = host.querySelector('.status.status-error');
    expect(errorDot?.getAttribute('title')).toBe('fetch failed');
  });
});
