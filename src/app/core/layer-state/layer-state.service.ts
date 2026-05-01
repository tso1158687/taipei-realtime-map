import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { PreferencesService } from '../preferences';

const PREFS_KEY = 'layerVisibility';

/**
 * Lifecycle state of a registered layer.
 *   - 'idle'    : registered but no fetch attempted yet
 *   - 'loading' : a fetch is in-flight (or queued, e.g. waiting on rate limit)
 *   - 'loaded'  : last fetch succeeded
 *   - 'error'   : last fetch failed; check `errorMessage`
 */
export type LayerStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface LayerInfo {
  /** Stable identifier, e.g. 'metro.TRTC'. */
  readonly key: string;
  /** Bilingual display label rendered by the control panel. */
  readonly label: { readonly zh: string; readonly en: string };
  readonly visible: boolean;
  readonly status: LayerStatus;
  readonly errorMessage?: string;
}

export interface RegisterOptions {
  readonly initialVisible?: boolean;
}

/**
 * Central registry of map layers exposed to the user.
 *
 * Each feature (Metro, Bus, Rail …) calls `register` once it knows what
 * layers it owns; the control panel reads the resulting signal to render a
 * toggle list. Visibility flips and status updates are pushed back through
 * this service, so feature components stay decoupled from the UI panel.
 */
@Injectable({ providedIn: 'root' })
export class LayerStateService {
  private readonly prefs = inject(PreferencesService);
  private readonly _layers = signal<readonly LayerInfo[]>([]);
  private readonly storedVisibility: Record<string, boolean> = this.prefs.read(
    PREFS_KEY,
    {}
  );

  readonly layers = this._layers.asReadonly();

  /**
   * Register a layer. No-op if the key already exists, so feature components
   * can call it from constructors without worrying about HMR re-runs. If a
   * stored visibility preference exists for the key, it overrides
   * `options.initialVisible`.
   */
  register(
    key: string,
    label: { readonly zh: string; readonly en: string },
    options: RegisterOptions = {}
  ): void {
    if (this._layers().some((l) => l.key === key)) return;
    const stored = this.storedVisibility[key];
    const entry: LayerInfo = {
      key,
      label,
      visible: stored ?? options.initialVisible ?? true,
      status: 'idle',
    };
    this._layers.update((arr) => [...arr, entry]);
  }

  setStatus(key: string, status: LayerStatus, errorMessage?: string): void {
    this._layers.update((arr) =>
      arr.map((l) =>
        l.key === key
          ? { ...l, status, errorMessage: status === 'error' ? errorMessage : undefined }
          : l
      )
    );
  }

  setVisibility(key: string, visible: boolean): void {
    this._layers.update((arr) =>
      arr.map((l) => (l.key === key ? { ...l, visible } : l))
    );
    this.storedVisibility[key] = visible;
    this.prefs.write(PREFS_KEY, this.storedVisibility);
  }

  /** Snapshot read; doesn't track in `effect()`. Use `visibilityOf` for reactive code. */
  get(key: string): LayerInfo | undefined {
    return this._layers().find((l) => l.key === key);
  }

  /** Reactive selector. Returns false when the key isn't registered yet. */
  visibilityOf(key: string): Signal<boolean> {
    return computed(() => this._layers().find((l) => l.key === key)?.visible ?? false);
  }

  /** Test-only helper. */
  _resetForTesting(): void {
    this._layers.set([]);
  }
}
