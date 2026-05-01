/**
 * Health check endpoint.
 *
 * GET /api/health
 *   - Verifies that TDX credentials are configured.
 *   - Attempts a token exchange to confirm credentials are valid.
 *   - Never returns the access token itself.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAccessToken } from './_lib/tdx-token';

interface HealthResponse {
  readonly ok: boolean;
  readonly hasCredentials: boolean;
  readonly tokenAcquired?: boolean;
  readonly tokenLength?: number;
  readonly error?: string;
  readonly timestamp: string;
}

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const hasCredentials = Boolean(
    process.env['TDX_CLIENT_ID'] && process.env['TDX_CLIENT_SECRET']
  );
  const timestamp = new Date().toISOString();

  if (!hasCredentials) {
    const payload: HealthResponse = {
      ok: false,
      hasCredentials: false,
      error: 'TDX_CLIENT_ID and/or TDX_CLIENT_SECRET are not set',
      timestamp,
    };
    res.status(503).json(payload);
    return;
  }

  try {
    const token = await getAccessToken();
    const payload: HealthResponse = {
      ok: true,
      hasCredentials: true,
      tokenAcquired: true,
      tokenLength: token.length,
      timestamp,
    };
    res.status(200).json(payload);
  } catch (err) {
    const payload: HealthResponse = {
      ok: false,
      hasCredentials: true,
      tokenAcquired: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      timestamp,
    };
    res.status(502).json(payload);
  }
}
