import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, defer, from, mergeMap, of, retry, tap, timer } from 'rxjs';
import { TdxClientCache } from './client-cache';
import { TDX_RATE_LIMIT_DELAY_MS } from './rate-limit';
import { TdxScheduler } from './scheduler';

/**
 * Acceptable query value types for TDX endpoints. `null`/`undefined` entries
 * are stripped before the request is built.
 */
export type TdxQueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Base service for calling the TDX serverless proxy at `/api/tdx/*`.
 *
 * The browser only ever talks to its own origin; the Vercel function attaches
 * the OIDC Bearer token server-side. Never put TDX Client ID or Secret on
 * the client.
 *
 * Endpoint paths follow the upstream TDX shape, e.g.
 *   `v3/Rail/Metro/Network/TRTC` → `/api/tdx/v3/Rail/Metro/Network/TRTC`
 *
 * Request flow:
 *   1. Static endpoints first try `TdxClientCache` (localStorage, 24h TTL).
 *      A hit short-circuits — no scheduler, no http.
 *   2. Otherwise gate through the global `TdxScheduler` to stay under the
 *      5 reqs / 10s upstream cap.
 *   3. On success, static responses are persisted for the next session.
 */
@Injectable({ providedIn: 'root' })
export class TdxBaseService {
  private readonly http = inject(HttpClient);
  private readonly scheduler = inject(TdxScheduler);
  private readonly cache = inject(TdxClientCache);
  private readonly basePath = '/api/tdx';
  private readonly retryDelayMs = inject(TDX_RATE_LIMIT_DELAY_MS);

  /**
   * Issue a GET against the TDX proxy.
   *
   * @param path TDX path (no leading slash needed; one is allowed and stripped)
   * @param query Optional query params; null/undefined are dropped.
   *              `$format=JSON` is appended automatically when not present.
   *
   * Static endpoints (Station / Route / Shape / Line / StopOfRoute …) are
   * read-through cached in localStorage for 24h. Realtime endpoints
   * (LiveBoard / RealTime / Availability / etc.) bypass the cache.
   */
  get<T>(path: string, query: TdxQueryParams = {}): Observable<T> {
    const cleanPath = path.replace(/^\/+/, '');
    const params = this.toHttpParams(query);
    const cacheable = this.cache.isCacheable(cleanPath);
    const cacheKey = cacheable ? this.buildCacheKey(cleanPath, params) : null;

    // Cache hit: bypass scheduler AND http entirely.
    if (cacheKey !== null) {
      const hit = this.cache.get<T>(cacheKey);
      if (hit !== null) return of(hit);
    }

    const httpCall = () =>
      this.http.get<T>(`${this.basePath}/${cleanPath}`, { params }).pipe(
        retry({
          count: 1,
          delay: (err) => {
            if (err instanceof HttpErrorResponse && err.status === 429) {
              return timer(this.retryDelayMs);
            }
            throw err;
          },
        }),
        tap((data) => {
          if (cacheKey !== null) this.cache.set(cacheKey, data);
        })
      );

    // When the rate-limit delay is 0 (test environment) skip the scheduler
    // entirely so HttpTestingController sees the request synchronously —
    // wrapping in defer + Promise pushes the http.get into a microtask and
    // breaks dozens of httpMock.expectOne calls.
    if (this.retryDelayMs === 0) return httpCall();
    // Otherwise: gate on the global TdxScheduler so the combined output of
    // every feature stays under the 5 reqs / 10s upstream cap.
    return defer(() => from(this.scheduler.acquire())).pipe(
      mergeMap(() => httpCall())
    );
  }

  private toHttpParams(query: TdxQueryParams): HttpParams {
    let params = new HttpParams();
    if (!Object.prototype.hasOwnProperty.call(query, '$format')) {
      params = params.set('$format', 'JSON');
    }
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      params = params.set(key, String(value));
    }
    return params;
  }

  /**
   * Cache key = path + sorted query params. Sorting guarantees that the
   * same request with parameters in different orders maps to the same
   * cache entry.
   */
  private buildCacheKey(path: string, params: HttpParams): string {
    const keys = params.keys().slice().sort();
    const serialized = keys
      .map((k) => `${k}=${params.get(k) ?? ''}`)
      .join('&');
    return `${path}?${serialized}`;
  }
}
