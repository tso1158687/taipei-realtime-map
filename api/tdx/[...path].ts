/**
 * TDX catch-all proxy.
 *
 * Forwards GET requests under `/api/tdx/<...>` to the TDX upstream
 * (`https://tdx.transportdata.tw/api/<...>`), attaching a server-side
 * Bearer token. The TDX Client Secret never reaches the browser.
 *
 * Example:
 *   GET /api/tdx/v3/Rail/Metro/Network/TRTC?$top=10
 *     -> https://tdx.transportdata.tw/api/v3/Rail/Metro/Network/TRTC?$top=10
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAccessToken, TdxTokenError } from './_token';

const TDX_BASE = 'https://tdx.transportdata.tw/api/';
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

  const pathSegments = collectPathSegments(req.query['path']);
  if (pathSegments.length === 0) {
    res.status(400).json({ error: 'Missing TDX path' });
    return;
  }

  const upstreamUrl = buildUpstreamUrl(pathSegments, req.query);

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

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (RESPONSE_HEADERS_TO_DROP.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  const body = Buffer.from(await upstream.arrayBuffer());
  res.send(body);
}

function collectPathSegments(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) return raw.filter((s) => s.length > 0);
  if (typeof raw === 'string' && raw.length > 0) return [raw];
  return [];
}

function buildUpstreamUrl(
  pathSegments: readonly string[],
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
  const path = pathSegments.map(encodeURIComponent).join('/');
  return `${TDX_BASE}${path}${qs ? `?${qs}` : ''}`;
}
