import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TDX_RATE_LIMIT_DELAY_MS } from '../../core/tdx';
import { ThsrTimetableService, toScheduledTrain } from './thsr-timetable.service';

describe('ThsrTimetableService', () => {
  let service: ThsrTimetableService;
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
    service = TestBed.inject(ThsrTimetableService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('toScheduledTrain: maps a real TDX row into the internal shape', () => {
    const realRow = {
      TrainDate: '2026-05-04',
      DailyTrainInfo: {
        TrainNo: '0108',
        Direction: 1 as const,
        StartingStationID: '1070',
        StartingStationName: { Zh_tw: '左營', En: 'Zuoying' },
        EndingStationID: '0990',
        EndingStationName: { Zh_tw: '南港', En: 'Nangang' },
      },
      StopTimes: [
        {
          StopSequence: 1,
          StationID: '1070',
          StationName: { Zh_tw: '左營', En: 'Zuoying' },
          ArrivalTime: '07:55',
          DepartureTime: '07:55',
        },
        {
          StopSequence: 2,
          StationID: '1040',
          StationName: { Zh_tw: '台中', En: 'Taichung' },
          ArrivalTime: '08:37',
          DepartureTime: '08:39',
        },
      ],
    };
    const t = toScheduledTrain(realRow);
    expect(t.trainNo).toBe('0108');
    expect(t.direction).toBe(1);
    expect(t.origin.zh).toBe('左營');
    expect(t.destination.zh).toBe('南港');
    expect(t.stops.length).toBe(2);
    expect(typeof t.stops[0].arrivalMs).toBe('number');
    expect(t.stops[1].departureMs).toBeGreaterThan(t.stops[0].arrivalMs);
  });

  it('GETs DailyTimetable/Today and emits ScheduledTrains', () => {
    let received: ReturnType<typeof Object> | undefined;
    service.fetchTodaySchedule().subscribe((s) => (received = s));

    httpMock
      .expectOne((r) => r.url.endsWith('/v2/Rail/THSR/DailyTimetable/Today'))
      .flush([
        {
          TrainDate: '2026-05-04',
          DailyTrainInfo: {
            TrainNo: '0108',
            Direction: 1,
            StartingStationID: '1070',
            StartingStationName: { Zh_tw: '左營', En: 'Zuoying' },
            EndingStationID: '0990',
            EndingStationName: { Zh_tw: '南港', En: 'Nangang' },
          },
          StopTimes: [
            {
              StopSequence: 1,
              StationID: '1070',
              StationName: { Zh_tw: '左營', En: 'Zuoying' },
              ArrivalTime: '07:55',
              DepartureTime: '07:55',
            },
          ],
        },
      ]);

    const arr = received as unknown as Array<{ trainNo: string }>;
    expect(arr.length).toBe(1);
    expect(arr[0].trainNo).toBe('0108');
  });

  it('shares one HTTP call across repeat subscribers (memoised stream)', () => {
    const a = service.fetchTodaySchedule();
    const b = service.fetchTodaySchedule();
    expect(a).toBe(b); // same observable instance
    a.subscribe();
    b.subscribe();
    httpMock
      .expectOne((r) => r.url.endsWith('/v2/Rail/THSR/DailyTimetable/Today'))
      .flush([]);
    // Only one HTTP request issued — verify() in afterEach catches dupes.
  });
});
