import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TDX_RATE_LIMIT_DELAY_MS } from '../../core/tdx';
import { BusRealtimeService, mapVehicle } from './bus-realtime.service';

describe('BusRealtimeService', () => {
  let service: BusRealtimeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TDX_RATE_LIMIT_DELAY_MS, useValue: 0 },
      ],
    });
    service = TestBed.inject(BusRealtimeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('GETs RealTimeByFrequency on first subscribe and maps vehicles', async () => {
    let received: ReturnType<typeof Object> | undefined;
    const sub = service.watchVehicles('Taipei').subscribe((v) => (received = v));
    // timer(0) is a macrotask — yield once so the request fires
    await new Promise((r) => setTimeout(r, 0));

    httpMock
      .expectOne((r) =>
        r.url.endsWith('/v2/Bus/RealTimeByFrequency/City/Taipei')
      )
      .flush([
        {
          PlateNumb: 'EAL-1234',
          RouteUID: 'TPE100',
          RouteID: '100',
          Direction: 0,
          BusPosition: { PositionLat: 25.05, PositionLon: 121.55 },
          Azimuth: 90,
          Speed: 30,
        },
      ]);

    const arr = received as unknown as Array<{
      id: string;
      city: string;
      position: { lat: number; lng: number };
      azimuth?: number;
    }>;
    expect(arr.length).toBe(1);
    expect(arr[0].id).toBe('Taipei-EAL-1234');
    expect(arr[0].city).toBe('Taipei');
    expect(arr[0].position.lat).toBe(25.05);
    expect(arr[0].azimuth).toBe(90);

    sub.unsubscribe();
  });

  it('mapVehicle: coerces TDX shape to internal BusVehicle', () => {
    const v = mapVehicle(
      {
        PlateNumb: 'XYZ-9999',
        RouteUID: 'NTPE5',
        RouteID: '5',
        Direction: 1,
        BusPosition: { PositionLat: 25.0, PositionLon: 121.5 },
      },
      'NewTaipei'
    );
    expect(v.id).toBe('NewTaipei-XYZ-9999');
    expect(v.routeUid).toBe('NTPE5');
    expect(v.direction).toBe(1);
    expect(v.azimuth).toBeUndefined();
  });

  it('shares the same observable for the same city across subscribers', async () => {
    const o1 = service.watchVehicles('Taipei');
    const o2 = service.watchVehicles('Taipei');
    expect(o1).toBe(o2); // same instance from cache

    const sub = o1.subscribe();
    await new Promise((r) => setTimeout(r, 0));
    httpMock
      .expectOne((r) =>
        r.url.endsWith('/v2/Bus/RealTimeByFrequency/City/Taipei')
      )
      .flush([]);
    sub.unsubscribe();
  });

  it('returns an empty array when the upstream request errors', async () => {
    let received: ReturnType<typeof Object> | undefined;
    const sub = service
      .watchVehicles('Keelung')
      .subscribe((v) => (received = v));
    await new Promise((r) => setTimeout(r, 0));

    httpMock
      .expectOne((r) =>
        r.url.endsWith('/v2/Bus/RealTimeByFrequency/City/Keelung')
      )
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(((received as unknown) as readonly unknown[])?.length).toBe(0);
    sub.unsubscribe();
  });
});
