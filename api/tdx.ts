/**
 * TDX proxy.
 *
 * Routed via `vercel.json` rewrite:
 *   /api/tdx/<anything>  →  /api/tdx?path=<anything>
 *
 * The rewrite-based route avoids `vercel dev`'s bug with nested catch-all
 * filenames (`api/<folder>/[...slug].ts` is registered at build time but
 * not matched at request time). Frontend code keeps calling
 * `/api/tdx/v2/Rail/Metro/Station/TRTC?...` as if it were a normal path.
 *
 * The Client Secret never reaches the browser — token exchange happens
 * server-side via `_lib/tdx-token`.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCached, setCached, ttlForPath } from './_lib/cache';
import { acquireUpstreamToken, noteUpstream429 } from './_lib/scheduler';
import { getAccessToken, TdxTokenError } from './_lib/tdx-token';

const TDX_BASE = 'https://tdx.transportdata.tw/api/basic/';
const RESPONSE_HEADERS_TO_DROP = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Only GET is supported by this proxy' });
    return;
  }

  const rawPath = readPathQuery(req.query['path']);
  if (!rawPath) {
    res.status(400).json({ error: 'Missing TDX path' });
    return;
  }
  const segments = rawPath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    res.status(400).json({ error: 'Empty TDX path' });
    return;
  }

  const upstreamUrl = buildUpstreamUrl(segments, req.query);

  // Serve from cache if a fresh entry exists. The cache key is the full
  // upstream URL so the same path with different query params (e.g.
  // $top / $filter) is treated as a separate cache entry.
  const cached = getCached(upstreamUrl);
  if (cached) {
    res.status(cached.status);
    if (cached.contentType) res.setHeader('Content-Type', cached.contentType);
    res.setHeader('X-Tdx-Cache', 'HIT');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.send(cached.body);
    return;
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    const status = err instanceof TdxTokenError && err.status ? 502 : 500;
    res.status(status).json({
      error: 'Failed to obtain TDX access token',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
    return;
  }

  // Gate every upstream call through the server-side token bucket. Cache
  // hits already returned above, so this only fires when we're actually
  // about to talk to TDX. Without this, multiple browser tabs / Vite HMR
  // reloads can stack up enough concurrent requests to exceed the
  // upstream 5/10s cap, even when each client is well-behaved.
  try {
    await acquireUpstreamToken();
  } catch (err) {
    res.status(503).json({
      error: 'Server-side queue full',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
    return;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    res.status(502).json({
      error: 'Upstream TDX fetch failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
    return;
  }

  // If upstream 429s, freeze the whole queue for a cooldown window so we
  // don't keep hammering and turn a single rejection into a sustained
  // outage. Subsequent requests still succeed via cache, just not via
  // fresh upstream calls.
  if (upstream.status === 429) {
    noteUpstream429();
  }

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (RESPONSE_HEADERS_TO_DROP.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Tdx-Cache', 'MISS');

  const body = Buffer.from(await upstream.arrayBuffer());
  // Only cache 2xx responses; 4xx/5xx are likely transient or auth errors
  // and must not be sticky.
  if (upstream.ok) {
    setCached(
      upstreamUrl,
      {
        status: upstream.status,
        contentType: upstream.headers.get('content-type') ?? undefined,
        body,
      },
      ttlForPath(rawPath)
    );
  }
  res.send(body);
}

function readPathQuery(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw.join('/');
  if (typeof raw === 'string') return raw;
  return '';
}

function buildUpstreamUrl(
  segments: readonly string[],
  query: VercelRequest['query']
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }
  const qs = params.toString();
  const path = segments.map(encodeURIComponent).join('/');
  return `${TDX_BASE}${path}${qs ? `?${qs}` : ''}`;
}
