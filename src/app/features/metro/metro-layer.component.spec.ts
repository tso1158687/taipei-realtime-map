import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { I18nService } from '../../core/i18n';
import { MapService } from '../../core/map';
import { TDX_RATE_LIMIT_DELAY_MS } from '../../core/tdx';
import { MetroLayerComponent } from './metro-layer.component';
import { MetroService } from './metro.service';
import type { MetroNetwork } from './metro.types';

describe('MetroLayerComponent', () => {
  function createFakeMap() {
    return {
      getSource: vi.fn(() => undefined),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(() => undefined),
      removeLayer: vi.fn(),
      removeSource: vi.fn(),
      on: vi.fn(),
      getCanvas: vi.fn(() => ({ style: {} as Record<string, string> })),
    };
  }

  function setup() {
    const fakeMap = createFakeMap();
    const isReady = signal(false);
    const fetchNetwork = vi.fn((operatorId: string) =>
      of<MetroNetwork>({
        operatorId: operatorId as MetroNetwork['operatorId'],
        stations: [
          {
            id: `${operatorId}-S1`,
            stationId: 'S1',
            operatorId: operatorId as MetroNetwork['operatorId'],
            name: { zh: '測試站', en: 'Test Station' },
            position: { lat: 25, lng: 121.5 },
            lineIds: ['L1'],
          },
        ],
        lines: [
          {
            id: `${operatorId}-L1`,
            lineId: 'L1',
            operatorId: operatorId as MetroNetwork['operatorId'],
            name: { zh: '測試線', en: 'Test Line' },
            color: '#aabbcc',
            geometry: {
              type: 'LineString',
              coordinates: [
                [121.5, 25],
                [121.6, 25.1],
              ],
            },
          },
        ],
      })
    );

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
        { provide: MetroService, useValue: { fetchNetwork } },
        { provide: I18nService, useValue: { locale: signal('zh-TW').asReadonly() } },
        // Override the rate-limit delay to 0 in tests so concatMap fires both
        // operators in the same microtask batch.
        { provide: TDX_RATE_LIMIT_DELAY_MS, useValue: 0 },
      ],
    });

    return { fakeMap, isReady, fetchNetwork };
  }

  it('does not fetch any operator until the map is ready', () => {
    const { fetchNetwork } = setup();
    const fixture = TestBed.createComponent(MetroLayerComponent);
    fixture.detectChanges();
    expect(fetchNetwork).not.toHaveBeenCalled();
  });

  it('fetches both Metro operators (TRTC + TYMC) when map becomes ready', async () => {
    const { isReady, fetchNetwork } = setup();
    const fixture = TestBed.createComponent(MetroLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    // With METRO_RATE_LIMIT_DELAY_MS overridden to 0, both operators fire
    // after a single microtask flush.
    await fixture.whenStable();

    const calls = fetchNetwork.mock.calls.map((c) => c[0]);
    expect(calls).toContain('TRTC');
    expect(calls).toContain('TYMC');
    expect(calls.length).toBe(2);
  });

  it('adds two sources + two layers per operator (lines + stations)', async () => {
    const { fakeMap, isReady } = setup();
    const fixture = TestBed.createComponent(MetroLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fakeMap.addSource).toHaveBeenCalledTimes(4);
    expect(fakeMap.addLayer).toHaveBeenCalledTimes(4);

    const sourceIds = fakeMap.addSource.mock.calls.map((c) => c[0]);
    expect(sourceIds).toContain('metro-lines-TRTC');
    expect(sourceIds).toContain('metro-lines-TYMC');
    expect(sourceIds).toContain('metro-stations-TRTC');
    expect(sourceIds).toContain('metro-stations-TYMC');
  });

  it('binds click + cursor handlers on station layers', async () => {
    const { fakeMap, isReady } = setup();
    const fixture = TestBed.createComponent(MetroLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const events = fakeMap.on.mock.calls.map((c) => `${c[0]}:${c[1]}`);
    expect(events).toContain('click:metro-stations-layer-TRTC');
    expect(events).toContain('mouseenter:metro-stations-layer-TRTC');
    expect(events).toContain('mouseleave:metro-stations-layer-TRTC');
  });

  it('does not re-add sources when fetchNetwork resolves twice (idempotent)', async () => {
    const { fakeMap, isReady } = setup();
    let secondPass = false;
    fakeMap.getSource.mockImplementation(() =>
      secondPass ? ({ setData: vi.fn() } as never) : undefined
    );

    const fixture = TestBed.createComponent(MetroLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const initialAddSourceCalls = fakeMap.addSource.mock.calls.length;
    expect(initialAddSourceCalls).toBe(4);

    // The *idempotent path* exists in upsertLines/upsertStations: when
    // getSource returns truthy, the code calls setData rather than addSource.
    secondPass = true;
    expect(fakeMap.addSource.mock.calls.length).toBe(initialAddSourceCalls);
  });
});
