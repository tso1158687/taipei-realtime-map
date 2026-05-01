import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { I18nService } from '../../core/i18n';
import {
  RouteSearchService,
  type RoutePath,
  type SearchableStation,
} from '../../features/search/route-search.service';

/**
 * Bottom-right floating route search panel. Two text inputs with `<datalist>`
 * autocomplete from all metro stations; output is a list of stations to
 * traverse plus transfer count. Click the button to compute via Dijkstra
 * (cross-line, cross-operator metro graph; bus/TRA out of scope for Phase 6.1).
 */
@Component({
  selector: 'app-search-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="search-panel" [attr.aria-label]="ariaLabel()">
      <button
        type="button"
        class="header"
        [attr.aria-expanded]="open()"
        (click)="toggleOpen()"
      >
        <span>{{ open() ? '▾' : '▸' }}</span>
        <span class="title">{{ titleText() }}</span>
      </button>
      @if (open()) {
        <form (submit)="onSubmit($event)" class="form">
          <label class="row">
            <span class="lbl">{{ fromLabel() }}</span>
            <input
              list="search-stations"
              [value]="fromInput()"
              (input)="fromInput.set($any($event.target).value)"
              [placeholder]="placeholderText()"
            />
          </label>
          <label class="row">
            <span class="lbl">{{ toLabel() }}</span>
            <input
              list="search-stations"
              [value]="toInput()"
              (input)="toInput.set($any($event.target).value)"
              [placeholder]="placeholderText()"
            />
          </label>
          <datalist id="search-stations">
            @for (s of options(); track s.id) {
              <option [value]="optionLabel(s)"></option>
            }
          </datalist>
          <button type="submit" class="go">{{ goText() }}</button>
        </form>
        @if (notReady()) {
          <p class="hint">{{ loadingText() }}</p>
        } @else if (notFound()) {
          <p class="hint err">{{ notFoundText() }}</p>
        } @else if (result()) {
          <div class="result">
            <p class="summary">
              {{ summaryText(result()!) }}
            </p>
            <ol class="steps">
              @for (s of result()!.stations; track s.id) {
                <li>{{ stationText(s) }}</li>
              }
            </ol>
          </div>
        }
      }
    </aside>
  `,
  styles: [
    `
      :host { display: contents; }
      .search-panel {
        position: absolute;
        bottom: 30px;
        right: 10px;
        z-index: 10;
        max-width: 280px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
        font-family: inherit;
        font-size: 13px;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        text-align: left;
        padding: 6px 10px;
        border: none;
        background: transparent;
        cursor: pointer;
        font: inherit;
      }
      .header:focus-visible,
      input:focus-visible,
      .go:focus-visible {
        outline: 2px solid #0070bd;
        outline-offset: 1px;
      }
      .title { font-weight: 600; }
      .form { display: flex; flex-direction: column; gap: 6px; padding: 0 10px 6px; }
      .row { display: flex; flex-direction: column; gap: 2px; }
      .lbl { font-size: 11px; color: #666; }
      input {
        padding: 4px 6px;
        font: inherit;
        border: 1px solid rgba(0, 0, 0, 0.18);
        border-radius: 3px;
      }
      .go {
        padding: 5px 10px;
        font: inherit;
        background: #0070bd;
        color: #fff;
        border: 0;
        border-radius: 3px;
        cursor: pointer;
      }
      .hint { padding: 6px 10px; margin: 0; color: #666; font-size: 12px; }
      .err { color: #d73a49; }
      .result { padding: 6px 10px 10px; max-height: 240px; overflow: auto; }
      .summary { margin: 0 0 4px; font-size: 12px; color: #444; }
      .steps { padding-left: 18px; margin: 0; font-size: 12px; }
    `,
  ],
})
export class SearchPanelComponent {
  private readonly i18n = inject(I18nService);
  private readonly search = inject(RouteSearchService);

  protected readonly open = signal(false);
  protected readonly fromInput = signal('');
  protected readonly toInput = signal('');
  protected readonly result = signal<RoutePath | null>(null);
  protected readonly notFound = signal(false);
  private readonly stations = signal<readonly SearchableStation[]>([]);

  protected readonly options = computed(() => this.stations());
  protected readonly notReady = computed(() => this.stations().length === 0);

  protected readonly ariaLabel = computed(() =>
    this.i18n.locale() === 'en' ? 'Route search' : '路線搜尋'
  );
  protected readonly titleText = computed(() =>
    this.i18n.locale() === 'en' ? 'Find a route' : '找路線'
  );
  protected readonly fromLabel = computed(() =>
    this.i18n.locale() === 'en' ? 'From' : '起點'
  );
  protected readonly toLabel = computed(() =>
    this.i18n.locale() === 'en' ? 'To' : '終點'
  );
  protected readonly goText = computed(() =>
    this.i18n.locale() === 'en' ? 'Search' : '搜尋'
  );
  protected readonly placeholderText = computed(() =>
    this.i18n.locale() === 'en' ? 'Station name' : '站名'
  );
  protected readonly loadingText = computed(() =>
    this.i18n.locale() === 'en'
      ? 'Loading station data… try again in a moment.'
      : '路網資料載入中… 請稍後再試。'
  );
  protected readonly notFoundText = computed(() =>
    this.i18n.locale() === 'en'
      ? 'No route found. Check station names.'
      : '找不到路線；請確認站名。'
  );

  toggleOpen(): void {
    const next = !this.open();
    this.open.set(next);
    if (next && this.stations().length === 0) {
      this.search.ensureGraph().subscribe(() => {
        this.stations.set(this.search.allStations());
      });
    }
  }

  optionLabel(s: SearchableStation): string {
    return this.i18n.locale() === 'en'
      ? `${s.name.en} (${s.operatorId})`
      : `${s.name.zh} (${s.operatorId})`;
  }

  stationText(s: SearchableStation): string {
    const isEn = this.i18n.locale() === 'en';
    const lines = s.lineIds.join(',');
    return isEn
      ? `${s.name.en}${lines ? ' · ' + lines : ''}`
      : `${s.name.zh}${lines ? ' · ' + lines : ''}`;
  }

  summaryText(r: RoutePath): string {
    const isEn = this.i18n.locale() === 'en';
    const stops = r.stations.length;
    return isEn
      ? `${stops} stops, ${r.transfers} transfer${r.transfers === 1 ? '' : 's'}`
      : `${stops} 站 · ${r.transfers} 次轉乘`;
  }

  onSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const fromId = this.findStationId(this.fromInput());
    const toId = this.findStationId(this.toInput());
    if (!fromId || !toId) {
      this.result.set(null);
      this.notFound.set(true);
      return;
    }
    const path = this.search.search(fromId, toId);
    if (!path) {
      this.result.set(null);
      this.notFound.set(true);
    } else {
      this.notFound.set(false);
      this.result.set(path);
    }
  }

  private findStationId(input: string): string | null {
    const stripped = input.replace(/\s*\([^)]+\)\s*$/, '').trim();
    if (!stripped) return null;
    const lc = stripped.toLowerCase();
    for (const s of this.stations()) {
      if (
        s.name.zh === stripped ||
        s.name.en.toLowerCase() === lc
      ) {
        return s.id;
      }
    }
    return null;
  }
}
