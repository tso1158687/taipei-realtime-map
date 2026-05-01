/**
 * In-memory response cache for the TDX proxy.
 *
 * Lives across invocations within the same warm Vercel function instance.
 * The free TDX tier has aggressive rate limits (~5 requests / 10 seconds
 * observed), so caching static endpoints aggressively is the primary
 * defense.
 *
 * The cache is intentionally simple:
 *   - keyed by upstream URL
 *   - TTL chosen by path pattern (static metro = 1 hour, realtime = 5s)
 *   - rough size cap with FIFO-ish eviction to prevent unbounded growth
 *
 * If we ever need cross-instance sharing, swap this for Vercel KV or
 * Upstash Redis behind the same get/set interface.
 */

const MAX_ENTRIES = 1000;

export interface CachedResponse {
  readonly status: number;
  readonly contentType: string | undefined;
  readonly body: Buffer;
  readonly expiresAt: number;
}

const store = new Map<string, CachedResponse>();

export function getCached(key: string): CachedResponse | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function setCached(
  key: string,
  payload: Omit<CachedResponse, 'expiresAt'>,
  ttlMs: number
): void {
  if (store.size >= MAX_ENTRIES) {
    // FIFO-ish eviction: oldest insertion order is iterated first.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { ...payload, expiresAt: Date.now() + ttlMs });
}

const REALTIME_TTL_MS = 5 * 1000;
const STATIC_TTL_MS = 60 * 60 * 1000; // 1 hour

const REALTIME_PATH_PATTERNS: readonly RegExp[] = [
  /\/LiveBoard\b/i,
  /\/TrainLiveBoard\b/i,
  /\/RealTime\b/i,
  /\/RTNT\b/i,
  /\/PlateInfo\b/i,
];

/**
 * Choose a TTL based on the request path. Realtime endpoints get a tiny
 * TTL so we still avoid duplicate concurrent requests but don't serve
 * stale positions; everything else (static rail / metro / bus reference
 * data) is cached for an hour.
 */
export function ttlForPath(path: string): number {
  for (const pattern of REALTIME_PATH_PATTERNS) {
    if (pattern.test(path)) return REALTIME_TTL_MS;
  }
  return STATIC_TTL_MS;
}

/** Test-only helper. */
export function _clearCacheForTesting(): void {
  store.clear();
}
