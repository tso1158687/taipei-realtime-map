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
