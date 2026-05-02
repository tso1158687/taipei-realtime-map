import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  REALTIME_WARMUP_DELAY_MS,
  TDX_RATE_LIMIT_DELAY_MS,
} from '../../core/tdx';
import { MetroRealtimeService, mapSignal } from './metro-realtime.service';

describe('MetroRealtimeService', () => {
  let service: MetroRealtimeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TDX_RATE_LIMIT_DELAY_MS, useValue: 0 },
        { provide: REALTIME_WARMUP_DELAY_MS, useValue: 0 },
      ],
    });
    service = TestBed.inject(MetroRealtimeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('mapSignal', () => {
    // The Phase-4 implementation filtered on `r.TrainNumber`, but TDX V2
    // LiveBoard rows do NOT include that field — only per-station signals.
    // The bug silently dropped every row, so train markers never appeared.
    // These tests pin the actual TDX shape so the regression can't return.
    const realLiveBoardRow = {
      LineNO: 'BL',
      LineID: 'BL',
      LineName: { Zh_tw: '板南線', En: 'Bannan Line' },
      StationID: 'BL01',
      StationName: { Zh_tw: '頂埔', En: 'Dingpu' },
      TripHeadSign: '往南港展覽館',
      DestinationStationID: 'BL23',
      DestinationStationName: {
        Zh_tw: '南港展覽館',
        En: 'Taipei Nangang Exhibition Center',
      },
      ServiceStatus: 0,
      EstimateTime: 0,
    };

    it('synthesises a stable trainNumber when the field is absent (real TDX shape)', () => {
      const sig = mapSignal(realLiveBoardRow, 'TRTC');
      expect(sig.trainNumber).toBe('BL-BL01-往南港展覽館');
      expect(sig.stationId).toBe('BL01');
      expect(sig.lineId).toBe('BL');
      expect(sig.destinationStationId).toBe('BL23');
      expect(sig.destinationName?.zh).toBe('南港展覽館');
    });

    it('uses TrainNumber if TDX ever does provide one (forward-compat)', () => {
      const sig = mapSignal(
        { ...realLiveBoardRow, TrainNumber: 'TRAIN-99' },
        'TRTC'
      );
      expect(sig.trainNumber).toBe('TRAIN-99');
    });

    it('falls back to DestinationStationID when TripHeadSign is missing too', () => {
      const sig = mapSignal(
        {
          StationID: 'R10',
          LineID: 'R',
          DestinationStationID: 'R28',
        },
        'TRTC'
      );
      // No TripHeadSign → use DestinationStationID as the third id segment
      expect(sig.trainNumber).toBe('R-R10-R28');
    });
  });

  describe('watchLiveBoard', () => {
    it('GETs LiveBoard and maps every row that has StationID + LineID', async () => {
      let received: ReturnType<typeof Object> | undefined;
      const sub = service
        .watchLiveBoard('TRTC')
        .subscribe((sigs) => (received = sigs));
      // timer(0,...) is a macrotask; yield once.
      await new Promise((r) => setTimeout(r, 0));

      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Rail/Metro/LiveBoard/TRTC'))
        .flush([
          {
            LineID: 'BL',
            StationID: 'BL01',
            TripHeadSign: '往南港展覽館',
            DestinationStationID: 'BL23',
            EstimateTime: 0,
          },
          {
            // Missing LineID — should be dropped
            StationID: 'BL02',
          },
          {
            // Missing StationID — should be dropped
            LineID: 'BL',
          },
          {
            LineID: 'R',
            StationID: 'R10',
            TripHeadSign: '往淡水',
            EstimateTime: 60,
          },
        ]);

      const arr = received as unknown as Array<{
        trainNumber: string;
        stationId: string;
        lineId: string;
      }>;
      expect(arr.length).toBe(2);
      expect(arr[0].stationId).toBe('BL01');
      expect(arr[1].stationId).toBe('R10');

      sub.unsubscribe();
    });

    it('shares the same stream across subscribers for the same operator', () => {
      const a = service.watchLiveBoard('TRTC');
      const b = service.watchLiveBoard('TRTC');
      expect(a).toBe(b);
    });

    it('returns an empty array when the upstream errors (does not kill the timer)', async () => {
      let received: ReturnType<typeof Object> | undefined;
      const sub = service
        .watchLiveBoard('TYMC')
        .subscribe((sigs) => (received = sigs));
      await new Promise((r) => setTimeout(r, 0));

      httpMock
        .expectOne((r) => r.url.endsWith('/v2/Rail/Metro/LiveBoard/TYMC'))
        .flush('boom', { status: 500, statusText: 'Server Error' });

      expect(((received as unknown) as readonly unknown[]).length).toBe(0);
      sub.unsubscribe();
    });
  });
});
