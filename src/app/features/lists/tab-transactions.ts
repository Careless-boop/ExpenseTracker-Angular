import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ExpenseListApi } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { money, shortDate, signedMoney } from '../../core/format';
import {
  ExpenseListCategory,
  ExpenseListTransaction,
  Paginated,
  TransactionFilters,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmComponent } from '../../shared/dialog';
import {
  CategoryIconComponent,
  EmptyStateComponent,
  PagerComponent,
  SkeletonRowsComponent,
} from '../../shared/ui';
import { ListContext } from './list-context';
import { SplitEditorComponent } from './split-editor';

@Component({
  selector: 'app-tab-transactions',
  imports: [
    FormsModule,
    ConfirmComponent,
    CategoryIconComponent,
    EmptyStateComponent,
    PagerComponent,
    SkeletonRowsComponent,
    SplitEditorComponent,
  ],
  template: `
    <div class="filters">
      <div class="field">
        <label class="field__label field__label--caps">Category</label>
        <select
          class="select select--sm"
          style="min-width:150px"
          [ngModel]="filters().categoryId"
          (ngModelChange)="setFilter('categoryId', $event)"
        >
          <option [ngValue]="null">All categories</option>
          @for (c of categories(); track c.id) {
            <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option>
          }
        </select>
      </div>

      <div class="field">
        <label class="field__label field__label--caps">Type</label>
        <div class="segmented">
          <button type="button" [class.is-active]="!filters().type" (click)="setFilter('type', null)">
            All
          </button>
          <button
            type="button"
            class="is-expense"
            [class.is-active]="filters().type === 'Expense'"
            (click)="setFilter('type', 'Expense')"
          >
            Expenses
          </button>
          <button
            type="button"
            class="is-income"
            [class.is-active]="filters().type === 'Income'"
            (click)="setFilter('type', 'Income')"
          >
            Income
          </button>
        </div>
      </div>

      <div class="field">
        <label class="field__label field__label--caps">From</label>
        <input
          class="input input--sm input--auto"
          type="date"
          [ngModel]="filters().fromDate"
          (ngModelChange)="setFilter('fromDate', $event)"
        />
      </div>

      <div class="field">
        <label class="field__label field__label--caps">To</label>
        <input
          class="input input--sm input--auto"
          type="date"
          [ngModel]="filters().toDate"
          (ngModelChange)="setFilter('toDate', $event)"
        />
      </div>

      <div class="spacer"></div>

      @if (ctx.canEdit()) {
        <button class="btn btn--sm btn--primary" type="button" (click)="creating.set(true)">
          ＋ Add transaction
        </button>
      }
    </div>

    @if (loading()) {
      <app-skeleton-rows />
    } @else if (page(); as p) {
      @if (!p.items.length) {
        <app-empty-state
          title="No transactions yet"
          text="Add what the group spends and who fronted the money — balances follow automatically."
        >
          @if (ctx.canEdit()) {
            <button class="btn btn--primary" type="button" (click)="creating.set(true)">
              ＋ Add a transaction
            </button>
          }
        </app-empty-state>
      } @else {
        @for (t of p.items; track t.id) {
          <div class="list-row">
            <app-category-icon [icon]="t.categoryIcon" [color]="t.categoryColor" size="lg" />

            <div class="list-row__main">
              <div class="list-row__title">{{ t.description || '(no description)' }}</div>
              <div class="list-row__meta">
                <span>{{ date(t.date) }}</span>
                <span>·</span>
                <span>{{ t.categoryName || 'Uncategorised' }}</span>
                <span>·</span>
                <span>
                  {{ t.type === 'Income' ? 'received by' : 'paid by' }}
                  <strong>{{ payer(t) }}</strong>
                </span>
                @if (isMockPayer(t)) {
                  <span class="badge badge--placeholder">placeholder</span>
                }
                <span>·</span>
                <span>
                  {{ t.type === 'Income' ? 'benefits' : 'split between' }}
                  {{ t.participants.length }}
                  {{ t.participants.length === 1 ? 'person' : 'people' }}
                </span>
              </div>
            </div>

            <!-- your share is the number people actually look for -->
            @if (myShare(t) !== null) {
              <div class="chip-share" [class.chip-share--income]="t.type === 'Income'">
                your share {{ t.type === 'Income' ? '+' : '' }}{{ fmt(myShare(t)!) }}
              </div>
            }

            <div
              class="list-row__amount"
              [class.money--income]="t.type === 'Income'"
              [class.money--expense]="t.type === 'Expense'"
            >
              {{ signed(t.amount, t.type) }}
            </div>

            @if (ctx.canEdit()) {
              <div class="list-row__actions">
                <button class="icon-btn" type="button" title="Edit" (click)="editing.set(t)">
                  ✎
                </button>
                <button
                  class="icon-btn icon-btn--danger"
                  type="button"
                  title="Delete"
                  (click)="deleting.set(t)"
                >
                  ✕
                </button>
              </div>
            }
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

    @if (creating() || editing()) {
      <app-split-editor
        [editing]="editing()"
        [categories]="categories()"
        (saved)="afterSave()"
        (cancelled)="closeEditor()"
      />
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
        {{ fmt(target.amount) }}? Everyone's balances will change.
      </app-confirm>
    }
  `,
})
export class TabTransactionsComponent {
  protected readonly ctx = inject(ListContext);
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);

  protected readonly page = signal<Paginated<ExpenseListTransaction> | null>(null);
  protected readonly categories = signal<ExpenseListCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);

  protected readonly creating = signal(false);
  protected readonly editing = signal<ExpenseListTransaction | null>(null);
  protected readonly deleting = signal<ExpenseListTransaction | null>(null);

  protected readonly filters = signal<TransactionFilters>({
    categoryId: null,
    type: null,
    fromDate: null,
    toDate: null,
    pageNumber: 1,
    pageSize: 20,
  });

  protected readonly fmt = money;
  protected readonly date = shortDate;
  protected readonly signed = signedMoney;

  constructor() {
    queueMicrotask(() => {
      this.load();
      this.api.categories(this.ctx.id()).subscribe({
        next: (categories) => this.categories.set(categories),
      });
    });
  }

  protected setFilter<K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K],
  ): void {
    this.filters.update((f) => ({ ...f, [key]: value || null, pageNumber: 1 }));
    this.load();
  }

  protected goToPage(pageNumber: number): void {
    this.filters.update((f) => ({ ...f, pageNumber }));
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.transactions(this.ctx.id(), this.filters()).subscribe({
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

  protected payer(t: ExpenseListTransaction): string {
    return this.ctx.me()?.memberId === t.paidByMemberId ? 'you' : t.paidByDisplayName;
  }

  protected isMockPayer(t: ExpenseListTransaction): boolean {
    return this.ctx.members().find((m) => m.memberId === t.paidByMemberId)?.isMock ?? false;
  }

  protected myShare(t: ExpenseListTransaction): number | null {
    const memberId = this.ctx.me()?.memberId;
    if (!memberId) return null;
    return t.calculatedShares[memberId] ?? null;
  }

  protected closeEditor(): void {
    this.creating.set(false);
    this.editing.set(null);
  }

  protected afterSave(): void {
    this.closeEditor();
    this.load();
    // totals in the header move with every write
    this.ctx.refresh();
  }

  protected confirmDelete(t: ExpenseListTransaction): void {
    this.busy.set(true);
    this.api.deleteTransaction(this.ctx.id(), t.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toasts.ok('Transaction deleted.');
        this.load();
        this.ctx.refresh();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toasts.error(toApiError(err).message);
      },
    });
  }
}
