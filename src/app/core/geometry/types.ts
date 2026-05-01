/**
 * Shared geometry types for internal app models.
 *
 * Avoid importing GeoJSON types from `@types/geojson` for internal models —
 * this codebase has its own narrower shape that captures exactly what
 * MapLibre needs (no z-coordinates, no measure values, readonly arrays).
 */

export type LineGeometry =
  | {
      readonly type: 'LineString';
      readonly coordinates: ReadonlyArray<readonly [number, number]>;
    }
  | {
      readonly type: 'MultiLineString';
      readonly coordinates: ReadonlyArray<
        ReadonlyArray<readonly [number, number]>
      >;
    };
