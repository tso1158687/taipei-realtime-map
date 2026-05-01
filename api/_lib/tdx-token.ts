/**
 * TDX OIDC Client Credentials token helper.
 *
 * Server-side only. Caches access tokens in module-level memory across
 * invocations within the same warm Vercel function instance, refreshing
 * 30 seconds before expiry to avoid borderline expiries during a request.
 *
 * Reference: https://tdx.transportdata.tw/
 *
 * This file lives under `api/_lib/` because Vercel excludes any file or
 * directory whose name starts with an underscore from automatic Function
 * routing — exactly what we want for shared helpers.
 */

const TDX_TOKEN_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

const REFRESH_BUFFER_MS = 30_000;

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly token_type: string;
}

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

export class TdxTokenError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'TdxTokenError';
  }
}

/**
 * Returns a valid TDX access token, fetching a new one when the cached
 * token is missing or about to expire. Concurrent callers share a single
 * in-flight request to avoid hammering the auth server.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + REFRESH_BUFFER_MS) {
    return cached.accessToken;
  }
  if (inflight) {
    return inflight;
  }
  inflight = exchangeToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function exchangeToken(): Promise<string> {
  const clientId = process.env['TDX_CLIENT_ID'];
  const clientSecret = process.env['TDX_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new TdxTokenError(
      'Missing TDX_CLIENT_ID or TDX_CLIENT_SECRET environment variables'
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TDX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await safeReadText(response);
    throw new TdxTokenError(
      `TDX token exchange failed: ${response.status} ${response.statusText} — ${text}`,
      response.status
    );
  }

  const json = (await response.json()) as TokenResponse;
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cached.accessToken;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<no body>';
  }
}

/** Test-only helper. Resets the in-memory cache and any in-flight request. */
export function _resetTokenCacheForTesting(): void {
  cached = null;
  inflight = null;
}
