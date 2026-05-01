import { Injectable } from '@angular/core';

const NAMESPACE = 'taipei-realtime-map';

/**
 * Tiny wrapper around `localStorage` for user preferences. All keys are
 * namespaced so we don't pollute other apps on the same origin. Failures
 * (private mode, quota exceeded, JSON parse) silently fall back to defaults.
 *
 * Used by:
 *   - I18nService → 'locale'
 *   - LayerStateService → 'layerVisibility' (Record<key, boolean>)
 *   - ViewModeService → 'viewMode'
 *   - MapService → 'mapView' ({lng, lat, zoom})
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`${NAMESPACE}.${key}`);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  write(key: string, value: unknown): void {
    try {
      localStorage.setItem(`${NAMESPACE}.${key}`, JSON.stringify(value));
    } catch {
      /* ignore quota / private mode */
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(`${NAMESPACE}.${key}`);
    } catch {
      /* ignore */
    }
  }
}
