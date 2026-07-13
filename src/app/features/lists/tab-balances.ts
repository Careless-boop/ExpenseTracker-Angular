import { Component, inject, signal } from '@angular/core';

import { ExpenseListApi } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { money, signedBalance } from '../../core/format';
import { Debt, ExpenseListBalances } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent, EmptyStateComponent } from '../../shared/ui';
import { ListContext } from './list-context';
import { SettlementDialog, SettlementSeed } from './settlement-dialog';

@Component({
  selector: 'app-tab-balances',
  imports: [AvatarComponent, EmptyStateComponent, SettlementDialog],
  template: `
    @if (loading()) {
      <div class="panel__body">
        <div class="skeleton" style="width:100%;height:50px"></div>
        <div class="skeleton" style="width:100%;height:50px;margin-top:10px"></div>
      </div>
    } @else if (balances(); as b) {
      <div class="panel__head">
        <div class="panel__title">Balances</div>
        <div class="spacer"></div>
        <div class="hint">Balances always sum to exactly zero.</div>
      </div>

      @for (m of b.memberBalances; track m.memberId) {
        <div class="list-row">
          <app-avatar [name]="m.displayName" [isMock]="m.isMock" />
          <div class="list-row__main">
            <div class="row" style="gap:6px">
              <span class="list-row__title">{{ m.displayName }}</span>
              @if (m.isMock) {
                <span class="badge badge--placeholder">no account yet</span>
              }
            </div>
            <div class="list-row__meta">
              paid {{ fmt(m.totalPaid) }} · share {{ fmt(m.totalShare) }}
            </div>
          </div>

          <div class="verdict" [class.is-owed]="m.balance > 0" [class.is-owing]="m.balance < 0">
            {{ m.balance > 0 ? 'is owed' : m.balance < 0 ? 'owes' : 'settled up' }}
          </div>

          <div
            class="list-row__amount"
            [class.money--income]="m.balance > 0"
            [class.money--expense]="m.balance < 0"
          >
            {{ signed(m.balance) }}
          </div>
        </div>
      }

      <div class="panel__head" style="border-top:1px solid var(--panel-head-border)">
        <div class="panel__title">Settle up</div>
        <div class="spacer"></div>
        <div class="hint">The minimal set of transfers that clears everything.</div>
      </div>

      @if (!b.simplifiedDebts.length) {
        <app-empty-state
          title="All settled up 🎉"
          text="Nobody owes anybody anything in this list."
          glyph="✓"
        />
      } @else {
        @for (d of b.simplifiedDebts; track d.fromMemberId + d.toMemberId) {
          <div class="list-row">
            <app-avatar
              [name]="d.fromDisplayName"
              [isMock]="isMock(d.fromMemberId)"
              size="sm"
            />
            <div class="list-row__main">
              <div class="list-row__title">
                {{ name(d.fromMemberId, d.fromDisplayName) }} pays
                {{ name(d.toMemberId, d.toDisplayName) }}
              </div>
            </div>
            <div class="list-row__amount money--neutral">{{ fmt(d.amount) }}</div>
            @if (ctx.canEdit()) {
              @if (canSettle(d)) {
                <button class="btn btn--sm btn--green" type="button" (click)="settle(d)">
                  Settle
                </button>
              } @else {
                <!-- you cannot record a payment in another real user's name -->
                <span class="hint">only {{ d.fromDisplayName }} can record this</span>
              }
            }
          </div>
        }
      }
    }

    @if (seed(); as s) {
      <app-settlement-dialog [seed]="s" (saved)="afterSettle()" (cancelled)="seed.set(null)" />
    }
  `,
  styles: `
    .verdict {
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);

      &.is-owed {
        color: var(--income);
      }

      &.is-owing {
        color: var(--expense);
      }
    }
  `,
})
export class TabBalancesComponent {
  protected readonly ctx = inject(ListContext);
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);

  protected readonly balances = signal<ExpenseListBalances | null>(null);
  protected readonly loading = signal(true);
  protected readonly seed = signal<SettlementSeed | null>(null);

  protected readonly fmt = money;
  protected readonly signed = signedBalance;

  constructor() {
    queueMicrotask(() => this.load());
  }

  protected load(): void {
    this.loading.set(true);
    this.api.balances(this.ctx.id()).subscribe({
      next: (balances) => {
        this.balances.set(balances);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.toasts.error(toApiError(err).message);
      },
    });
  }

  protected name(memberId: string, fallback: string): string {
    return this.ctx.me()?.memberId === memberId ? 'You' : fallback;
  }

  protected isMock(memberId: string): boolean {
    return this.ctx.members().find((m) => m.memberId === memberId)?.isMock ?? false;
  }

  /** You may only record a payment made by yourself or by a placeholder. */
  protected canSettle(d: Debt): boolean {
    return this.ctx.me()?.memberId === d.fromMemberId || this.isMock(d.fromMemberId);
  }

  /** Opens the settlement form pre-filled from the debt row. */
  protected settle(d: Debt): void {
    this.seed.set({
      fromMemberId: d.fromMemberId,
      toMemberId: d.toMemberId,
      amount: d.amount,
    });
  }

  protected afterSettle(): void {
    this.seed.set(null);
    this.load();
  }
}
