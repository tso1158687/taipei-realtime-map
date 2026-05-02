import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { I18nService } from '../../core/i18n';
import { LayerStateService } from '../../core/layer-state';
import { MapService } from '../../core/map';
import { RailTrainLayerComponent } from './rail-train-layer.component';
import { RailService } from './rail.service';
import type { RailNetwork, TraTrainLive } from './rail.types';

describe('RailTrainLayerComponent', () => {
  function createFakeMap() {
    return {
      getSource: vi.fn(() => undefined),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(() => undefined),
      on: vi.fn(),
      off: vi.fn(),
      getCanvas: vi.fn(() => ({ style: {} as Record<string, string> })),
    };
  }

  function setup(opts: {
    layerVisible?: boolean;
    layerStatus?: 'loading' | 'loaded' | 'error';
  } = {}) {
    const fakeMap = createFakeMap();
    const isReady = signal(false);

    const fetchNetwork = vi.fn(() =>
      of<RailNetwork>({
        mode: 'TRA',
        stations: [
          {
            id: 'TRA-1000',
            stationId: '1000',
            mode: 'TRA',
            name: { zh: '台北', en: 'Taipei' },
            position: { lat: 25.05, lng: 121.51 },
          },
        ],
        lines: [],
      })
    );
    const liveStream = new Subject<readonly TraTrainLive[]>();
    const watchTraLiveBoard = vi.fn(() => liveStream.asObservable());

    // Fake LayerStateService: just signals layers().
    const layerVisible = opts.layerVisible ?? true;
    const layerStatus = opts.layerStatus ?? 'loaded';
    const layers = signal([
      { key: 'rail.TRA', label: 'TRA', visible: layerVisible, status: layerStatus },
    ]);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: MapService,
          useValue: {
            isReady: isReady.asReadonly(),
            getMap: () => fakeMap,
            isInitialized: () => true,
          },
        },
        { provide: RailService, useValue: { fetchNetwork, watchTraLiveBoard } },
        { provide: LayerStateService, useValue: { layers: layers.asReadonly() } },
        {
          provide: I18nService,
          useValue: { locale: signal('zh-TW').asReadonly() },
        },
      ],
    });

    return { fakeMap, isReady, layers, fetchNetwork, watchTraLiveBoard, liveStream };
  }

  it('does not subscribe before the map is ready', () => {
    const { fetchNetwork, watchTraLiveBoard } = setup();
    const fixture = TestBed.createComponent(RailTrainLayerComponent);
    fixture.detectChanges();
    expect(fetchNetwork).not.toHaveBeenCalled();
    expect(watchTraLiveBoard).not.toHaveBeenCalled();
  });

  it('subscribes to fetchNetwork + watchTraLiveBoard once layer becomes visible', async () => {
    const { isReady, fetchNetwork, watchTraLiveBoard } = setup();
    const fixture = TestBed.createComponent(RailTrainLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fetchNetwork).toHaveBeenCalledTimes(1);
    expect(watchTraLiveBoard).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe when the layer status is "error"', async () => {
    const { isReady, fetchNetwork, watchTraLiveBoard } = setup({
      layerStatus: 'error',
    });
    const fixture = TestBed.createComponent(RailTrainLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fetchNetwork).not.toHaveBeenCalled();
    expect(watchTraLiveBoard).not.toHaveBeenCalled();
  });

  it('subscribes even when status is still "loading" — realtime should not wait for static drain', async () => {
    const { isReady, fetchNetwork, watchTraLiveBoard } = setup({
      layerStatus: 'loading',
    });
    const fixture = TestBed.createComponent(RailTrainLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    // Critical: the previous regression was gating on 'loaded' which meant a
    // 90s cold-start drain blocked the realtime subscription entirely.
    expect(fetchNetwork).toHaveBeenCalledTimes(1);
    expect(watchTraLiveBoard).toHaveBeenCalledTimes(1);
  });
});
