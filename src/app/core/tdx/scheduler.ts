import { Injectable, inject } from '@angular/core';
import { Subject, concatMap, delay, of, tap } from 'rxjs';
import { TDX_RATE_LIMIT_DELAY_MS } from './rate-limit';

/**
 * Global token-bucket scheduler for TDX requests.
 *
 * The TDX free tier was observed to allow ~5 requests / 10 seconds *across
 * all endpoints*. Per-feature staggering wasn't enough because realtime
 * polling streams (Metro LiveBoard, Bus A1, YouBike availability) all
 * subscribe early and then fire repeatedly on their own timers, racing
 * each other into the same window.
 *
 * Every request through `TdxBaseService.get` calls `acquire()`. The
 * scheduler releases one waiter every `intervalMs` so the global rate
 * stays comfortably under the upstream cap. Server-side cache hits are
 * still gated (we can't tell client-side whether the proxy will hit
 * cache) but those return in <50ms so the throttle is still cheap.
 *
 * The token interval is derived from the rate-limit delay (11s default)
 * divided by 3 → ~3.67s per token → ~2.7 reqs / 10s. The earlier /4 setting
 * still occasionally tripped 429 on cold-start because TDX appears to use a
 * sliding window (not a strict 10-second bucket), so we keep more headroom.
 * Tests inject `TDX_RATE_LIMIT_DELAY_MS=0` and get an effectively
 * unthrottled scheduler.
 */
@Injectable({ providedIn: 'root' })
export class TdxScheduler {
  private readonly minDelayMs = inject(TDX_RATE_LIMIT_DELAY_MS);
  private readonly intervalMs = Math.max(0, Math.floor(this.minDelayMs / 3));
  private readonly waiters = new Subject<() => void>();

  constructor() {
    this.waiters
      .pipe(
        concatMap((release) =>
          of(null).pipe(
            tap(() => release()),
            // Wait *after* releasing so the next waiter is held until the
            // previous request is in flight. Server-side latency adds a few
            // hundred ms; combined this stays well under 5 reqs / 10s.
            delay(this.intervalMs)
          )
        )
      )
      .subscribe();
  }

  /**
   * Resolves when the caller may safely make a TDX request. Callers should
   * await this exactly once per outgoing request.
   */
  acquire(): Promise<void> {
    if (this.intervalMs === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.waiters.next(resolve));
  }
}
