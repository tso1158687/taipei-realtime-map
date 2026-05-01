import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { MapService } from './core/map';

describe('App', () => {
  /**
   * MapService is stubbed because the real implementation constructs a
   * MapLibre `Map`, which needs WebGL — jsdom (the Vitest default DOM)
   * doesn't provide WebGL, so calling it would throw.
   */
  function createMapServiceStub(): Partial<MapService> {
    const isReady = signal(false);
    // Minimal MapLibre stand-in: only the methods MapShellComponent calls.
    const fakeMap = {
      addControl: () => fakeMap,
      removeControl: () => fakeMap,
      on: () => fakeMap,
      off: () => fakeMap,
      remove: () => undefined,
    } as unknown as ReturnType<MapService['initialize']>;
    return {
      isReady: isReady.asReadonly(),
      initialize: () => fakeMap,
      destroy: () => undefined,
      isInitialized: () => false,
      getMap: () => fakeMap,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: MapService, useValue: createMapServiceStub() }],
    }).compileComponents();
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the map shell', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-map-shell')).toBeTruthy();
  });
});
