/**
 * TDX V2 endpoints sometimes return data wrapped in `{ <Key>: [...] }` and
 * sometimes return a bare array. Be defensive: accept either shape.
 *
 * Used by every feature service that talks to TDX. Living here in `core/tdx`
 * keeps callers from having to invent their own wrapper.
 */
export function unwrapEnvelope<T>(
  payload: unknown,
  key: string
): readonly T[] {
  if (Array.isArray(payload)) {
    return payload as readonly T[];
  }
  if (
    payload &&
    typeof payload === 'object' &&
    key in payload &&
    Array.isArray((payload as Record<string, unknown>)[key])
  ) {
    return (payload as Record<string, readonly T[]>)[key];
  }
  return [];
}
