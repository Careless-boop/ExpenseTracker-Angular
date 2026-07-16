import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SettingsApi } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api-error';
import { CURRENCIES } from '../../core/currencies';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { UserPrefsService } from '../../core/user-prefs.service';
import { AvatarComponent } from '../../shared/ui';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, AvatarComponent],
  template: `
    <div class="page">
      <h1 class="page-title">Settings</h1>

      @if (auth.user(); as user) {
        <div class="panel">
          <div class="panel__head">
            <div class="panel__label">Account</div>
          </div>
          <div class="panel__body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <app-avatar [name]="user.displayName || user.userName" />
            <div style="flex:1;min-width:200px">
              <div class="list-row__title">{{ user.displayName || user.userName }}</div>
              <div class="list-row__meta">{{ user.email }}</div>
            </div>
            <button class="btn btn--red btn--sm" type="button" (click)="auth.logout()">
              Log out
            </button>
          </div>
          <div class="panel__body" style="padding-top:0">
            <div class="hint">
              Profile details and passwords can't be changed yet — there are no endpoints for it.
            </div>
          </div>
        </div>
      }

      <div class="panel">
        <div class="panel__head">
          <div class="panel__label">Preferences</div>
        </div>

        <div class="setting">
          <div style="flex:1;min-width:240px">
            <div class="list-row__title">Currency</div>
            <div class="hint">
              Formats your personal ledger, and the default for lists you create. Amounts aren't
              converted between currencies.
            </div>
          </div>
          <select
            class="select"
            style="max-width:280px"
            [ngModel]="currency()"
            (ngModelChange)="changeCurrency($event)"
            [disabled]="busy()"
          >
            @for (c of currencies; track c.code) {
              <option [value]="c.code">{{ c.code }} · {{ c.name }} ({{ c.symbol }})</option>
            }
          </select>
        </div>

        <div class="setting">
          <div style="flex:1;min-width:240px">
            <div class="list-row__title">Add closed lists to my personal expenses</div>
            <div class="hint">
              When a shared list is closed, add my share of it to my personal transactions under a
              category named after the list. This materially changes what shows up on your Dashboard.
            </div>
          </div>
          <button
            class="switch"
            type="button"
            role="switch"
            [attr.aria-checked]="sync()"
            [class.is-on]="sync()"
            [disabled]="busy()"
            (click)="toggleSync()"
          ></button>
        </div>

        <div class="setting">
          <div style="flex:1;min-width:240px">
            <div class="list-row__title">Dark theme</div>
            <div class="hint">Both themes ship with the app; this is stored on this device.</div>
          </div>
          <button
            class="switch"
            type="button"
            role="switch"
            [attr.aria-checked]="theme.theme() === 'dark'"
            [class.is-on]="theme.theme() === 'dark'"
            (click)="theme.toggle()"
          ></button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .setting {
      padding: 16px 20px;
      border-top: 1px solid var(--row-border);
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;

      &:first-of-type {
        border-top: none;
      }
    }
  `,
})
export class SettingsPageComponent {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly api = inject(SettingsApi);
  private readonly toasts = inject(ToastService);
  private readonly prefs = inject(UserPrefsService);

  protected readonly currencies = CURRENCIES;

  protected readonly sync = signal(true);
  protected readonly currency = signal('USD');
  protected readonly busy = signal(false);

  constructor() {
    this.api.get().subscribe({
      next: (settings) => {
        this.sync.set(settings.syncClosedListsToPersonal);
        this.currency.set(settings.currency);
      },
      error: (err: unknown) => this.toasts.error(toApiError(err).message),
    });
  }

  protected toggleSync(): void {
    this.save({ syncClosedListsToPersonal: !this.sync(), currency: this.currency() });
  }

  protected changeCurrency(currency: string): void {
    this.save({ syncClosedListsToPersonal: this.sync(), currency });
  }

  private save(next: { syncClosedListsToPersonal: boolean; currency: string }): void {
    const previous = { sync: this.sync(), currency: this.currency() };
    this.busy.set(true);
    this.sync.set(next.syncClosedListsToPersonal);
    this.currency.set(next.currency);

    this.api.update(next).subscribe({
      next: (settings) => {
        this.busy.set(false);
        this.sync.set(settings.syncClosedListsToPersonal);
        this.currency.set(settings.currency);
        this.prefs.set(settings.currency);
        this.toasts.ok('Settings saved.');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.sync.set(previous.sync);
        this.currency.set(previous.currency);
        this.toasts.error(toApiError(err).message);
      },
    });
  }
}
