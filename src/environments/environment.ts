/**
 * Frontend environment config.
 *
 * Tracked in git as a placeholder. To use MapTiler vector tiles set
 * `maptilerKey` to your free key from https://cloud.maptiler.com/.
 * When empty, the app falls back to OSM raster tiles (no key required,
 * but limited styles + no 3D buildings).
 *
 * For local dev override without committing: copy this file to
 * `environment.local.ts` (gitignored), and the build will pick it up via
 * angular.json fileReplacements (configure if you need it; not on by
 * default to keep the scaffold minimal).
 */
export const environment = {
  /** MapTiler Cloud API key. Empty = use OSM raster fallback. */
  maptilerKey: '',
  /** MapTiler style id; only used when maptilerKey is set. */
  maptilerStyle: 'streets-v2',
} as const;
