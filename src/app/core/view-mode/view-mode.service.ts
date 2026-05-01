import { Injectable, inject, signal } from '@angular/core';
import { PreferencesService } from '../preferences';

export type ViewMode = 'default' | 'underground';

const PREFS_KEY = 'viewMode';

/**
 * Global view-mode signal. `'underground'` darkens the OSM base tiles and
 * raises rail/metro line opacity so subway / underground tracks stand out.
 *
 * Without vector tiles (we use OSM raster — see ROADMAP) we can't make
 * buildings translucent or per-segment underground rendering, so the
 * effect is purely a contrast trick. Phase 8 with MapTiler vector tiles
 * could implement true zone-based underground.
 */
@Injectable({ providedIn: 'root' })
export class ViewModeService {
  private readonly prefs = inject(PreferencesService);
  private readonly _mode = signal<ViewMode>(
    this.prefs.read<ViewMode>(PREFS_KEY, 'default')
  );
  readonly mode = this._mode.asReadonly();

  toggle(): void {
    this._mode.update((m) => (m === 'default' ? 'underground' : 'default'));
    this.prefs.write(PREFS_KEY, this._mode());
  }

  set(mode: ViewMode): void {
    this._mode.set(mode);
    this.prefs.write(PREFS_KEY, mode);
  }
}
