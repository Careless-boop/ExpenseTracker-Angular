import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiError, toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { UserPrefsService } from '../../core/user-prefs.service';

const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'A digit', test: (v) => /\d/.test(v) },
  { label: 'A non-alphanumeric character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth">
      <div class="auth__brand">
        <span class="empty__coin" style="width:44px;height:44px;font-size:24px">$</span>
        <span class="auth__wordmark">ExpenseTracker</span>
      </div>

      <div class="panel" style="width:420px;max-width:100%">
        <div class="panel__head">
          <div class="panel__title">{{ isRegister() ? 'Create your account' : 'Sign in' }}</div>
          <div class="spacer"></div>
          <button class="btn btn--xs" type="button" (click)="theme.toggle()">
            {{ theme.theme() === 'dark' ? '☀ Light' : '◐ Dark' }}
          </button>
        </div>

        <form class="panel__body" style="display:flex;flex-direction:column;gap:16px" (ngSubmit)="submit()">
          <!-- 429 and lockout both arrive as a message, not a field error -->
          @if (error(); as err) {
            @if (!err.fieldErrors['_']) {
              <div class="callout callout--bad">{{ err.message }}</div>
            }
          }

          @if (isRegister()) {
            <div class="field">
              <label class="field__label">Username</label>
              <input
                class="input"
                [class.is-invalid]="fieldError('userName')"
                type="text"
                name="userName"
                autocomplete="username"
                [(ngModel)]="userName"
                required
              />
              @if (fieldError('userName'); as msg) {
                <div class="field__error">{{ msg }}</div>
              }
            </div>
          }

          <div class="field">
            <label class="field__label">Email</label>
            <input
              class="input"
              [class.is-invalid]="fieldError('email')"
              type="email"
              name="email"
              autocomplete="email"
              [(ngModel)]="email"
              required
            />
            @if (fieldError('email'); as msg) {
              <div class="field__error">{{ msg }}</div>
            }
          </div>

          <div class="field">
            <label class="field__label">Password</label>
            <input
              class="input"
              [class.is-invalid]="fieldError('password') || ruleViolations().length"
              type="password"
              name="password"
              [autocomplete]="isRegister() ? 'new-password' : 'current-password'"
              [(ngModel)]="password"
              required
            />
            @if (fieldError('password'); as msg) {
              <div class="field__error">{{ msg }}</div>
            }
          </div>

          <!-- password rules render against the field, live, and again on a 400 -->
          @if (isRegister()) {
            <div class="rules">
              @for (rule of rules; track rule.label) {
                <div class="rule" [class.is-met]="rule.test(password())">
                  <span>{{ rule.test(password()) ? '✓' : '·' }}</span>
                  {{ rule.label }}
                </div>
              }
            </div>
            @for (msg of ruleViolations(); track msg) {
              <div class="field__error">{{ msg }}</div>
            }
          }

          <button
            class="btn btn--primary btn--block"
            type="submit"
            [disabled]="busy() || !canSubmit()"
          >
            {{ busy() ? 'Please wait…' : isRegister() ? 'Create account' : 'Sign in' }}
          </button>

          <div class="hint" style="text-align:center">
            @if (isRegister()) {
              Already have an account? <a routerLink="/login">Sign in</a>
            } @else {
              New here? <a routerLink="/register">Create an account</a>
            }
          </div>
        </form>
      </div>

      <div class="hint" style="max-width:420px;text-align:center">
        Registration signs you straight in — there is no email confirmation step.
      </div>
    </div>
  `,
  styles: `
    .auth {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 22px;
      padding: 40px 16px;
    }

    .auth__brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .auth__wordmark {
      font-family: var(--font-head);
      font-weight: bold;
      font-size: 30px;
      color: var(--heading);
      text-shadow: var(--heading-shadow);
    }

    .rules {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .rule {
      font-size: 11px;
      color: var(--muted);

      span {
        display: inline-block;
        width: 12px;
        font-weight: bold;
      }

      &.is-met {
        color: var(--ok-ink);
      }
    }
  `,
})
export class AuthPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly prefs = inject(UserPrefsService);
  protected readonly theme = inject(ThemeService);

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
