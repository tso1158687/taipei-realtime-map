import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TDX_RATE_LIMIT_DELAY_MS } from '../../core/tdx';
import {
  YouBikeService,
  mapAvailability,
  mapStation,
} from './youbike.service';

describe('YouBikeService', () => {
  let service: YouBikeService;
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
    service = TestBed.inject(YouBikeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('fetchStations: maps TDX shape to internal YouBikeStation', () => {
    let result: ReturnType<typeof Object> | undefined;
    service.fetchStations('Taipei').subscribe((s) => (result = s));
    httpMock
      .expectOne((r) => r.url.endsWith('/v2/Bike/Station/Taipei'))
      .flush([
        {
          StationUID: 'TPE0001',
          StationID: '0001',
          StationName: { Zh_tw: '市政府', En: 'City Hall' },
          StationPosition: { PositionLat: 25.04, PositionLon: 121.56 },
          BikesCapacity: 30,
          ServiceType: 2,
        },
      ]);
    const arr = result as unknown as Array<{
      id: string;
      capacity: number;
      serviceType: 1 | 2 | null;
    }>;
    expect(arr[0].id).toBe('Taipei-TPE0001');
    expect(arr[0].capacity).toBe(30);
    expect(arr[0].serviceType).toBe(2);
  });

  it('mapAvailability: marks ServiceStatus=0 as offline', () => {
    const a = mapAvailability({
      StationUID: 'X',
      StationID: 'X',
      ServiceStatus: 0,
      AvailableRentBikes: 0,
      AvailableReturnBikes: 0,
    });
    expect(a.serviceAvailable).toBe(false);
  });

  it('mapStation: unknown ServiceType falls back to null', () => {
    const s = mapStation(
      {
        StationUID: 'A',
        StationID: 'A',
        StationName: { Zh_tw: '甲', En: 'A' },
        StationPosition: { PositionLat: 25, PositionLon: 121 },
      },
      'NewTaipei'
    );
    expect(s.serviceType).toBeNull();
  });
});
