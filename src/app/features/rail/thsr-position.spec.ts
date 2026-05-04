import { combineDateTime, inferAllPositions, inferPosition } from './thsr-position';
import type { ThsrScheduledTrain } from './thsr-timetable.types';

describe('combineDateTime', () => {
  it('combines YYYY-MM-DD + HH:MM into a local-time epoch ms', () => {
    const t = combineDateTime('2026-05-04', '07:55');
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May = month 4
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(55);
  });

  it('returns NaN for malformed inputs', () => {
    expect(Number.isNaN(combineDateTime('bad', '07:55'))).toBe(true);
    expect(Number.isNaN(combineDateTime('2026-05-04', 'bad'))).toBe(true);
  });
});

describe('inferPosition', () => {
  // Build a tiny synthetic schedule: train 0108 stops at 3 stations.
  //   1070 (左營)        arr 07:55 dep 07:55
  //   1040 (台中)        arr 08:37 dep 08:39
  //   1010 (板橋)        arr 09:11 dep 09:13
  // (We use minute precision; combineDateTime gives us epoch ms.)
  function makeTrain(): ThsrScheduledTrain {
    const date = '2026-05-04';
    return {
      trainNo: '0108',
      direction: 1,
      origin: { zh: '左營', en: 'Zuoying' },
      destination: { zh: '南港', en: 'Nangang' },
      stops: [
        {
          sequence: 1,
          stationId: '1070',
          arrivalMs: combineDateTime(date, '07:55'),
          departureMs: combineDateTime(date, '07:55'),
        },
        {
          sequence: 2,
          stationId: '1040',
          arrivalMs: combineDateTime(date, '08:37'),
          departureMs: combineDateTime(date, '08:39'),
        },
        {
          sequence: 3,
          stationId: '1010',
          arrivalMs: combineDateTime(date, '09:11'),
          departureMs: combineDateTime(date, '09:13'),
        },
      ],
    };
  }

  const coords = new Map([
    ['1070', { lat: 22.687, lng: 120.308 }], // 左營
    ['1040', { lat: 24.111, lng: 120.616 }], // 台中
    ['1010', { lat: 25.014, lng: 121.464 }], // 板橋
  ]);

  it('returns null before the train starts running', () => {
    const train = makeTrain();
    const before = combineDateTime('2026-05-04', '07:00');
    expect(inferPosition(train, before, coords)).toBeNull();
  });

  it('returns null after the train has finished', () => {
    const train = makeTrain();
    const after = combineDateTime('2026-05-04', '10:00');
    expect(inferPosition(train, after, coords)).toBeNull();
  });

  it('flags atStation while dwelling at a stop', () => {
    const train = makeTrain();
    // At 08:38 the train is dwelling at Taichung (1040) [08:37 - 08:39]
    const t = combineDateTime('2026-05-04', '08:38');
    const p = inferPosition(train, t, coords);
    expect(p).not.toBeNull();
    expect(p!.atStation).toBe(true);
    expect(p!.nearestStationId).toBe('1040');
    expect(p!.position).toEqual({ lat: 24.111, lng: 120.616 });
  });

  it('linearly interpolates between stops while en route', () => {
    const train = makeTrain();
    // 08:39 dep Taichung, 09:11 arr Banqiao = 32 minute span. At 08:55 we're
    // (08:55 - 08:39) / 32 = 16/32 = 0.5 — half way.
    const t = combineDateTime('2026-05-04', '08:55');
    const p = inferPosition(train, t, coords);
    expect(p).not.toBeNull();
    expect(p!.atStation).toBe(false);
    expect(p!.progress).toBeCloseTo(0.5, 2);
    // halfway between (24.111, 120.616) and (25.014, 121.464)
    expect(p!.position.lat).toBeCloseTo((24.111 + 25.014) / 2, 4);
    expect(p!.position.lng).toBeCloseTo((120.616 + 121.464) / 2, 4);
  });

  it('omits trains whose stations are not in the coords map', () => {
    const train = makeTrain();
    const incompleteCoords = new Map([['1070', { lat: 22.687, lng: 120.308 }]]);
    // At 08:55 (between 1040 → 1010) — neither in map → null
    const t = combineDateTime('2026-05-04', '08:55');
    expect(inferPosition(train, t, incompleteCoords)).toBeNull();
  });
});

describe('inferAllPositions', () => {
  it('returns positions only for trains that are currently running', () => {
    const date = '2026-05-04';
    const future: ThsrScheduledTrain = {
      trainNo: 'FUTURE',
      direction: 1,
      origin: { zh: '甲', en: 'A' },
      destination: { zh: '乙', en: 'B' },
      stops: [
        { sequence: 1, stationId: 'A', arrivalMs: combineDateTime(date, '23:00'), departureMs: combineDateTime(date, '23:00') },
        { sequence: 2, stationId: 'B', arrivalMs: combineDateTime(date, '23:30'), departureMs: combineDateTime(date, '23:30') },
      ],
    };
    const past: ThsrScheduledTrain = {
      trainNo: 'PAST',
      direction: 0,
      origin: { zh: '甲', en: 'A' },
      destination: { zh: '乙', en: 'B' },
      stops: [
        { sequence: 1, stationId: 'A', arrivalMs: combineDateTime(date, '06:00'), departureMs: combineDateTime(date, '06:00') },
        { sequence: 2, stationId: 'B', arrivalMs: combineDateTime(date, '06:30'), departureMs: combineDateTime(date, '06:30') },
      ],
    };
    const now: ThsrScheduledTrain = {
      trainNo: 'NOW',
      direction: 1,
      origin: { zh: '甲', en: 'A' },
      destination: { zh: '乙', en: 'B' },
      stops: [
        { sequence: 1, stationId: 'A', arrivalMs: combineDateTime(date, '12:00'), departureMs: combineDateTime(date, '12:00') },
        { sequence: 2, stationId: 'B', arrivalMs: combineDateTime(date, '13:00'), departureMs: combineDateTime(date, '13:00') },
      ],
    };
    const coords = new Map([
      ['A', { lat: 25, lng: 121 }],
      ['B', { lat: 24, lng: 120 }],
    ]);
    const t = combineDateTime(date, '12:30');
    const out = inferAllPositions([future, past, now], t, coords);
    expect(out.length).toBe(1);
    expect(out[0].trainNo).toBe('NOW');
  });
});
