import { Component, inject, signal } from '@angular/core';

import { ExpenseListApi } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { money, shortDate } from '../../core/format';
import { Paginated, Settlement } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmComponent } from '../../shared/dialog';
import { EmptyStateComponent, PagerComponent } from '../../shared/ui';
import { ListContext } from './list-context';
import { SettlementDialog } from './settlement-dialog';

@Component({
  selector: 'app-tab-settlements',
  imports: [ConfirmComponent, EmptyStateComponent, PagerComponent, SettlementDialog],
  template: `
    <div class="row" style="justify-content:flex-end;margin-bottom:12px">
      @if (ctx.canEdit()) {
        <button class="btn btn--sm btn--primary" type="button" (click)="creating.set(true)">+ Record a settlement</button>
      }
    </div>

    @if (loading()) {
      <div class="card" style="padding:16px"><div class="skeleton" style="width:100%;height:44px"></div></div>
    } @else if (page(); as p) {
      @if (!p.items.length) {
        <div class="card">
          <app-empty-state
            title="No settlements yet"
            text="When someone pays another member back, record it here and the balances update."
            glyph="🤝"
          >
            @if (ctx.canEdit()) {
              <button class="btn btn--primary" type="button" (click)="creating.set(true)">+ Record a settlement</button>
            }
          </app-empty-state>
        </div>
      } @else {
        <div class="card" style="padding:8px">
          @for (s of p.items; track s.id) {
            <div class="brow">
              <div class="cat-icon" style="background:var(--income-soft)">🤝</div>
              <div style="min-width:0;flex:1">
                <div style="font-weight:700;font-size:14.5px">
                  <b>{{ s.fromDisplayName }}</b> <span style="color:var(--muted);font-weight:600">paid</span> <b>{{ s.toDisplayName }}</b>
                </div>
                <div class="hint" style="color:var(--muted);margin-top:1px">
                  {{ date(s.settledAt) }}@if (s.note) {<span> · {{ s.note }}</span>}
                </div>
              </div>
              <div class="money money--income" style="font-size:15px">{{ fmt(s.amount) }}</div>
              @if (canDelete(s)) {
                <button class="icon-btn icon-btn--danger" type="button" title="Delete settlement" (click)="deleting.set(s)">×</button>
              }
            </div>
          }
        </div>

        <div style="margin-top:14px">
          <app-pager
            [page]="p.pageNumber"
            [totalPages]="p.totalPages"
            [total]="p.totalCount"
            noun="settlements"
            (go)="goToPage($event)"
          />
        </div>
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
