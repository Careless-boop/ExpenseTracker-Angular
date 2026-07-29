import { Component, inject, signal } from '@angular/core';

import { ExpenseListApi } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { money, signedBalance } from '../../core/format';
import { Debt, ExpenseListBalances } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../shared/ui';
import { ListContext } from './list-context';
import { SettlementDialog, SettlementSeed } from './settlement-dialog';

@Component({
  selector: 'app-tab-balances',
  imports: [AvatarComponent, SettlementDialog],
  template: `
    @if (loading()) {
      <div class="card" style="padding:16px">
        <div class="skeleton" style="width:100%;height:50px"></div>
        <div class="skeleton" style="width:100%;height:50px;margin-top:10px"></div>
      </div>
    } @else if (balances(); as b) {
      <div class="bcols">
        <div class="card" style="padding:8px">
          <div class="section-label" style="padding:12px 14px 6px">WHERE EVERYONE STANDS</div>
          @for (m of b.memberBalances; track m.memberId) {
            <div class="brow">
              <app-avatar [name]="m.displayName" [isMock]="m.isMock" size="sm" />
              <div style="min-width:0;flex:1">
                <div class="row" style="gap:7px">
                  <span style="font-weight:700;font-size:14px">{{ m.displayName }}</span>
                  @if (m.isMock) {
                    <span class="badge badge--muted">NO ACCOUNT</span>
                  }
                </div>
                <div class="hint tnum" style="color:var(--muted);margin-top:1px">paid {{ fmt(m.totalPaid) }} · share {{ fmt(m.totalShare) }}</div>
              </div>
              <div class="money" style="font-size:15px" [style.color]="balanceColor(m.balance)">{{ signed(m.balance) }}</div>
            </div>
          }
          <div class="hint" style="padding:10px 14px;border-top:1px solid var(--line)">Balances always add up to exactly zero.</div>
        </div>

        <div class="card" style="padding:8px">
          <div class="section-label" style="padding:12px 14px 6px">SIMPLEST WAY TO SETTLE UP</div>
          @if (!b.simplifiedDebts.length) {
            <div class="empty" style="padding:40px 20px">
              <div class="empty__glyph">🎉</div>
              <div class="empty__title" style="font-size:15.5px">All settled up!</div>
              <div class="empty__text">Nobody owes anybody anything. Lovely.</div>
            </div>
          } @else {
            @for (d of b.simplifiedDebts; track d.fromMemberId + d.toMemberId) {
              <div class="brow">
                <div style="min-width:0;flex:1;font-size:14px">
                  <b>{{ name(d.fromMemberId, d.fromDisplayName) }}</b>
                  <span style="color:var(--muted)"> pays </span>
                  <b>{{ name(d.toMemberId, d.toDisplayName) }}</b>
                </div>
                <div class="money" style="font-size:15px">{{ fmt(d.amount) }}</div>
                @if (ctx.canEdit() && canSettle(d)) {
                  <button class="btn btn--sm btn--soft" type="button" (click)="settle(d)">Settle</button>
                }
              </div>
            }
            <div class="hint" style="padding:10px 14px;border-top:1px solid var(--line)">
              {{ b.simplifiedDebts.length }} transfers — we've done the maths.
            </div>
          }
        </div>
      </div>
    }

    @if (seed(); as s) {
      <app-settlement-dialog [seed]="s" (saved)="afterSettle()" (cancelled)="seed.set(null)" />
    }
  `,
  styles: `
    .bcols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      align-items: start;
    }
    @media (max-width: 920px) {
      .bcols {
        grid-template-columns: 1fr;
      }
    }
    .brow {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 14px;
      border-radius: 12px;
      &:hover {
        background: var(--row-hover);
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

  protected readonly fmt = (n: number) => money(n, this.ctx.currency());
  protected readonly signed = (n: number) => signedBalance(n, this.ctx.currency());

  protected balanceColor(balance: number): string {
    if (balance > 0) return 'var(--income)';
    if (balance < 0) return 'var(--danger)';
    return 'var(--muted)';
  }

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
