/**
 * Server-side token-bucket scheduler for TDX upstream requests.
 *
 * Why server-side
 * ---------------
 * The Angular client also has a TdxScheduler, but in dev mode (Vite HMR /
 * multiple browser tabs / route reloads) Angular's root injector can be
 * reinstantiated, producing multiple TdxScheduler instances that each
 * release their own tokens. The result is bursts that exceed the upstream
 * 5 reqs / 10s cap and trip 429 storms.
 *
 * The Vercel function (or local `vercel dev` worker) is a single Node
 * process per warm instance, so a module-level token bucket here is the
 * one authoritative gate. Every upstream `fetch()` waits on
 * `acquireUpstreamToken()` before going out.
 *
 * Cache hits do NOT call acquire — they short-circuit before this is ever
 * reached, so cached responses stay fast.
 *
 * Tunables
 * --------
 * - `MIN_INTERVAL_MS`: time between two consecutive upstream tokens. Set
 *   slightly under 1/2 the upstream window so we leave headroom for one
 *   parallel slot. 2500ms ≈ 4 reqs / 10s — under the observed 5/10s cap.
 * - `MAX_QUEUE`: hard cap on waiting requests; beyond this we fast-fail
 *   to avoid unbounded memory growth from a runaway client.
 * - `COOLDOWN_AFTER_429_MS`: when upstream returns 429 we hold *all*
 *   outgoing requests for this window so we don't dig the hole deeper.
 */

const MIN_INTERVAL_MS = 2500;
const MAX_QUEUE = 50;
const COOLDOWN_AFTER_429_MS = 10_000;

let lastReleaseAt = 0;
let cooldownUntil = 0;
const queue: Array<() => void> = [];
let pumpScheduled = false;

function pump(): void {
  pumpScheduled = false;
  if (queue.length === 0) return;
  const now = Date.now();
  const earliest = Math.max(lastReleaseAt + MIN_INTERVAL_MS, cooldownUntil);
  if (now >= earliest) {
    const release = queue.shift();
    if (release) {
      lastReleaseAt = now;
      release();
    }
    if (queue.length > 0 && !pumpScheduled) {
      pumpScheduled = true;
      setTimeout(pump, MIN_INTERVAL_MS);
    }
    return;
  }
  if (!pumpScheduled) {
    pumpScheduled = true;
    setTimeout(pump, earliest - now);
  }
}

/**
 * Resolves when the caller may safely make an upstream TDX request. Each
 * caller waits its turn so the global rate stays under the upstream cap.
 *
 * Throws if the queue exceeds `MAX_QUEUE` so a runaway client doesn't pile
 * up indefinitely.
 */
export function acquireUpstreamToken(): Promise<void> {
  if (queue.length >= MAX_QUEUE) {
    return Promise.reject(
      new Error(`Upstream queue full (>${MAX_QUEUE}); refusing request`)
    );
  }
  return new Promise<void>((resolve) => {
    queue.push(resolve);
    if (!pumpScheduled) {
      pumpScheduled = true;
      // Schedule immediately; pump() decides whether to release now or wait.
      setTimeout(pump, 0);
    }
  });
}

/**
 * Called when upstream returns 429. Holds all subsequent requests for
 * `COOLDOWN_AFTER_429_MS` so we don't keep hammering an already-throttled
 * upstream — that often turns a brief blip into a much longer outage.
 */
export function noteUpstream429(): void {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + COOLDOWN_AFTER_429_MS);
}

/** Test-only helpers. */
export function _resetSchedulerForTesting(): void {
  lastReleaseAt = 0;
  cooldownUntil = 0;
  queue.length = 0;
  pumpScheduled = false;
}

export function _schedulerStateForTesting(): {
  queueLength: number;
  lastReleaseAt: number;
  cooldownUntil: number;
} {
  return { queueLength: queue.length, lastReleaseAt, cooldownUntil };
}
