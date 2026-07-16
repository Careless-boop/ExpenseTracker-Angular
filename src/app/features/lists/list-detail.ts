import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ExpenseListApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { CURRENCIES } from '../../core/currencies';
import { longDate, money } from '../../core/format';
import { ExpenseListDetail } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmComponent, DialogComponent } from '../../shared/dialog';
import { AvatarComponent } from '../../shared/ui';
import { CloseListDialog } from './close-list-dialog';
import { ListContext } from './list-context';

@Component({
  selector: 'app-list-detail',
  providers: [ListContext],
  imports: [
    FormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    AvatarComponent,
    ConfirmComponent,
    DialogComponent,
    CloseListDialog,
  ],
  template: `
    <div class="page">
      @if (ctx.notFound()) {
        <div class="panel" style="max-width:520px;margin:40px auto">
          <div class="empty">
            <div class="not-found">404</div>
            <div class="empty__title">This list can't be found</div>
            <div class="empty__text">
              It may have been deleted, or the link is wrong.
            </div>
            <a class="btn btn--primary btn--sm" routerLink="/lists">Back to my lists</a>
          </div>
        </div>
      } @else if (ctx.detail(); as list) {
        <div class="crumbs"><a routerLink="/lists">Expense Lists</a> › {{ list.name }}</div>

        <div class="panel" style="padding:20px 24px;display:flex;gap:24px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div class="row" style="gap:12px">
              <h1 style="font-size:24px">{{ list.name }}</h1>
              <span [class]="'badge badge--' + list.currentUserRole.toLowerCase()">
                {{ list.currentUserRole }}
              </span>
              @if (ctx.isClosed()) {
                <span class="badge badge--closed">Closed</span>
              }
              <span class="badge badge--soft" title="This list's currency">{{ list.currency }}</span>
            </div>
            @if (list.description) {
              <div class="hint" style="margin-top:4px">{{ list.description }}</div>
            }
          </div>

          <div class="row" style="gap:24px">
            <div>
              <div class="stat__label">Expenses</div>
              <div class="total money--expense">{{ fmt(list.totalExpenses) }}</div>
            </div>
            <div>
              <div class="stat__label">Income</div>
              <div class="total money--income">{{ fmt(list.totalIncome) }}</div>
            </div>
            <div>
              <div class="stat__label">Members</div>
              <div class="avatar-stack" style="margin-top:4px">
                @for (m of list.members.slice(0, 5); track m.memberId) {
                  <app-avatar [name]="m.displayName" [isMock]="m.isMock" />
                }
              </div>
            </div>
          </div>

          @if (ctx.canManage()) {
            <div class="row">
              <button class="btn btn--sm" type="button" (click)="openEdit(list)">Edit…</button>
              <button class="btn btn--gold btn--sm" type="button" (click)="closing.set(true)">
                Close list…
              </button>
              <button class="btn btn--red btn--sm" type="button" (click)="deleting.set(true)">
                Delete
              </button>
            </div>
          } @else if (ctx.isClosed() && ctx.isOwner()) {
            <button class="btn btn--gold btn--sm" type="button" (click)="reopening.set(true)">
              Reopen list…
            </button>
          }
        </div>

        <!-- a closed list is frozen: every write endpoint returns 400 -->
        @if (ctx.isClosed()) {
          <div class="banner banner--gold">
            <div class="banner__icon">🔒</div>
            <div class="banner__body">
              <div class="banner__title">
                Closed on {{ date(list.closedAt!) }} — this list is read-only
              </div>
              <div class="banner__text">
                Each member's share of the expenses was added to their personal transactions, under
                a category named after this list.
              </div>
            </div>
            @if (ctx.isOwner()) {
              <button class="btn btn--sm btn--banner" type="button" (click)="reopening.set(true)">
                Reopen list…
              </button>
            }
          </div>
        }

        <!-- claim: you're a member, but placeholders exist that might be you -->
        @if (!ctx.isClosed() && ctx.claimable().length) {
          <div class="banner banner--gold">
            <div class="banner__icon">👋</div>
            <div class="banner__body">
              <div class="banner__title">Are you one of these people?</div>
              <div class="banner__text">
                {{ ctx.claimable().length }}
                {{ ctx.claimable().length === 1 ? 'placeholder is' : 'placeholders are' }} not linked
                to an account. Claim yours to inherit its expense history.
              </div>
            </div>
            <div class="row">
              @for (m of ctx.claimable(); track m.memberId) {
                <button
                  class="btn btn--sm btn--banner"
                  type="button"
                  (click)="claim(m.memberId, m.displayName)"
                >
                  I'm {{ m.displayName }}
                </button>
              }
            </div>
          </div>
        }

        <div>
          <div class="tabs">
            <a class="tab" routerLink="transactions" routerLinkActive="is-active">Transactions</a>
            <a class="tab" routerLink="balances" routerLinkActive="is-active">Balances</a>
            <a class="tab" routerLink="categories" routerLinkActive="is-active">Categories</a>
            <a class="tab" routerLink="members" routerLinkActive="is-active">Members</a>
            <a class="tab" routerLink="settlements" routerLinkActive="is-active">Settlements</a>
          </div>
          <div class="tab-panel">
            <router-outlet />
          </div>
        </div>
      } @else {
        <div class="panel" style="padding:24px">
          <div class="skeleton" style="width:40%;height:22px"></div>
          <div class="skeleton" style="width:70%;margin-top:14px"></div>
        </div>
      }
    </div>

    @if (editing()) {
      <app-dialog title="Edit list" size="sm" (closed)="editing.set(false)">
        <div class="field">
          <label class="field__label">Name <span>(≤ 200)</span></label>
          <input
            class="input"
            [class.is-invalid]="editError('name')"
            type="text"
            maxlength="200"
            [ngModel]="editName()"
            (ngModelChange)="editName.set($event)"
          />
          @if (editError('name'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="field">
          <label class="field__label">Description <span>(≤ 1000, optional)</span></label>
          <textarea
            class="input"
            rows="3"
            maxlength="1000"
            [ngModel]="editDescription()"
            (ngModelChange)="editDescription.set($event)"
          ></textarea>
        </div>

        <div class="field">
          <label class="field__label">Currency</label>
          <select
            class="select"
            [ngModel]="editCurrency()"
            (ngModelChange)="editCurrency.set($event)"
          >
            @for (c of currencies; track c.code) {
              <option [value]="c.code">{{ c.code }} · {{ c.name }} ({{ c.symbol }})</option>
            }
          </select>
          <div class="hint">Changes how this list's amounts are shown. Values aren't converted.</div>
        </div>

        <div class="dialog__foot">
          <button class="btn" type="button" (click)="editing.set(false)">Cancel</button>
          <button
            class="btn btn--primary btn--wide"
            type="button"
            [disabled]="busy() || !editName().trim()"
            (click)="saveEdit()"
          >
            Save changes
          </button>
        </div>
      </app-dialog>
    }

    @if (closing()) {
      <app-close-list-dialog (closed)="closing.set(false)" (done)="afterClose()" />
    }

    @if (reopening()) {
      <app-confirm
        title="Reopen this list?"
        confirmLabel="Reopen list"
        tone="irreversible"
        [busy]="busy()"
        (confirmed)="reopen()"
        (cancelled)="reopening.set(false)"
      >
        Reopening makes the list editable again and <strong>withdraws the personal transactions
        the close created</strong>, so nobody double-counts their share. Closing it again re-creates
        them, so this is safe to do.
      </app-confirm>
    }

    @if (deleting()) {
      <app-confirm
        title="Delete this list?"
        confirmLabel="Delete list"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="deleting.set(false)"
      >
        This deletes <strong>{{ ctx.detail()?.name }}</strong> along with its members,
        transactions, categories and settlements. This cannot be undone.
      </app-confirm>
    }
  `,
  styles: `
    .total {
      font-family: var(--font-head);
      font-weight: bold;
      font-size: 20px;
    }

    .not-found {
      font-family: var(--font-head);
      font-weight: bold;
      font-size: 34px;
      color: var(--muted-2);
    }
  `,
})
export class ListDetailComponent {
  readonly id = input.required<string>();

  protected readonly ctx = inject(ListContext);
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly closing = signal(false);
  protected readonly reopening = signal(false);
  protected readonly deleting = signal(false);
  protected readonly busy = signal(false);

  protected readonly currencies = CURRENCIES;
  protected readonly editing = signal(false);
  protected readonly editName = signal('');
  protected readonly editDescription = signal('');
  protected readonly editCurrency = signal('USD');
  protected readonly editErrors = signal<ApiError | null>(null);

  protected readonly fmt = (n: number) => money(n, this.ctx.currency());
  protected readonly date = longDate;

  constructor() {
    // `id` is a routed input; read it once the route is resolved.
    queueMicrotask(() => this.ctx.load(this.id()));
  }

  protected openEdit(list: ExpenseListDetail): void {
    this.editErrors.set(null);
    this.editName.set(list.name);
    this.editDescription.set(list.description ?? '');
    this.editCurrency.set(list.currency);
    this.editing.set(true);
  }

  protected editError(field: string): string | null {
    return this.editErrors()?.fieldErrors[field]?.[0] ?? null;
  }

  protected saveEdit(): void {
    const list = this.ctx.detail();
    if (!list || !this.editName().trim()) return;

    this.busy.set(true);
    this.editErrors.set(null);

    this.api
      .update(this.ctx.id(), {
        name: this.editName().trim(),
        description: this.editDescription().trim() || null,
        // cover image isn't edited here; preserve whatever the list already has
        coverImage: list.coverImage,
        currency: this.editCurrency(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.editing.set(false);
          this.toasts.ok('List updated.');
          this.ctx.refresh();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          const apiError = toApiError(err);
          this.editErrors.set(apiError);
          if (!Object.keys(apiError.fieldErrors).length) {
            this.toasts.error(apiError.message);
          }
        },
      });
  }

  protected claim(mockMemberId: string, name: string): void {
    this.api.claim(this.ctx.id(), mockMemberId).subscribe({
      next: () => {
        this.toasts.ok(`You are now ${name} — their history is yours.`);
        this.ctx.refresh();
      },
      error: (err: unknown) => this.toasts.error(toApiError(err).message),
    });
  }

  protected afterClose(): void {
    this.closing.set(false);
    this.ctx.refresh();
  }

  protected reopen(): void {
    this.busy.set(true);
    this.api.reopen(this.ctx.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.reopening.set(false);
        this.toasts.ok('List reopened. The personal transactions have been withdrawn.');
        this.ctx.refresh();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.reopening.set(false);
        this.toasts.error(toApiError(err).message);
      },
    });
  }

  protected remove(): void {
    this.busy.set(true);
    this.api.remove(this.ctx.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.ok('List deleted.');
        void this.router.navigate(['/lists']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleting.set(false);
        this.toasts.error(toApiError(err).message);
      },
    });
  }
}
