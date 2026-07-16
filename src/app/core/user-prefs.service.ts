import { Injectable, inject, signal } from '@angular/core';

import { SettingsApi } from './api.service';
import { DEFAULT_CURRENCY } from './currencies';

/**
 * The user's currency lives in their settings, but the personal ledger (dashboard,
 * transactions) needs it everywhere. This loads it once after sign-in and exposes it
 * as a signal so those views format reactively; the settings page updates it on save.
 */
@Injectable({ providedIn: 'root' })
export class UserPrefsService {
  private readonly api = inject(SettingsApi);

  readonly currency = signal<string>(DEFAULT_CURRENCY);

  refresh(): void {
    this.api.get().subscribe({
      next: (settings) => this.currency.set(settings.currency),
      error: () => {
        /* keep the current value; a failed load shouldn't blank the UI */
      },
    });
  }

  set(currency: string): void {
    this.currency.set(currency);
  }
}
