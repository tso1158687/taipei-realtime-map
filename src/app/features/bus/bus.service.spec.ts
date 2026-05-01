import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TDX_RATE_LIMIT_DELAY_MS } from '../../core/tdx';
import {
  BusService,
  aggregateStops,
  mergeRoutesAndShapes,
} from './bus.service';

describe('BusService', () => {
  let service: BusService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TDX_RATE_LIMIT_DELAY_MS, useValue: 0 },
      ],
    });
    service = TestBed.inject(BusService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('fetchRoutes', () => {
    it('GETs Route + Shape and merges WKT geometry by RouteUID', () => {
      let result: ReturnType<typeof Object> | undefined;
      service.fetchRoutes('Taipei').subscribe((r) => (result = r));

      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Bus/Route/City/Taipei'))
        .flush([
          {
            RouteUID: 'TPE100',
            RouteID: '100',
            RouteName: { Zh_tw: '100', En: '100' },
            DepartureStopNameZh: '板橋',
            DepartureStopNameEn: 'Banqiao',
            DestinationStopNameZh: '台北車站',
            DestinationStopNameEn: 'Taipei Main Station',
          },
        ]);
      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Bus/Shape/City/Taipei'))
        .flush([
          {
            RouteUID: 'TPE100',
            RouteID: '100',
            Direction: 0,
            Geometry: 'LINESTRING(121.45 25.01, 121.46 25.02, 121.51 25.05)',
          },
          {
            RouteUID: 'TPE100',
            RouteID: '100',
            Direction: 1,
            Geometry: 'LINESTRING(121.51 25.05, 121.46 25.02, 121.45 25.01)',
          },
        ]);

      const arr = result as unknown as Array<{
        id: string;
        name: { zh: string; en: string };
        departureStop: { zh: string };
        destinationStop: { zh: string };
        geometry: { type: string };
        color: string;
      }>;
      expect(arr.length).toBe(1);
      expect(arr[0].id).toBe('Taipei-TPE100');
      expect(arr[0].name.zh).toBe('100');
      expect(arr[0].departureStop.zh).toBe('板橋');
      expect(arr[0].destinationStop.zh).toBe('台北車站');
      // Two LINESTRINGs collapse into one MultiLineString
      expect(arr[0].geometry.type).toBe('MultiLineString');
      expect(arr[0].color).toBe('#0070bd'); // Taipei brand color
    });

    it('falls back to city color when no LineColor is provided (always)', () => {
      let result: ReturnType<typeof Object> | undefined;
      service.fetchRoutes('Taoyuan').subscribe((r) => (result = r));

      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Bus/Route/City/Taoyuan'))
        .flush([
          {
            RouteUID: 'TYN1',
            RouteID: '1',
            RouteName: { Zh_tw: '1', En: '1' },
          },
        ]);
      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Bus/Shape/City/Taoyuan'))
        .flush([]);

      const arr = result as unknown as Array<{ color: string }>;
      expect(arr[0].color).toBe('#7e277e'); // Taoyuan brand
    });
  });

  describe('fetchStops', () => {
    it('aggregates stops across multiple routes/directions', () => {
      let result: ReturnType<typeof Object> | undefined;
      service.fetchStops('NewTaipei').subscribe((r) => (result = r));

      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Bus/StopOfRoute/City/NewTaipei'))
        .flush([
          {
            RouteUID: 'NTPE1',
            RouteID: '1',
            RouteName: { Zh_tw: '1', En: '1' },
            Direction: 0,
            Stops: [
              {
                StopUID: 'NTPESHARED',
                StopID: 'A',
                StopName: { Zh_tw: '共用站', En: 'Shared' },
                StopSequence: 1,
                StopPosition: { PositionLat: 25, PositionLon: 121.5 },
              },
            ],
          },
          {
            RouteUID: 'NTPE2',
            RouteID: '2',
            RouteName: { Zh_tw: '2', En: '2' },
            Direction: 1,
            Stops: [
              {
                StopUID: 'NTPESHARED',
                StopID: 'A',
                StopName: { Zh_tw: '共用站', En: 'Shared' },
                StopSequence: 5,
                StopPosition: { PositionLat: 25, PositionLon: 121.5 },
              },
            ],
          },
        ]);

      const arr = result as unknown as Array<{
        id: string;
        routeUids: readonly string[];
      }>;
      expect(arr.length).toBe(1);
      expect(arr[0].id).toBe('NewTaipei-NTPESHARED');
      expect([...arr[0].routeUids].sort()).toEqual(['NTPE1', 'NTPE2']);
    });
  });

  it('fetchNetwork: forks routes + stops + shapes (3 underlying GETs)', () => {
    let net: ReturnType<typeof Object> | undefined;
    service.fetchNetwork('Keelung').subscribe((r) => (net = r));

    httpMock
      .expectOne((r) => r.url.endsWith('/v2/Bus/Route/City/Keelung'))
      .flush([]);
    httpMock
      .expectOne((r) => r.url.endsWith('/v2/Bus/Shape/City/Keelung'))
      .flush([]);
    httpMock
      .expectOne((r) => r.url.endsWith('/v2/Bus/StopOfRoute/City/Keelung'))
      .flush([]);

    expect((net as unknown as { city: string }).city).toBe('Keelung');
  });

  describe('helpers', () => {
    it('mergeRoutesAndShapes: matches shapes by RouteUID and falls back to empty', () => {
      const merged = mergeRoutesAndShapes(
        [
          {
            RouteUID: 'A',
            RouteID: 'A',
            RouteName: { Zh_tw: 'A', En: 'A' },
          },
          {
            RouteUID: 'B',
            RouteID: 'B',
            RouteName: { Zh_tw: 'B', En: 'B' },
          },
        ],
        [
          {
            RouteUID: 'A',
            RouteID: 'A',
            Geometry: 'LINESTRING(1 2, 3 4)',
          },
        ],
        'Taipei'
      );
      expect(merged.find((r) => r.routeUid === 'A')?.geometry.type).toBe('LineString');
      expect(merged.find((r) => r.routeUid === 'B')?.geometry.coordinates.length).toBe(0);
    });

    it('aggregateStops: deduplicates by StopUID and unions routes', () => {
      const stops = aggregateStops(
        [
          {
            RouteUID: 'R1',
            RouteID: 'R1',
            RouteName: { Zh_tw: 'R1', En: 'R1' },
            Direction: 0,
            Stops: [
              {
                StopUID: 'S1',
                StopID: 'S1',
                StopName: { Zh_tw: '一', En: 'One' },
                StopSequence: 1,
                StopPosition: { PositionLat: 25, PositionLon: 121 },
              },
            ],
          },
          {
            RouteUID: 'R1',
            RouteID: 'R1',
            RouteName: { Zh_tw: 'R1', En: 'R1' },
            Direction: 1,
            Stops: [
              {
                StopUID: 'S1',
                StopID: 'S1',
                StopName: { Zh_tw: '一', En: 'One' },
                StopSequence: 9,
                StopPosition: { PositionLat: 25, PositionLon: 121 },
              },
            ],
          },
        ],
        'Taipei'
      );
      expect(stops.length).toBe(1);
      expect(stops[0].routeUids).toEqual(['R1']);
    });
  });
});
