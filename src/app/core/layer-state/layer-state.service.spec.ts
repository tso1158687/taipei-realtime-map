import { TestBed } from '@angular/core/testing';
import { LayerStateService } from './layer-state.service';

describe('LayerStateService', () => {
  let service: LayerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LayerStateService);
    service._resetForTesting();
  });

  it('registers a layer with default visibility=true and status=idle', () => {
    service.register('metro.TRTC', { zh: '臺北捷運', en: 'Taipei Metro' });
    expect(service.layers().length).toBe(1);
    const info = service.get('metro.TRTC');
    expect(info?.visible).toBe(true);
    expect(info?.status).toBe('idle');
  });

  it('register is idempotent for the same key', () => {
    service.register('metro.TRTC', { zh: '臺北', en: 'Taipei' });
    service.register('metro.TRTC', { zh: '別的', en: 'other' });
    expect(service.layers().length).toBe(1);
    expect(service.get('metro.TRTC')?.label.zh).toBe('臺北'); // first wins
  });

  it('honours initialVisible=false', () => {
    service.register(
      'bus.Taipei',
      { zh: '臺北市公車', en: 'Taipei Bus' },
      { initialVisible: false }
    );
    expect(service.get('bus.Taipei')?.visible).toBe(false);
  });

  it('setStatus updates status; clears errorMessage when status is not error', () => {
    service.register('metro.TRTC', { zh: '臺北', en: 'Taipei' });
    service.setStatus('metro.TRTC', 'error', 'boom');
    expect(service.get('metro.TRTC')?.status).toBe('error');
    expect(service.get('metro.TRTC')?.errorMessage).toBe('boom');
    service.setStatus('metro.TRTC', 'loaded');
    expect(service.get('metro.TRTC')?.status).toBe('loaded');
    expect(service.get('metro.TRTC')?.errorMessage).toBeUndefined();
  });

  it('setVisibility flips the visible flag without touching status', () => {
    service.register('metro.TRTC', { zh: '臺北', en: 'Taipei' });
    service.setStatus('metro.TRTC', 'loaded');
    service.setVisibility('metro.TRTC', false);
    expect(service.get('metro.TRTC')?.visible).toBe(false);
    expect(service.get('metro.TRTC')?.status).toBe('loaded');
  });

  it('visibilityOf returns a reactive signal', () => {
    service.register('metro.TRTC', { zh: '臺北', en: 'Taipei' });
    const sig = service.visibilityOf('metro.TRTC');
    expect(sig()).toBe(true);
    service.setVisibility('metro.TRTC', false);
    expect(sig()).toBe(false);
  });

  it('visibilityOf returns false for unknown keys', () => {
    expect(service.visibilityOf('does.not.exist')()).toBe(false);
  });
});
