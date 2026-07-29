import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SettingsApi } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api-error';
import { CURRENCIES } from '../../core/currencies';
import { initials } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { UserPrefsService } from '../../core/user-prefs.service';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule],
  template: `
    <div class="page page--narrow">
      <h1 class="page-title">Settings</h1>

      @if (auth.user(); as user) {
        <section class="card card--pad">
          <div class="section-label" style="margin-bottom:14px">ACCOUNT</div>
          <div class="row" style="gap:14px;flex-wrap:nowrap">
            <span class="avatar avatar--lg" style="background:#e8d9c4;color:#7a6a50">{{ initials(user.displayName || user.userName) }}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:800;font-size:16px">{{ user.displayName || user.userName }}</div>
              <div class="page-sub" style="margin-top:0">{{ user.email }} · &#64;{{ user.userName }}</div>
            </div>
            <button class="btn btn--sm btn--ghost" type="button" (click)="auth.logout()">Log out</button>
          </div>
          <div class="hint" style="margin-top:14px">
            Profile editing isn't available yet — your name comes from your account.
          </div>
        </section>

        <section class="card card--pad">
          <div class="section-label" style="margin-bottom:14px">PREFERENCES</div>

          <div class="setting">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14.5px">Add closed lists to my personal expenses</div>
              <div class="hint" style="font-size:13px;color:var(--muted);margin-top:3px">
                When a shared list is closed, your share of it lands in your personal transactions under a
                category named after the list — so trips show up on your Dashboard automatically.
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

          <div class="setting setting--last">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14.5px">Currency</div>
              <div class="hint" style="font-size:13px;color:var(--muted);margin-top:3px">
                How amounts are shown. Just a display thing — nothing gets converted.
              </div>
            </div>
            <select
              class="select input--auto"
              [ngModel]="currency()"
              (ngModelChange)="changeCurrency($event)"
              [disabled]="busy()"
            >
              @for (c of currencies; track c.code) {
                <option [value]="c.code">{{ c.symbol }} {{ c.code }}</option>
              }
            </select>
          </div>
        </section>

        <div class="hint" style="padding:0 6px">
          Changes save automatically. New lists you create will use your currency unless you pick
          another one for them.
        </div>
      }
    </div>
  `,
  styles: `
    .setting {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 18px;
    }
    .setting--last {
      border-bottom: none;
      padding-bottom: 0;
      margin-bottom: 0;
      align-items: center;
    }
  `,
})
export class SettingsPageComponent {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(SettingsApi);
  private readonly toasts = inject(ToastService);
  private readonly prefs = inject(UserPrefsService);

  protected readonly currencies = CURRENCIES;
  protected readonly initials = initials;

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
