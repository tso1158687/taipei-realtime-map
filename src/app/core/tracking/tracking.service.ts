import { Injectable, signal } from '@angular/core';

export interface TrackingTarget {
  /** Layer-component-defined identifier of what's being tracked, e.g. 'TRTC-1234'. */
  readonly id: string;
}

/**
 * Tiny shared signal: which feature on the map (if any) the camera is
 * currently following. Each layer component decides whether it owns the
 * given id and acts accordingly.
 *
 * Callers:
 *   - MetroTrainLayerComponent sets target on click, clears on ESC.
 *   - Same component drives camera in its raf loop.
 */
@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly _target = signal<TrackingTarget | null>(null);
  readonly target = this._target.asReadonly();

  set(id: string): void {
    this._target.set({ id });
  }

  clear(): void {
    this._target.set(null);
  }

  isTracking(id: string): boolean {
    return this._target()?.id === id;
  }
}
