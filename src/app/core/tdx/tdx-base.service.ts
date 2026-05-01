import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, defer, from, mergeMap, retry, timer } from 'rxjs';
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
 */
@Injectable({ providedIn: 'root' })
export class TdxBaseService {
  private readonly http = inject(HttpClient);
  private readonly scheduler = inject(TdxScheduler);
  private readonly basePath = '/api/tdx';
  private readonly retryDelayMs = inject(TDX_RATE_LIMIT_DELAY_MS);

  /**
   * Issue a GET against the TDX proxy.
   *
   * @param path TDX path (no leading slash needed; one is allowed and stripped)
   * @param query Optional query params; null/undefined are dropped.
   *              `$format=JSON` is appended automatically when not present.
   *
   * On HTTP 429 (rate limit) the request is retried up to 3 times with the
   * configured delay between attempts. Other errors propagate immediately.
   */
  get<T>(path: string, query: TdxQueryParams = {}): Observable<T> {
    const cleanPath = path.replace(/^\/+/, '');
    const params = this.toHttpParams(query);
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
}
