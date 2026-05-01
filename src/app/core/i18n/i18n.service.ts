import { Injectable, computed, inject, signal } from '@angular/core';
import { PreferencesService } from '../preferences';
import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  Dictionary,
  DictionaryKey,
  Locale,
} from './dictionaries';

/**
 * Lightweight in-memory i18n service backed by typed dictionaries.
 *
 * Why not @angular/localize?
 *   The official i18n flow is build-time only (one bundle per language) and
 *   doesn't fit a "user clicks a switch and labels change" use case. Until
 *   we need fully translated marketing pages, a runtime signal is enough
 *   and keeps the implementation a single small service.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly prefs = inject(PreferencesService);
  private readonly _locale = signal<Locale>(this.readInitialLocale());

  readonly locale = this._locale.asReadonly();

  readonly dictionary = computed<Dictionary>(
    () => DICTIONARIES[this._locale()]
  );

  setLocale(locale: Locale): void {
    this._locale.set(locale);
    this.prefs.write('locale', locale);
  }

  private readInitialLocale(): Locale {
    const stored = this.prefs.read<Locale | null>('locale', null);
    return stored === 'zh-TW' || stored === 'en' ? stored : DEFAULT_LOCALE;
  }

  /**
   * Look up a translation. Returns the raw key when not found so missing
   * translations are visible in the UI rather than silently dropped.
   */
  t(key: DictionaryKey): string {
    return this.dictionary()[key];
  }
}
