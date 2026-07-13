import { Component, inject, signal } from '@angular/core';

import { SettingsApi } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api-error';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../shared/ui';

@Component({
  selector: 'app-settings-page',
  imports: [AvatarComponent],
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

  protected readonly sync = signal(true);
  protected readonly busy = signal(false);

  constructor() {
    this.api.get().subscribe({
      next: (settings) => this.sync.set(settings.syncClosedListsToPersonal),
      error: (err: unknown) => this.toasts.error(toApiError(err).message),
    });
  }

  protected toggleSync(): void {
    const next = !this.sync();
    this.busy.set(true);
    this.sync.set(next);

    this.api.update({ syncClosedListsToPersonal: next }).subscribe({
      next: (settings) => {
        this.busy.set(false);
        this.sync.set(settings.syncClosedListsToPersonal);
        this.toasts.ok('Settings saved.');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.sync.set(!next);
        this.toasts.error(toApiError(err).message);
      },
    });
  }
}
