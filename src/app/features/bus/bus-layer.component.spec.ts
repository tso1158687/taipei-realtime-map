import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { I18nService } from '../../core/i18n';
import { MapService } from '../../core/map';
import { TDX_RATE_LIMIT_DELAY_MS } from '../../core/tdx';
import { BusLayerComponent } from './bus-layer.component';
import { BusService } from './bus.service';
import type { BusNetwork } from './bus.types';

describe('BusLayerComponent', () => {
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
    const fetchNetwork = vi.fn((city: string) =>
      of<BusNetwork>({
        city: city as BusNetwork['city'],
        routes: [
          {
            id: `${city}-R1`,
            routeUid: 'R1',
            routeId: 'R1',
            city: city as BusNetwork['city'],
            name: { zh: '一路', en: 'Route 1' },
            departureStop: { zh: '甲', en: 'A' },
            destinationStop: { zh: '乙', en: 'B' },
            color: '#0070bd',
            geometry: {
              type: 'LineString',
              coordinates: [
                [121.5, 25],
                [121.6, 25.1],
              ],
            },
          },
        ],
        stops: [
          {
            id: `${city}-S1`,
            stopUid: 'S1',
            stopId: 'S1',
            city: city as BusNetwork['city'],
            name: { zh: '甲', en: 'A' },
            position: { lat: 25, lng: 121.5 },
            routeUids: ['R1'],
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
        { provide: BusService, useValue: { fetchNetwork } },
        { provide: I18nService, useValue: { locale: signal('zh-TW').asReadonly() } },
        { provide: TDX_RATE_LIMIT_DELAY_MS, useValue: 0 },
      ],
    });

    return { fakeMap, isReady, fetchNetwork };
  }

  it('does not fetch any city until the map is ready', () => {
    const { fetchNetwork } = setup();
    const fixture = TestBed.createComponent(BusLayerComponent);
    fixture.detectChanges();
    expect(fetchNetwork).not.toHaveBeenCalled();
  });

  it('fetches all 4 cities (Taipei, NewTaipei, Taoyuan, Keelung) on map ready', async () => {
    const { isReady, fetchNetwork } = setup();
    const fixture = TestBed.createComponent(BusLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const calls = fetchNetwork.mock.calls.map((c) => c[0]);
    expect(calls).toContain('Taipei');
    expect(calls).toContain('NewTaipei');
    expect(calls).toContain('Taoyuan');
    expect(calls).toContain('Keelung');
    expect(calls.length).toBe(4);
  });

  it('adds 2 sources + 2 layers per city = 8 total', async () => {
    const { fakeMap, isReady } = setup();
    const fixture = TestBed.createComponent(BusLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fakeMap.addSource).toHaveBeenCalledTimes(8);
    expect(fakeMap.addLayer).toHaveBeenCalledTimes(8);
    const sourceIds = fakeMap.addSource.mock.calls.map((c) => c[0]);
    expect(sourceIds).toContain('bus-routes-Taipei');
    expect(sourceIds).toContain('bus-stops-Taipei');
    expect(sourceIds).toContain('bus-routes-Keelung');
    expect(sourceIds).toContain('bus-stops-Keelung');
  });

  it('routes layer has minzoom=10, stops layer has minzoom=12', async () => {
    const { fakeMap, isReady } = setup();
    const fixture = TestBed.createComponent(BusLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const layerCalls = fakeMap.addLayer.mock.calls.map((c) => c[0]);
    const routesLayer = layerCalls.find(
      (l: { id: string }) => l.id === 'bus-routes-layer-Taipei'
    );
    const stopsLayer = layerCalls.find(
      (l: { id: string }) => l.id === 'bus-stops-layer-Taipei'
    );
    expect((routesLayer as { minzoom: number }).minzoom).toBe(10);
    expect((stopsLayer as { minzoom: number }).minzoom).toBe(12);
  });

  it('binds click + cursor handlers on stop layers', async () => {
    const { fakeMap, isReady } = setup();
    const fixture = TestBed.createComponent(BusLayerComponent);
    fixture.detectChanges();
    isReady.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const events = fakeMap.on.mock.calls.map((c) => `${c[0]}:${c[1]}`);
    expect(events).toContain('click:bus-stops-layer-Taipei');
    expect(events).toContain('mouseenter:bus-stops-layer-Taipei');
    expect(events).toContain('mouseleave:bus-stops-layer-Taipei');
  });
});
