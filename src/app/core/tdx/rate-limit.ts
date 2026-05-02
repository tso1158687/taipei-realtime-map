import { InjectionToken } from '@angular/core';

/**
 * Default delay between sequential TDX requests issued by a feature module.
 *
 * The TDX free tier was observed to limit ~5 requests / 10 seconds. Each
 * feature (Metro, Bus, Rail …) sequences its operators / cities with this
 * delay to stay under the limit on cold starts. Server-side cache means
 * subsequent visits don't pay the delay.
 *
 * 11 seconds is 1 second over the observed 10-second window for safety.
 */
export const TDX_RATE_LIMIT_DELAY_MS_DEFAULT = 11_000;

export const TDX_RATE_LIMIT_DELAY_MS = new InjectionToken<number>(
  'TDX_RATE_LIMIT_DELAY_MS',
  { providedIn: 'root', factory: () => TDX_RATE_LIMIT_DELAY_MS_DEFAULT }
);

/**
 * How long realtime streams (LiveBoard / Bus realtime / YouBike Availability /
 * TRA TrainLiveBoard) wait before issuing their first request.
 *
 * Cold-start fires ~25 static requests across all features. At ~3.7s/request
 * via the global scheduler that drains in roughly 90 seconds. If realtime
 * streams kick off immediately at `timer(0, ...)` they compete for the same
 * tokens and stretch the cold-start window even longer (and have historically
 * tripped 429 storms). Holding realtime polling for 15 seconds lets the
 * static burst go first; users see stations & lines before vehicle markers
 * start populating, which is the desired UX anyway.
 *
 * Tests inject `0` to keep things synchronous.
 */
export const REALTIME_WARMUP_DELAY_MS = new InjectionToken<number>(
  'REALTIME_WARMUP_DELAY_MS',
  { providedIn: 'root', factory: () => 15_000 }
);
