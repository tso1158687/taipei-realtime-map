import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { TdxBaseService } from '../../core/tdx';
import { combineDateTime } from './thsr-position';
import type {
  TdxThsrDailyTimetableRow,
  ThsrScheduledTrain,
} from './thsr-timetable.types';

/**
 * Loads today's THSR timetable from TDX and exposes it as `ThsrScheduledTrain[]`.
 *
 * The endpoint returns ~250 rows (one per train) and each row is fairly
 * compact (~1 KB), so the whole payload fits comfortably in localStorage.
 * The TdxClientCache will keep it for 24 h — practically the timetable
 * changes only when THSR publishes a new schedule version, so a daily
 * fetch is plenty.
 */
@Injectable({ providedIn: 'root' })
export class ThsrTimetableService {
  private readonly tdx = inject(TdxBaseService);

  private cached: Observable<readonly ThsrScheduledTrain[]> | null = null;

  /**
   * Today's full schedule, mapped to the internal `ThsrScheduledTrain`
   * shape. Memoised so repeated subscribers (UI tick + tracking + popup)
   * share one HTTP call. The underlying TdxBaseService also caches the
   * raw response in localStorage for 24 h.
   */
  fetchTodaySchedule(): Observable<readonly ThsrScheduledTrain[]> {
    if (!this.cached) {
      this.cached = this.tdx
        .get<readonly TdxThsrDailyTimetableRow[]>(
          'v2/Rail/THSR/DailyTimetable/Today'
        )
        .pipe(
          map((rows) => rows.map(toScheduledTrain)),
          shareReplay({ bufferSize: 1, refCount: false })
        );
    }
    return this.cached;
  }
}

export function toScheduledTrain(
  row: TdxThsrDailyTimetableRow
): ThsrScheduledTrain {
  const stops = row.StopTimes.map((s) => ({
    sequence: s.StopSequence,
    stationId: s.StationID,
    arrivalMs: combineDateTime(row.TrainDate, s.ArrivalTime),
    departureMs: combineDateTime(row.TrainDate, s.DepartureTime),
  }));
  return {
    trainNo: row.DailyTrainInfo.TrainNo,
    direction: row.DailyTrainInfo.Direction,
    origin: {
      zh: row.DailyTrainInfo.StartingStationName.Zh_tw,
      en: row.DailyTrainInfo.StartingStationName.En,
    },
    destination: {
      zh: row.DailyTrainInfo.EndingStationName.Zh_tw,
      en: row.DailyTrainInfo.EndingStationName.En,
    },
    stops,
  };
}
