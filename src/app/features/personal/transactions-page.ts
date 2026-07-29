import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';

import { PersonalApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { currencySymbol } from '../../core/currencies';
import { dateInputValue, money, shortDate, signedMoney, toIsoDate } from '../../core/format';
import { UserPrefsService } from '../../core/user-prefs.service';
import {
  Paginated,
  PersonalCategory,
  PersonalTransaction,
  TransactionFilters,
  TransactionType,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmComponent, DialogComponent } from '../../shared/dialog';
import {
  CategoryIconComponent,
  EmptyStateComponent,
  PagerComponent,
  SkeletonRowsComponent,
} from '../../shared/ui';

interface Draft {
  id: string | null;
  amount: string;
  type: TransactionType;
  date: string;
  description: string;
  categoryId: string | null;
}

function emptyDraft(): Draft {
  return {
    id: null,
    amount: '',
    type: 'Expense',
    date: toIsoDate(new Date()),
    description: '',
    categoryId: null,
  };
}

@Component({
  selector: 'app-personal-transactions-page',
  imports: [
    FormsModule,
    DialogComponent,
    ConfirmComponent,
    CategoryIconComponent,
    EmptyStateComponent,
    PagerComponent,
    SkeletonRowsComponent,
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Transactions</h1>
          @if (page(); as p) {
            <div class="page-sub">{{ p.totalCount }} transactions · newest first</div>
          }
        </div>
        <button class="btn btn--primary" type="button" style="margin-left:auto" (click)="openCreate()">
          + Add transaction
        </button>
      </div>

      <div class="filters">
        <button class="chip" [class.is-active]="!filters().type" (click)="setFilter('type', null)">All</button>
        <button class="chip" [class.is-active]="filters().type === 'Expense'" (click)="setFilter('type', 'Expense')">Expenses</button>
        <button class="chip" [class.is-active]="filters().type === 'Income'" (click)="setFilter('type', 'Income')">Income</button>
        <div class="filters__divider"></div>
        <select
          class="select input--auto"
          style="height:36px"
          [ngModel]="filters().categoryId"
          (ngModelChange)="setFilter('categoryId', $event)"
        >
          <option [ngValue]="null">All categories</option>
          @for (c of categories(); track c.id) {
            <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option>
          }
        </select>
        <input
          class="input input--auto"
          style="height:36px"
          type="date"
          title="From"
          [ngModel]="filters().fromDate"
          (ngModelChange)="setFilter('fromDate', $event)"
        />
        <input
          class="input input--auto"
          style="height:36px"
          type="date"
          title="To"
          [ngModel]="filters().toDate"
          (ngModelChange)="setFilter('toDate', $event)"
        />
        @if (filters().type || filters().categoryId || filters().fromDate || filters().toDate) {
          <button class="btn btn--sm btn--ghost" type="button" (click)="clearFilters()">Clear</button>
        }
      </div>

      <div class="panel">
        @if (loading()) {
          <app-skeleton-rows />
        } @else if (page(); as p) {
          @if (!p.items.length) {
            <app-empty-state
              title="Nothing here yet"
              text="Add your first transaction and it'll show up here, newest first."
            >
              <button class="btn btn--primary" type="button" (click)="openCreate()">
                + Add transaction
              </button>
            </app-empty-state>
          } @else {
            @for (t of p.items; track t.id) {
              <div class="list-row">
                <app-category-icon [icon]="t.categoryIcon" [color]="t.categoryColor" size="lg" />
                <div class="list-row__main">
                  <div class="list-row__title">{{ t.description || '(no description)' }}</div>
                  <div class="list-row__meta">
                    {{ date(t.date) }} · {{ t.categoryName || 'Uncategorised' }}
                  </div>
                </div>
                <div
                  class="list-row__amount"
                  [class.money--income]="t.type === 'Income'"
                  [class.money--expense]="t.type === 'Expense'"
                >
                  {{ signed(t.amount, t.type) }}
                </div>
                <div class="list-row__actions">
                  <button class="icon-btn" type="button" title="Edit" (click)="openEdit(t)">✎</button>
                  <button
                    class="icon-btn icon-btn--danger"
                    type="button"
                    title="Delete"
                    (click)="deleting.set(t)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            }

            <app-pager
              [page]="p.pageNumber"
              [totalPages]="p.totalPages"
              [total]="p.totalCount"
              (go)="goToPage($event)"
            />
          }
        }
      </div>
    </div>

    @if (draft(); as d) {
      <app-dialog
        [title]="d.id ? 'Edit transaction' : 'Add transaction'"
        (closed)="draft.set(null)"
      >
        <div class="row" style="gap:14px;align-items:flex-start">
          <div class="field" style="flex:1;min-width:140px">
            <label class="field__label">Amount</label>
            <div class="money-input" [class.is-invalid]="fieldError('amount')">
              <div class="money-input__addon">{{ symbol() }}</div>
              <input type="text" inputmode="decimal" [(ngModel)]="d.amount" placeholder="0.00" />
            </div>
            @if (fieldError('amount'); as msg) {
              <div class="field__error">{{ msg }}</div>
            }
          </div>

          <div class="field">
            <label class="field__label">Type</label>
            <div class="segmented">
              <button
                type="button"
                class="is-expense"
                [class.is-active]="d.type === 'Expense'"
                (click)="d.type = 'Expense'"
              >
                Expense
              </button>
              <button
                type="button"
                class="is-income"
                [class.is-active]="d.type === 'Income'"
                (click)="d.type = 'Income'"
              >
                Income
              </button>
            </div>
          </div>

          <div class="field">
            <label class="field__label">Date</label>
            <input class="input input--auto" type="date" [(ngModel)]="d.date" />
          </div>
        </div>

        <div class="field">
          <label class="field__label">Description <span>(≤ 500, optional)</span></label>
          <input
            class="input"
            [class.is-invalid]="fieldError('description')"
            type="text"
            maxlength="500"
            [(ngModel)]="d.description"
          />
          @if (fieldError('description'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="field">
          <label class="field__label">
            Category <span>— leave blank to file it under “Other”</span>
          </label>
          <select class="select" [(ngModel)]="d.categoryId">
            <option [ngValue]="null">Other (default)</option>
            @for (c of categories(); track c.id) {
              <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option>
            }
          </select>
        </div>

        <div class="dialog__foot">
          <button class="btn btn--ghost" type="button" (click)="draft.set(null)">Cancel</button>
          <button
            class="btn btn--primary btn--wide"
            type="button"
            [disabled]="busy() || !validAmount(d.amount)"
            (click)="save(d)"
          >
            {{ d.id ? 'Save changes' : 'Save' }}
          </button>
        </div>
      </app-dialog>
    }

    @if (deleting(); as target) {
      <app-confirm
        title="Delete transaction"
        confirmLabel="Delete"
        [busy]="busy()"
        (confirmed)="confirmDelete(target)"
        (cancelled)="deleting.set(null)"
      >
        Delete <strong>{{ target.description || 'this transaction' }}</strong> for
        {{ fmt(target.amount) }}? This cannot be undone.
      </app-confirm>
    }
  `,
})
export class PersonalTransactionsPageComponent {
  private readonly api = inject(PersonalApi);
  private readonly toasts = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly prefs = inject(UserPrefsService);

  protected readonly categories = signal<PersonalCategory[]>([]);
  protected readonly page = signal<Paginated<PersonalTransaction> | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly draft = signal<Draft | null>(null);
  protected readonly deleting = signal<PersonalTransaction | null>(null);

  protected readonly filters = signal<TransactionFilters>({
    categoryId: null,
    type: null,
    fromDate: null,
    toDate: null,
    pageNumber: 1,
    pageSize: 20,
  });

  // Personal ledger is shown in the user's currency.
  protected readonly fmt = (n: number) => money(n, this.prefs.currency());
  protected readonly symbol = computed(() => currencySymbol(this.prefs.currency()));
  protected readonly date = shortDate;
  protected readonly signed = (n: number, type: TransactionType) =>
    signedMoney(n, type, this.prefs.currency());

  constructor() {
    // The dashboard's category rows drill in here pre-filtered.
    const params = this.route.snapshot.queryParamMap;
    const categoryId = params.get('categoryId');
    const type = params.get('type') as TransactionType | null;
    if (categoryId || type) {
      this.filters.update((f) => ({ ...f, categoryId, type }));
    }

    this.api.categories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: () => this.categories.set([]),
    });
    this.load();
  }

  protected readonly hasFilters = computed(() => {
    const f = this.filters();
    return !!(f.categoryId || f.type || f.fromDate || f.toDate);
  });

  protected setFilter<K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K],
  ): void {
    this.filters.update((f) => ({ ...f, [key]: value || null, pageNumber: 1 }));
    this.load();
  }

  protected clearFilters(): void {
    this.filters.set({
      categoryId: null,
      type: null,
      fromDate: null,
      toDate: null,
      pageNumber: 1,
      pageSize: 20,
    });
    this.load();
  }

  protected goToPage(pageNumber: number): void {
    this.filters.update((f) => ({ ...f, pageNumber }));
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.transactions(this.filters()).subscribe({
      next: (page) => {
        this.page.set(page);
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
    this.draft.set(emptyDraft());
  }

  protected openEdit(t: PersonalTransaction): void {
    this.error.set(null);
    this.draft.set({
      id: t.id,
      amount: t.amount.toFixed(2),
      type: t.type,
      date: dateInputValue(t.date),
      description: t.description ?? '',
      categoryId: t.categoryId,
    });
  }

  protected validAmount(value: string): boolean {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }

  protected save(d: Draft): void {
    if (!this.validAmount(d.amount)) return;

    this.busy.set(true);
    this.error.set(null);

    const body = {
      amount: Number(d.amount),
      description: d.description.trim() || null,
      date: d.date,
      type: d.type,
      categoryId: d.categoryId,
    };

    const request: Observable<unknown> = d.id
      ? this.api.updateTransaction(d.id, body)
      : this.api.createTransaction(body);

    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.draft.set(null);
        this.toasts.ok(d.id ? 'Transaction updated.' : 'Transaction added.');
        this.reloadAll();
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

  protected confirmDelete(t: PersonalTransaction): void {
    this.busy.set(true);
    this.api.deleteTransaction(t.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toasts.ok('Transaction deleted.');
        this.reloadAll();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toasts.error(toApiError(err).message);
      },
    });
  }

  /** Category transaction counts move with every write, so refresh both. */
  private reloadAll(): void {
    forkJoin({
      page: this.api.transactions(this.filters()),
      categories: this.api.categories(),
    }).subscribe({
      next: ({ page, categories }) => {
        this.page.set(page);
        this.categories.set(categories);
      },
      error: (err: unknown) => this.toasts.error(toApiError(err).message),
    });
  }

  protected fieldError(field: string): string | null {
    return this.error()?.fieldErrors[field]?.[0] ?? null;
  }
}
