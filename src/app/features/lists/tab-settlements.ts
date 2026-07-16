import { Component, inject, signal } from '@angular/core';

import { ExpenseListApi } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { money, shortDate } from '../../core/format';
import { Paginated, Settlement } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmComponent } from '../../shared/dialog';
import { AvatarComponent, EmptyStateComponent, PagerComponent } from '../../shared/ui';
import { ListContext } from './list-context';
import { SettlementDialog } from './settlement-dialog';

@Component({
  selector: 'app-tab-settlements',
  imports: [
    ConfirmComponent,
    AvatarComponent,
    EmptyStateComponent,
    PagerComponent,
    SettlementDialog,
  ],
  template: `
    <div class="panel__head">
      <div class="panel__title">Settlements</div>
      <div class="spacer"></div>
      @if (ctx.canEdit()) {
        <button class="btn btn--sm btn--green" type="button" (click)="creating.set(true)">
          ＋ Record a settlement
        </button>
      }
    </div>

    @if (loading()) {
      <div class="panel__body"><div class="skeleton" style="width:100%;height:44px"></div></div>
    } @else if (page(); as p) {
      @if (!p.items.length) {
        <app-empty-state
          title="No settlements yet"
          text="When someone pays another member back, record it here and the balances update."
          glyph="↔"
        >
          @if (ctx.canEdit()) {
            <button class="btn btn--green" type="button" (click)="creating.set(true)">
              ＋ Record a settlement
            </button>
          }
        </app-empty-state>
      } @else {
        @for (s of p.items; track s.id) {
          <div class="list-row">
            <app-avatar
              [name]="s.fromDisplayName"
              [isMock]="isMock(s.fromMemberId)"
              size="sm"
            />
            <div class="list-row__main">
              <div class="list-row__title">
                {{ s.fromDisplayName }} → {{ s.toDisplayName }}
              </div>
              <div class="list-row__meta">
                {{ date(s.settledAt) }}
                @if (s.note) {
                  <span>· {{ s.note }}</span>
                }
              </div>
            </div>
            <div class="list-row__amount money--neutral">{{ fmt(s.amount) }}</div>

            <!-- deletable by whoever recorded it, or the owner -->
            @if (canDelete(s)) {
              <div class="list-row__actions">
                <button
                  class="icon-btn icon-btn--danger"
                  type="button"
                  title="Delete"
                  (click)="deleting.set(s)"
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
          noun="settlements"
          (go)="goToPage($event)"
        />
      }
    }

    @if (creating()) {
      <app-settlement-dialog (saved)="afterSave()" (cancelled)="creating.set(false)" />
    }

    @if (deleting(); as target) {
      <app-confirm
        title="Delete settlement"
        confirmLabel="Delete settlement"
        [busy]="busy()"
        (confirmed)="confirmDelete(target)"
        (cancelled)="deleting.set(null)"
      >
        Delete the {{ fmt(target.amount) }} payment from <strong>{{ target.fromDisplayName }}</strong>
        to <strong>{{ target.toDisplayName }}</strong>?
        <strong>This changes everyone's balances.</strong>
      </app-confirm>
    }
  `,
})
export class TabSettlementsComponent {
  protected readonly ctx = inject(ListContext);
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);

  protected readonly page = signal<Paginated<Settlement> | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly pageNumber = signal(1);

  protected readonly creating = signal(false);
  protected readonly deleting = signal<Settlement | null>(null);

  protected readonly fmt = (n: number) => money(n, this.ctx.currency());
  protected readonly date = shortDate;

  constructor() {
    queueMicrotask(() => this.load());
  }

  protected load(): void {
    this.loading.set(true);
    this.api.settlements(this.ctx.id(), this.pageNumber()).subscribe({
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

  protected goToPage(pageNumber: number): void {
    this.pageNumber.set(pageNumber);
    this.load();
  }

  protected isMock(memberId: string): boolean {
    return this.ctx.members().find((m) => m.memberId === memberId)?.isMock ?? false;
  }

  /**
   * The API allows the recorder or the owner. The DTO doesn't say who recorded
   * it, so the closest safe signal is "the payer is me" (the common case) plus
   * the owner, who may delete any of them.
   */
  protected canDelete(s: Settlement): boolean {
    if (this.ctx.isClosed()) return false;
    if (this.ctx.isOwner()) return true;
    return this.ctx.me()?.memberId === s.fromMemberId;
  }

  protected afterSave(): void {
    this.creating.set(false);
    this.load();
  }

  protected confirmDelete(s: Settlement): void {
    this.busy.set(true);
    this.api.deleteSettlement(this.ctx.id(), s.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toasts.ok('Settlement deleted.');
        this.load();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toasts.error(toApiError(err).message);
      },
    });
  }
}
