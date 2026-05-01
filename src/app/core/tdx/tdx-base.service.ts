import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

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
  private readonly basePath = '/api/tdx';

  /**
   * Issue a GET against the TDX proxy.
   *
   * @param path TDX path (no leading slash needed; one is allowed and stripped)
   * @param query Optional query params; null/undefined are dropped.
   *              `$format=JSON` is appended automatically when not present.
   */
  get<T>(path: string, query: TdxQueryParams = {}): Observable<T> {
    const cleanPath = path.replace(/^\/+/, '');
    const params = this.toHttpParams(query);
    return this.http.get<T>(`${this.basePath}/${cleanPath}`, { params });
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
