import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ExpenseListApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { CURRENCIES } from '../../core/currencies';
import { longDate } from '../../core/format';
import { ExpenseList } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UserPrefsService } from '../../core/user-prefs.service';
import { DialogComponent } from '../../shared/dialog';
import { EmptyStateComponent } from '../../shared/ui';

@Component({
  selector: 'app-lists-page',
  imports: [FormsModule, RouterLink, DialogComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <h1 class="page-title">Expense Lists</h1>
        <div class="spacer"></div>
        <button class="btn btn--green" type="button" (click)="openCreate()">＋ Create list</button>
      </div>

      @if (loading()) {
        <div class="grid-cards">
          @for (i of [1, 2, 3]; track i) {
            <div class="panel" style="padding:18px">
              <div class="skeleton" style="width:60%;height:16px"></div>
              <div class="skeleton" style="width:90%;margin-top:12px"></div>
            </div>
          }
        </div>
      } @else if (!lists().length) {
        <div class="panel">
          <app-empty-state
            title="No shared lists yet"
            text="Create one for a trip, a flat, or anything you split with other people."
            glyph="👥"
          >
            <button class="btn btn--green" type="button" (click)="openCreate()">
              ＋ Create your first list
            </button>
          </app-empty-state>
        </div>
      } @else {
        @if (active().length) {
          <div class="grid-cards">
            @for (l of active(); track l.id) {
              <a class="list-card" [routerLink]="['/lists', l.id]">
                <div class="list-card__head">
                  <span class="list-card__name">{{ l.name }}</span>
                  <span [class]="'badge badge--' + l.currentUserRole.toLowerCase()">
                    {{ l.currentUserRole }}
                  </span>
                </div>
                <div class="list-card__body">
                  <div class="hint">{{ l.description || 'No description.' }}</div>
                  <div class="list-card__meta">
                    <span>{{ l.memberCount }} {{ l.memberCount === 1 ? 'member' : 'members' }}</span>
                    <span>·</span>
                    <span>
                      {{ l.transactionCount }}
                      {{ l.transactionCount === 1 ? 'transaction' : 'transactions' }}
                    </span>
                  </div>
                </div>
              </a>
            }
          </div>
        }

        <!-- closed lists are frozen; group them apart -->
        @if (closed().length) {
          <div class="panel__label" style="margin-top:6px">Closed</div>
          <div class="grid-cards">
            @for (l of closed(); track l.id) {
              <a class="list-card is-closed" [routerLink]="['/lists', l.id]">
                <div class="list-card__head">
                  <span class="list-card__name">{{ l.name }}</span>
                  <span class="badge badge--closed">Closed</span>
                </div>
                <div class="list-card__body">
                  <div class="hint">Closed on {{ date(l.closedAt!) }}</div>
                  <div class="list-card__meta">
                    <span>{{ l.memberCount }} {{ l.memberCount === 1 ? 'member' : 'members' }}</span>
                    <span>·</span>
                    <span>{{ l.transactionCount }} transactions</span>
                  </div>
                </div>
              </a>
            }
          </div>
        }
      }
    </div>

    @if (creating()) {
      <app-dialog title="Create expense list" size="sm" (closed)="creating.set(false)">
        <div class="field">
          <label class="field__label">Name <span>(≤ 200)</span></label>
          <input
            class="input"
            [class.is-invalid]="fieldError('name')"
            type="text"
            maxlength="200"
            [(ngModel)]="name"
            placeholder="Whistler Ski Trip 2026"
          />
          @if (fieldError('name'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="field">
          <label class="field__label">Description <span>(≤ 1000, optional)</span></label>
          <textarea class="input" rows="3" maxlength="1000" [(ngModel)]="description"></textarea>
        </div>

        <div class="field">
          <label class="field__label">Cover image URL <span>(≤ 500, optional)</span></label>
          <input class="input" type="url" maxlength="500" [(ngModel)]="coverImage" />
        </div>

        <div class="field">
          <label class="field__label">Currency</label>
          <select class="select" [ngModel]="currency()" (ngModelChange)="currency.set($event)">
            @for (c of currencies; track c.code) {
              <option [value]="c.code">{{ c.code }} · {{ c.name }} ({{ c.symbol }})</option>
            }
          </select>
          <div class="hint">Defaults to your currency. Amounts aren't converted.</div>
        </div>

        <div class="dialog__foot">
          <button class="btn" type="button" (click)="creating.set(false)">Cancel</button>
          <button
            class="btn btn--green btn--wide"
            type="button"
            [disabled]="busy() || !name().trim()"
            (click)="create()"
          >
            Create list
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: `
    .list-card {
      display: block;
      background: var(--panel);
      background-image: var(--panel-sheen);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--lift), var(--panel-inset);
      overflow: hidden;
      text-decoration: none;

      &:hover {
        box-shadow: 0 6px 18px rgba(28, 56, 120, 0.3);
      }

      &.is-closed {
        opacity: 0.82;
      }
    }

    .list-card__head {
      background: var(--chrome);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .is-closed .list-card__head {
      background: var(--grad-gold);
    }

    .list-card__name {
      flex: 1;
      font-family: var(--font-head);
      font-weight: bold;
      font-size: 14px;
      color: #fff;
      text-shadow: 0 1px 2px rgba(10, 30, 80, 0.6);
    }

    .is-closed .list-card__name {
      color: var(--gold-ink);
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
    }

    .list-card__body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .list-card__meta {
      display: flex;
      gap: 6px;
      font-size: 11px;
      font-weight: bold;
      color: var(--label);
    }
  `,
})
export class ListsPageComponent {
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly prefs = inject(UserPrefsService);

  protected readonly currencies = CURRENCIES;

  protected readonly lists = signal<ExpenseList[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly creating = signal(false);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly coverImage = signal('');
  protected readonly currency = signal('USD');

  protected readonly date = longDate;

  protected readonly active = computed(() => this.lists().filter((l) => !l.closedAt));
  protected readonly closed = computed(() => this.lists().filter((l) => !!l.closedAt));

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.all().subscribe({
      next: (lists) => {
        this.lists.set(lists);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.toasts.error(toApiError(err).message);
      },
    });
  }

  protected openCreate(): void {
    this.error.set(null);
    this.name.set('');
    this.description.set('');
    this.coverImage.set('');
    this.currency.set(this.prefs.currency());
    this.creating.set(true);
  }

  protected create(): void {
    this.busy.set(true);
    this.error.set(null);

    this.api
      .create({
        name: this.name().trim(),
        description: this.description().trim() || null,
        coverImage: this.coverImage().trim() || null,
        currency: this.currency(),
      })
      .subscribe({
        next: ({ id }) => {
          this.busy.set(false);
          this.creating.set(false);
          void this.router.navigate(['/lists', id]);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          const apiError = toApiError(err);
          this.error.set(apiError);
          if (!Object.keys(apiError.fieldErrors).length) {
            this.toasts.error(apiError.message);
          }
        },
      });
  }

  protected fieldError(field: string): string | null {
    return this.error()?.fieldErrors[field]?.[0] ?? null;
  }
}
