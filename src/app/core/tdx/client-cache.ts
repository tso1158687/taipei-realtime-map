import { Injectable } from '@angular/core';

/**
 * Client-side persistent cache for static TDX responses (站點 / 路線 / Shape /
 * 月台等鮮少更動的資料).
 *
 * Why this exists
 * ---------------
 * The server-side proxy already caches in-memory per warm Vercel instance, but:
 *   1. cold starts re-fetch upstream
 *   2. local `vercel dev` re-fetches on every restart
 *   3. browser refresh forces *every* layer to ask again, even though the data
 *      is identical to what we had 5 minutes ago
 *
 * Caching the static endpoints in `localStorage` for a day means the cold-start
 * burst on page load drops to **just the realtime endpoints** (LiveBoard / Bus
 * RealTime / YouBike Availability / TRA TrainLiveBoard / etc.), which trivially
 * fits under the 5 reqs / 10s free-tier cap.
 *
 * Cache key includes a version prefix so a deploy that changes the shape of
 * stored data can simply bump `STORAGE_VERSION` to invalidate every entry.
 */
@Injectable({ providedIn: 'root' })
export class TdxClientCache {
  private readonly STORAGE_VERSION = 'v1';
  private readonly STORAGE_PREFIX = `tdx-cache-${this.STORAGE_VERSION}:`;
  /**
   * 24 hours. Static data on TDX (transit station coords, route shapes,
   * line metadata) changes maybe once a year — a day is conservative and
   * gives us protection across normal daily browser sessions while still
   * picking up the rare update within reasonable latency.
   */
  private readonly STATIC_TTL_MS = 24 * 60 * 60 * 1000;

  /**
   * Per-entry size cap. Bus StopOfRoute can hit 2 MB per city; trying to
   * fit 4 of them × 2 MB into a 5 MB localStorage budget triggers quota
   * cascades. We skip oversized entries entirely on the client and let
   * them fall back to the server cache (1 h TTL there).
   */
  private readonly MAX_ENTRY_BYTES = 1_000_000;

  /**
   * Endpoints that change frequently (real-time vehicle positions, ETAs,
   * availability counts). We always go to network for these — caching even
   * for a few seconds creates very confusing UX (a YouBike station shows
   * 5 bikes when there are actually 0).
   *
   * Patterns mirror `api/_lib/cache.ts#REALTIME_PATH_PATTERNS` so the
   * server and client agree on what's "live" data.
   */
  private readonly REALTIME_PATH_PATTERNS: readonly RegExp[] = [
    /\/LiveBoard\b/i,
    /\/TrainLiveBoard\b/i,
    // No trailing \b — actual paths look like `RealTimeByFrequency` and
    // `RealTimeNearStop`, where the next char (B / N) is a word char so a
    // word boundary would never match.
    /\/RealTime/i,
    /\/RTNT\b/i,
    /\/PlateInfo\b/i,
    /\/EstimatedTimeOfArrival\b/i,
    /\/Availability\b/i,
  ];

  /**
   * `true` if a successful response for this path should be persisted and
   * served on the next `get()` for the same key. Real-time endpoints always
   * return `false`.
   */
  isCacheable(path: string): boolean {
    return !this.REALTIME_PATH_PATTERNS.some((re) => re.test(path));
  }

  /**
   * Read a cached entry. Returns `null` on miss, expired, parse error,
   * or when localStorage is unavailable (e.g. SSR / privacy mode).
   */
  get<T>(key: string): T | null {
    const storage = this.storage;
    if (!storage) return null;
    try {
      const raw = storage.getItem(this.STORAGE_PREFIX + key);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as { data: T; expiresAt: number };
      if (typeof parsed?.expiresAt !== 'number' || parsed.expiresAt < Date.now()) {
        storage.removeItem(this.STORAGE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  /**
   * Persist an entry with a 24h TTL.
   *
   * Two safety rails:
   *   1. **Skip oversized entries**: Bus StopOfRoute is 2 MB+ per city.
   *      Trying to keep 4 of those evicts everything else. Dropping it
   *      client-side is fine — server has it cached for an hour.
   *   2. **Never clear-and-retry on quota**: the previous implementation
   *      called `clear()` (wipes every cached entry under our prefix) and
   *      re-tried, so a single oversized write would erase 20 small ones
   *      we already had. Now we just no-op the failing write and leave
   *      existing entries intact.
   */
  set<T>(key: string, data: T): void {
    const storage = this.storage;
    if (!storage) return;
    const entry = JSON.stringify({
      data,
      expiresAt: Date.now() + this.STATIC_TTL_MS,
    });
    if (entry.length > this.MAX_ENTRY_BYTES) return;
    try {
      storage.setItem(this.STORAGE_PREFIX + key, entry);
    } catch {
      /* Quota exceeded or storage disabled — skip silently, do NOT clear. */
    }
  }

  /** Drop every entry written by this cache. */
  clear(): void {
    const storage = this.storage;
    if (!storage) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(this.STORAGE_PREFIX)) keysToRemove.push(k);
    }
    for (const k of keysToRemove) storage.removeItem(k);
  }

  private get storage(): Storage | null {
    try {
      if (typeof window === 'undefined') return null;
      return window.localStorage;
    } catch {
      return null;
    }
  }
}
