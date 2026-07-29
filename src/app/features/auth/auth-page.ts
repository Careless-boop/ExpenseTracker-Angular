import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiError, toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { UserPrefsService } from '../../core/user-prefs.service';

const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: '8+ characters', test: (v) => v.length >= 8 },
  { label: 'uppercase', test: (v) => /[A-Z]/.test(v) },
  { label: 'lowercase', test: (v) => /[a-z]/.test(v) },
  { label: 'a digit', test: (v) => /\d/.test(v) },
  { label: 'a symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth">
      <div class="auth__brand">
        <span class="brand__mark" style="width:34px;height:34px;box-shadow:inset -8px -8px 0 var(--accent-2)"></span>
        <span style="font-weight:800;font-size:20px;letter-spacing:-.01em">ExpenseTracker</span>
      </div>

      <form class="auth__card" (ngSubmit)="submit()">
        <div class="auth__seg">
          <a routerLink="/login" [class.is-active]="!isRegister()">Log in</a>
          <a routerLink="/register" [class.is-active]="isRegister()">Create account</a>
        </div>

        @if (error(); as err) {
          @if (!err.fieldErrors['_']) {
            <div class="callout" [class.callout--bad]="err.status !== 429" [class.callout--warn]="err.status === 429">
              {{ err.message }}
            </div>
          }
        }

        @if (isRegister()) {
          <div class="field">
            <label class="label">Username</label>
            <input
              class="input"
              [class.is-invalid]="fieldError('userName')"
              type="text"
              autocomplete="username"
              placeholder="andriyk"
              [ngModel]="userName()"
              (ngModelChange)="userName.set($event)"
              name="userName"
            />
            @if (fieldError('userName'); as msg) {
              <div class="field__error">{{ msg }}</div>
            }
          </div>
        }

        <div class="field">
          <label class="label">Email</label>
          <input
            class="input"
            [class.is-invalid]="fieldError('email')"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            [ngModel]="email()"
            (ngModelChange)="email.set($event)"
            name="email"
          />
          @if (fieldError('email'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="field">
          <label class="label">Password</label>
          <input
            class="input"
            [class.is-invalid]="fieldError('password') || ruleViolations().length"
            type="password"
            [autocomplete]="isRegister() ? 'new-password' : 'current-password'"
            placeholder="••••••••"
            [ngModel]="password()"
            (ngModelChange)="password.set($event)"
            name="password"
          />
          @if (fieldError('password'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        @if (isRegister()) {
          <div class="auth__rules">
            @for (rule of rules; track rule.label) {
              <span class="auth__rule" [class.is-met]="rule.test(password())">
                {{ rule.test(password()) ? '✓' : '·' }} {{ rule.label }}
              </span>
            }
          </div>
          @for (msg of ruleViolations(); track msg) {
            <div class="field__error">{{ msg }}</div>
          }
        }

        <button class="btn btn--primary btn--block" type="submit" [disabled]="busy() || !canSubmit()">
          {{ busy() ? 'Please wait…' : isRegister() ? 'Create account' : 'Log in' }}
        </button>

        @if (isRegister()) {
          <div class="hint" style="text-align:center;margin-top:2px">
            No email confirmation — you're in straight away.
          </div>
        }
      </form>

      <div class="auth__tag">Track it. Split it. Settle it. Move on.</div>
    </div>
  `,
  styles: `
    .auth {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .auth__brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      margin-bottom: 26px;
    }

    .auth__card {
      width: 100%;
      max-width: 400px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 28px;
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .auth__seg {
      display: flex;
      background: var(--pill);
      border-radius: 12px;
      padding: 3px;
      margin-bottom: 8px;

      a {
        flex: 1;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        color: var(--label);
        font-size: 14px;
        font-weight: 700;

        &.is-active {
          background: #fff;
          color: var(--ink);
          box-shadow: 0 1px 3px rgba(55, 47, 39, 0.12);
        }
      }
    }

    .auth__rules {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .auth__rule {
      padding: 4px 10px;
      border-radius: 8px;
      background: var(--pill);
      color: #9a8c7a;
      font-size: 11.5px;
      font-weight: 700;

      &.is-met {
        background: var(--income-soft);
        color: var(--income);
      }
    }

    .auth__tag {
      text-align: center;
      margin-top: 18px;
      font-size: 13px;
      color: var(--faint);
    }
  `,
})
export class AuthPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly prefs = inject(UserPrefsService);

  protected readonly isRegister = signal(this.route.snapshot.data['mode'] === 'register');

  protected readonly userName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly rules = PASSWORD_RULES;

  /** Identity returns violated password rules as a bare list, not per-field. */
  protected readonly ruleViolations = computed(() => this.error()?.fieldErrors['_'] ?? []);

  protected readonly canSubmit = computed(() => {
    const base = !!this.email().trim() && !!this.password();
    return this.isRegister() ? base && !!this.userName().trim() : base;
  });

  protected submit(): void {
    if (this.busy() || !this.canSubmit()) return;

    this.busy.set(true);
    this.error.set(null);

    const request = this.isRegister()
      ? this.auth.register(this.userName().trim(), this.email().trim(), this.password())
      : this.auth.login(this.email().trim(), this.password());

    request.subscribe({
      next: () => {
        this.prefs.refresh();
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(toApiError(err));
      },
    });
  }

  protected fieldError(field: string): string | null {
    return this.error()?.fieldErrors[field]?.[0] ?? null;
  }
}
