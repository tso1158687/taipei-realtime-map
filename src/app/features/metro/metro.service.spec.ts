import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  MetroService,
  buildLineIdsByStation,
  mapStation,
  mergeLinesAndShapes,
  unwrapEnvelope,
} from './metro.service';

describe('MetroService', () => {
  let service: MetroService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MetroService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('fetchStations', () => {
    it('GETs Station + StationOfLine and merges line ids per station', () => {
      let result: ReturnType<typeof Object> | undefined;
      service.fetchStations('TRTC').subscribe((r) => (result = r));

      const stationsReq = httpMock.expectOne(
        (r) => r.url === '/api/tdx/v2/Rail/Metro/Station/TRTC'
      );
      stationsReq.flush({
        Stations: [
          {
            StationUID: 'TRTC-BL12',
            StationID: 'BL12',
            StationName: { Zh_tw: '台北車站', En: 'Taipei Main Station' },
            StationPosition: { PositionLat: 25.0467, PositionLon: 121.5174 },
          },
        ],
      });

      const stationOfLineReq = httpMock.expectOne(
        (r) => r.url === '/api/tdx/v2/Rail/Metro/StationOfLine/TRTC'
      );
      stationOfLineReq.flush({
        StationOfLines: [
          { LineID: 'BL', Stations: [{ StationID: 'BL12', Sequence: 12 }] },
          { LineID: 'R', Stations: [{ StationID: 'BL12', Sequence: 11 }] },
        ],
      });

      const stations = result as unknown as Array<{
        id: string;
        name: { zh: string; en: string };
        lineIds: readonly string[];
      }>;
      expect(stations).toBeDefined();
      expect(stations.length).toBe(1);
      expect(stations[0].id).toBe('TRTC-BL12');
      expect(stations[0].name.zh).toBe('台北車站');
      expect([...stations[0].lineIds].sort()).toEqual(['BL', 'R']);
    });

    it('handles a bare-array response (no envelope)', () => {
      let result: ReturnType<typeof Object> | undefined;
      service.fetchStations('TYMC').subscribe((r) => (result = r));

      httpMock
        .expectOne((r) => r.url.endsWith('/Station/TYMC'))
        .flush([
          {
            StationUID: 'TYMC-A1',
            StationID: 'A1',
            StationName: { Zh_tw: '台北車站', En: 'Taipei Main Station' },
            StationPosition: { PositionLat: 25.05, PositionLon: 121.52 },
          },
        ]);
      httpMock
        .expectOne((r) => r.url.endsWith('/StationOfLine/TYMC'))
        .flush([]);

      expect(((result as unknown) as readonly unknown[]).length).toBe(1);
    });
  });

  describe('fetchLines', () => {
    it('requests Shape with $format=GEOJSON and merges with Line metadata', () => {
      let lines: ReturnType<typeof Object> | undefined;
      service.fetchLines('TRTC').subscribe((r) => (lines = r));

      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Rail/Metro/Line/TRTC'))
        .flush({
          Lines: [
            {
              LineID: 'BR',
              LineName: { Zh_tw: '文湖線', En: 'Wenhu Line' },
              LineColor: '#a35e2c',
            },
          ],
        });

      const shapeReq = httpMock.expectOne(
        (r) =>
          r.url.endsWith('/v2/Rail/Metro/Shape/TRTC') &&
          r.params.get('$format') === 'GEOJSON'
      );
      shapeReq.flush({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [121.59, 25.06],
                [121.6, 25.07],
              ],
            },
            properties: { LineID: 'BR' },
          },
        ],
      });

      const arr = lines as unknown as Array<{
        id: string;
        color: string;
        geometry: { type: string; coordinates: unknown };
      }>;
      expect(arr.length).toBe(1);
      expect(arr[0].id).toBe('TRTC-BR');
      expect(arr[0].color).toBe('#a35e2c');
      expect(arr[0].geometry.type).toBe('LineString');
    });

    it('falls back to the operator brand color when LineColor is missing', () => {
      let lines: ReturnType<typeof Object> | undefined;
      service.fetchLines('TYMC').subscribe((r) => (lines = r));

      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Rail/Metro/Line/TYMC'))
        .flush({
          Lines: [
            { LineID: 'A', LineName: { Zh_tw: '機場線', En: 'Airport Line' } },
          ],
        });
      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Rail/Metro/Shape/TYMC'))
        .flush({ type: 'FeatureCollection', features: [] });

      const arr = lines as unknown as Array<{ color: string }>;
      expect(arr[0].color).toBe('#7e277e'); // TYMC operator brand color
    });
  });

  describe('helpers', () => {
    it('unwrapEnvelope: returns array as-is, unwraps envelope, defaults to []', () => {
      expect(unwrapEnvelope([1, 2, 3] as unknown as number[], 'X')).toEqual([1, 2, 3]);
      expect(unwrapEnvelope({ X: ['a'] } as unknown, 'X')).toEqual(['a']);
      expect(unwrapEnvelope({ Y: ['a'] } as unknown, 'X')).toEqual([]);
      expect(unwrapEnvelope(null, 'X')).toEqual([]);
      expect(unwrapEnvelope(undefined, 'X')).toEqual([]);
    });

    it('buildLineIdsByStation: dedupes line ids per station', () => {
      const map = buildLineIdsByStation([
        { LineID: 'BL', Stations: [{ StationID: 'S1', Sequence: 1 }] },
        { LineID: 'BL', Stations: [{ StationID: 'S1', Sequence: 1 }] }, // dup
        { LineID: 'R', Stations: [{ StationID: 'S1', Sequence: 1 }] },
      ]);
      expect(map.get('S1')).toEqual(['BL', 'R']);
    });

    it('mapStation: produces a stable composite id', () => {
      const station = mapStation(
        {
          StationUID: 'TRTC-BL12',
          StationID: 'BL12',
          StationName: { Zh_tw: '台北車站', En: 'Taipei Main' },
          StationPosition: { PositionLat: 25.04, PositionLon: 121.51 },
        },
        'TRTC',
        new Map([['BL12', ['BL', 'R']]])
      );
      expect(station.id).toBe('TRTC-BL12');
      expect(station.position).toEqual({ lat: 25.04, lng: 121.51 });
      expect(station.lineIds).toEqual(['BL', 'R']);
    });

    it('mergeLinesAndShapes: coalesces multiple features per line into MultiLineString', () => {
      const lines = mergeLinesAndShapes(
        [{ LineID: 'BR', LineName: { Zh_tw: '文湖線', En: 'Wenhu' } }],
        [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] },
            properties: { LineID: 'BR' },
          },
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[3, 3], [4, 4]] },
            properties: { LineID: 'BR' },
          },
        ],
        'TRTC'
      );
      expect(lines[0].geometry.type).toBe('MultiLineString');
      if (lines[0].geometry.type === 'MultiLineString') {
        expect(lines[0].geometry.coordinates.length).toBe(2);
      }
    });
  });

  it('fetchNetwork: forks both station and line requests and combines them', () => {
    let net: ReturnType<typeof Object> | undefined;
    service.fetchNetwork('TRTC').subscribe((r) => (net = r));

    httpMock
      .expectOne((r) => r.url.endsWith('/Station/TRTC'))
      .flush({ Stations: [] });
    httpMock
      .expectOne((r) => r.url.endsWith('/StationOfLine/TRTC'))
      .flush({ StationOfLines: [] });
    httpMock
      .expectOne((r) => r.url.endsWith('/Line/TRTC'))
      .flush({ Lines: [] });
    httpMock
      .expectOne((r) => r.url.endsWith('/Shape/TRTC'))
      .flush({ type: 'FeatureCollection', features: [] });

    const result = net as unknown as { operatorId: string };
    expect(result.operatorId).toBe('TRTC');
  });
});
