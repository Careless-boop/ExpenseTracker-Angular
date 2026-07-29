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
        <div class="empty" style="max-width:460px;margin:64px auto">
          <div style="font-size:44px;font-weight:800;color:var(--faint)">404</div>
          <div class="empty__title">This list can't be found</div>
          <div class="empty__text">It may have been deleted, or the link is wrong.</div>
          <div class="empty__actions">
            <a class="btn btn--primary" routerLink="/lists">Back to my lists</a>
          </div>
        </div>
      } @else if (ctx.detail(); as list) {
        <a class="back" routerLink="/lists" data-hide-mobile>← All lists</a>

        <!-- a closed list is frozen: every write endpoint returns 400 -->
        @if (ctx.isClosed()) {
          <div class="banner banner--muted">
            <div class="banner__icon">🔒</div>
            <div class="banner__body">
              <div class="banner__title">Closed on {{ date(list.closedAt!) }} — this list is read-only</div>
              <div class="banner__text">
                Everyone's share has been added to their personal transactions under a
                “{{ list.name }}” category.
              </div>
            </div>
            @if (ctx.isOwner()) {
              <button class="btn btn--sm btn--ghost" type="button" (click)="reopening.set(true)">Reopen list</button>
            }
          </div>
        }

        <!-- claim: you're a member, but placeholders exist that might be you -->
        @if (!ctx.isClosed() && ctx.claimable().length) {
          <div class="banner banner--warn">
            <div class="banner__icon">👋</div>
            <div class="banner__body">
              <div class="banner__title">Are you one of these people?</div>
              <div class="banner__text">
                {{ ctx.claimable().length }}
                {{ ctx.claimable().length === 1 ? 'placeholder is' : 'placeholders are' }} not linked
                to an account. Claim yours to inherit its expenses and settlements.
              </div>
            </div>
            <div class="row">
              @for (m of ctx.claimable(); track m.memberId) {
                <button class="btn btn--sm btn--ghost" type="button" (click)="claim(m.memberId, m.displayName)">
                  I'm {{ m.displayName }}
                </button>
              }
            </div>
          </div>
        }

        <header class="lhead">
          <div class="lhead__emoji">{{ emoji(list.id) }}</div>
          <div style="min-width:0">
            <div class="row" style="gap:10px">
              <h1 style="font-size:24px">{{ list.name }}</h1>
              <span [class]="'badge badge--' + list.currentUserRole.toLowerCase()">{{ list.currentUserRole }}</span>
              @if (ctx.isClosed()) {
                <span class="badge badge--closed">Closed</span>
              }
            </div>
            <div class="page-sub" style="margin-top:3px">
              {{ list.description || (list.members.length + ' members') }} · {{ list.currency }}
            </div>
          </div>

          <div class="lhead__right">
            <div>
              <div class="section-label">SPENT</div>
              <div class="money" style="font-size:19px">{{ fmt(list.totalExpenses) }}</div>
            </div>
            <div>
              <div class="section-label">RECEIVED</div>
              <div class="money money--income" style="font-size:19px">{{ fmt(list.totalIncome) }}</div>
            </div>
            <div class="avatar-stack">
              @for (m of list.members.slice(0, 5); track m.memberId) {
                <app-avatar [name]="m.displayName" [isMock]="m.isMock" size="sm" />
              }
            </div>
            @if (ctx.canManage()) {
              <div class="row" style="gap:8px">
                <button class="btn btn--sm btn--ghost" type="button" (click)="openEdit(list)">Edit</button>
                <button class="btn btn--sm btn--ghost" type="button" (click)="closing.set(true)">Close list</button>
                <button class="icon-btn icon-btn--danger" type="button" title="Delete list" (click)="deleting.set(true)">×</button>
              </div>
            } @else if (ctx.isClosed() && ctx.isOwner()) {
              <button class="btn btn--sm btn--ghost" type="button" (click)="reopening.set(true)">Reopen list</button>
            }
          </div>
        </header>

        <div class="tabs">
          <a class="tab" routerLink="transactions" routerLinkActive="is-active">Transactions</a>
          <a class="tab" routerLink="balances" routerLinkActive="is-active">Balances</a>
          <a class="tab" routerLink="categories" routerLinkActive="is-active">Categories</a>
          <a class="tab" routerLink="members" routerLinkActive="is-active">Members</a>
          <a class="tab" routerLink="settlements" routerLinkActive="is-active">Settlements</a>
        </div>
        <router-outlet />
      } @else {
        <div class="card" style="padding:24px">
          <div class="skeleton" style="width:40%;height:22px"></div>
          <div class="skeleton" style="width:70%;margin-top:14px"></div>
        </div>
      }
    </div>

    @if (editing()) {
      <app-dialog title="Edit list" size="sm" (closed)="editing.set(false)">
        <div class="field">
          <label class="label">Name</label>
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
          <label class="label">Description <span>(optional)</span></label>
          <input
            class="input"
            type="text"
            maxlength="1000"
            [ngModel]="editDescription()"
            (ngModelChange)="editDescription.set($event)"
          />
        </div>

        <div class="field">
          <label class="label">Currency</label>
          <select class="select" [ngModel]="editCurrency()" (ngModelChange)="editCurrency.set($event)">
            @for (c of currencies; track c.code) {
              <option [value]="c.code">{{ c.code }} ({{ c.symbol }})</option>
            }
          </select>
          <div class="hint">Changes how this list's amounts are shown. Values aren't converted.</div>
        </div>

        <div class="dialog__foot">
          <button class="btn btn--ghost" type="button" (click)="editing.set(false)">Cancel</button>
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
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
      &:hover {
        color: var(--accent-3);
      }
    }

    .lhead {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .lhead__emoji {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      background: linear-gradient(120deg, #f3d9c8, #e9b99c);
      display: grid;
      place-items: center;
      font-size: 26px;
      flex-shrink: 0;
    }

    .lhead__right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
    }

    @media (max-width: 720px) {
      .lhead {
        flex-direction: column;
        align-items: flex-start;
      }
      .lhead__right {
        margin-left: 0;
        width: 100%;
      }
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

  private readonly listEmoji = ['✈️', '🏠', '🎾', '🏔️', '🎂', '🍽️', '🚗', '⛺', '🛒', '🎉'];
  protected emoji(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return this.listEmoji[h % this.listEmoji.length];
  }

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
