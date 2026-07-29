import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { ExpenseListApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { currencySymbol } from '../../core/currencies';
import { dateInputValue, money, toIsoDate } from '../../core/format';
import {
  ExpenseListCategory,
  ExpenseListTransaction,
  ParticipantInput,
  TransactionType,
} from '../../core/models';
import { calculateSplit } from '../../core/split';
import { ToastService } from '../../core/toast.service';
import { DialogComponent } from '../../shared/dialog';
import { AvatarComponent } from '../../shared/ui';
import { ListContext } from './list-context';

interface Row {
  memberId: string;
  displayName: string;
  isMock: boolean;
  included: boolean;
  mode: 'equal' | 'custom';
  amount: string;
}

@Component({
  selector: 'app-split-editor',
  imports: [FormsModule, DialogComponent, AvatarComponent],
  template: `
    <app-dialog
      [title]="(editing() ? 'Edit' : 'Add') + ' transaction — ' + (ctx.detail()?.name ?? '')"
      (closed)="cancelled.emit()"
    >
      <div class="row" style="gap:14px;align-items:flex-start">
        <div class="field" style="flex:1;min-width:140px">
          <label class="field__label">Amount</label>
          <div class="money-input" [class.is-invalid]="fieldError('amount')">
            <div class="money-input__addon">{{ symbol() }}</div>
            <input
              type="text"
              inputmode="decimal"
              [ngModel]="amount()"
              (ngModelChange)="amount.set($event)"
              placeholder="0.00"
            />
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
              [class.is-active]="type() === 'Expense'"
              (click)="type.set('Expense')"
            >
              Expense
            </button>
            <button
              type="button"
              class="is-income"
              [class.is-active]="type() === 'Income'"
              (click)="type.set('Income')"
            >
              Income
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field__label">Date</label>
          <input
            class="input input--auto"
            type="date"
            [ngModel]="date()"
            (ngModelChange)="date.set($event)"
          />
        </div>
      </div>

      <!-- income in a shared list moves balances the opposite way; say so -->
      @if (type() === 'Income') {
        <div class="callout callout--info">
          💡 Income here is money <strong>received on the group's behalf</strong> — a refund or a
          deposit back. It moves balances the <strong>opposite</strong> way to an expense.
        </div>
      }

      <div class="row" style="gap:14px;align-items:flex-start">
        <div class="field field--grow">
          <label class="field__label">Description <span>(≤ 500)</span></label>
          <input
            class="input"
            type="text"
            maxlength="500"
            [ngModel]="description()"
            (ngModelChange)="description.set($event)"
          />
        </div>

        <div class="field" style="min-width:170px">
          <label class="field__label">Category</label>
          <select
            class="select"
            [ngModel]="categoryId()"
            (ngModelChange)="categoryId.set($event)"
          >
            <option [ngValue]="null">Other (default)</option>
            @for (c of categories(); track c.id) {
              <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option>
            }
          </select>
        </div>
      </div>

      <div class="field">
        <label class="field__label">
          {{ type() === 'Income' ? 'Received by' : 'Paid by' }}
          <span>— any member, including placeholders</span>
        </label>
        <select
          class="select"
          [ngModel]="paidByMemberId()"
          (ngModelChange)="paidByMemberId.set($event)"
        >
          @for (m of ctx.members(); track m.memberId) {
            <option [ngValue]="m.memberId">
              {{ m.displayName }}{{ isMe(m.memberId) ? ' (you)' : '' }}{{
                m.isMock ? ' — placeholder, no account' : ''
              }}
            </option>
          }
        </select>
      </div>

      <div>
        <div class="row" style="margin-bottom:8px">
          <label class="label">Split between</label>
          <button class="btn btn--xs btn--ghost" type="button" style="margin-left:auto" (click)="everyoneEqually()">
            Everyone, equally
          </button>
        </div>

        <div class="split-box">
          @for (row of rows(); track row.memberId) {
            <div class="split-row" [class.is-out]="!row.included">
              <button
                class="checkbtn"
                type="button"
                [class.is-on]="row.included"
                (click)="toggle(row.memberId)"
              >
                {{ row.included ? '✓' : '' }}
              </button>
              <app-avatar [name]="row.displayName" [isMock]="row.isMock" size="sm" />
              <div class="split-name">
                {{ row.displayName }}
                @if (isMe(row.memberId)) {
                  <span style="font-weight:600;color:var(--muted)">(you)</span>
                }
                @if (row.isMock) {
                  <span class="badge badge--muted">no account</span>
                }
              </div>

              @if (row.included) {
                <div class="split-share">
                  @if (submittable()) {
                    <div>{{ type() === 'Income' ? 'gets' : 'owes' }} {{ fmt(shareOf(row.memberId)) }}</div>
                    @if (extraOf(row.memberId); as extra) {
                      <div class="split-break">{{ fmt(+row.amount) }} + {{ fmt(extra) }}</div>
                    }
                  }
                </div>
                <div class="mini-money" [class.is-active]="row.mode === 'custom'">
                  <span>{{ symbol() }}</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    placeholder="equal"
                    [ngModel]="row.mode === 'custom' ? row.amount : ''"
                    (ngModelChange)="onCustomInput(row.memberId, $event)"
                  />
                </div>
              } @else {
                <div class="split-share" style="color:var(--faint)">not in</div>
              }
            </div>
          }
        </div>

        <div class="row" style="margin-top:12px;gap:10px">
          <!--
            Offered whenever at least one participant has a custom share. Checked, the leftover is
            split equally among everyone; the API rejects it on an all-equal split.
          -->
          @if (split().hasCustom && total() > 0) {
            <label class="split-rest">
              <button
                class="checkbtn"
                type="button"
                style="width:20px;height:20px"
                [class.is-on]="splitRemainder()"
                (click)="toggleSplitRemainder()"
              >
                {{ splitRemainder() ? '✓' : '' }}
              </button>
              Split the rest equally on top
              <span
                class="split-help"
                title="Custom amounts become contributions off the top; what's left splits equally among everyone."
              >?</span>
            </label>
          }

          @if (split(); as s) {
            <div
              class="reconcile"
              style="margin-left:auto"
              [class.reconcile--ok]="s.state === 'ok'"
              [class.reconcile--warn]="s.state === 'partial'"
              [class.reconcile--bad]="s.state === 'short' || s.state === 'over'"
            >
              {{ reconcileText() }}
            </div>
          }
        </div>
      </div>

      @if (fieldError('participants'); as msg) {
        <div class="field__error">{{ msg }}</div>
      }

      <div class="dialog__foot">
        <button class="btn btn--ghost" type="button" (click)="cancelled.emit()">Cancel</button>
        <button
          class="btn btn--primary btn--wide"
          type="button"
          [disabled]="!canSave()"
          (click)="save()"
        >
          Save expense
        </button>
      </div>
    </app-dialog>
  `,
  styles: `
    .split-box {
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
    }

    .split-row {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 14px;
      border-top: 1px solid var(--line);
      flex-wrap: wrap;

      &:first-child {
        border-top: none;
      }
      &.is-out {
        opacity: 0.55;
      }
    }

    .split-name {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      font-size: 13.5px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .split-share {
      flex-shrink: 0;
      text-align: right;
      font-size: 12.5px;
      font-weight: 700;
      color: var(--accent-3);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .mini-money {
      flex-shrink: 0;
    }

    .split-break {
      font-size: 10.5px;
      font-weight: 500;
      color: var(--muted);
    }

    .split-rest {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-2);
      cursor: pointer;

      span:not(.split-help) {
        color: var(--muted);
        font-weight: 500;
      }
    }

    .split-help {
      width: 17px;
      height: 17px;
      border-radius: 50%;
      background: var(--pill);
      color: var(--label);
      display: inline-grid;
      place-items: center;
      font-size: 11px;
      font-weight: 800;
      cursor: help;
    }

    @media (max-width: 560px) {
      .split-share {
        margin-left: auto;
      }
    }
  `,
})
export class SplitEditorComponent {
  readonly editing = input<ExpenseListTransaction | null>(null);
  readonly categories = input<ExpenseListCategory[]>([]);

  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly ctx = inject(ListContext);
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);

  protected readonly amount = signal('');
  protected readonly type = signal<TransactionType>('Expense');
  protected readonly date = signal(toIsoDate(new Date()));
  protected readonly description = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly paidByMemberId = signal<string>('');
  protected readonly rows = signal<Row[]>([]);
  protected readonly splitRemainder = signal(false);

  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly fmt = (n: number) => money(n, this.ctx.currency());
  protected readonly symbol = computed(() => currencySymbol(this.ctx.currency()));

  protected readonly total = computed(() => {
    const n = Number(this.amount());
    return Number.isFinite(n) && n > 0 ? n : 0;
  });

  protected readonly included = computed(() => this.rows().filter((r) => r.included));

  protected readonly split = computed(() =>
    calculateSplit(
      this.included().map((r) => ({
        memberId: r.memberId,
        customShareAmount: r.mode === 'custom' ? Number(r.amount) || 0 : null,
      })),
      this.total(),
      this.splitRemainder(),
    ),
  );

  /** 'partial' is a legitimate split too — the shortfall is being divided, not ignored. */
  protected readonly submittable = computed(() => {
    const state = this.split().state;
    return state === 'ok' || state === 'partial';
  });

  protected readonly canSave = computed(
    () =>
      !this.busy() &&
      this.total() > 0 &&
      !!this.paidByMemberId() &&
      this.included().length > 0 &&
      this.submittable() &&
      // custom amounts must each be > 0
      this.included().every((r) => r.mode !== 'custom' || Number(r.amount) > 0),
  );

  protected readonly reconcileText = computed(() => {
    const s = this.split();
    const included = this.included();
    const customs = included.filter((r) => r.mode === 'custom');
    const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

    if (this.total() <= 0) return 'Enter an amount to split.';
    if (!included.length) return 'Pick at least one person to split between.';

    if (s.state === 'over') {
      return `${this.fmt(s.over)} over — custom shares exceed the total.`;
    }
    if (s.state === 'short') {
      return `${this.fmt(Math.abs(s.remaining))} short — either make the custom shares sum to the total, or split the rest between them.`;
    }
    if (s.state === 'partial') {
      return `${this.fmt(s.remaining)} left over — it will be split equally between ${people(
        included.length,
      )}, on top of their custom shares.`;
    }
    if (!customs.length) {
      return `Reconciled — split equally between ${people(included.length)}.`;
    }
    if (s.equalCount === 0) {
      return 'Reconciled — custom shares account for the whole amount.';
    }
    if (this.splitRemainder()) {
      return `Reconciled — the remaining ${this.fmt(s.remaining)} splits equally between all ${people(
        included.length,
      )}, on top of each custom share.`;
    }
    return `Reconciled — custom shares ${this.fmt(s.customTotal)}, remaining ${this.fmt(
      s.remaining,
    )} split equally between ${people(s.equalCount)}.`;
  });

  constructor() {
    queueMicrotask(() => this.hydrate());
  }

  private hydrate(): void {
    const tx = this.editing();
    const members = this.ctx.members();
    const me = this.ctx.me();

    if (tx) {
      this.amount.set(tx.amount.toFixed(2));
      this.type.set(tx.type);
      this.date.set(dateInputValue(tx.date));
      this.description.set(tx.description ?? '');
      this.categoryId.set(tx.categoryId);
      this.paidByMemberId.set(tx.paidByMemberId);
      this.splitRemainder.set(tx.splitRemainder);

      const byId = new Map(tx.participants.map((p) => [p.memberId, p]));
      this.rows.set(
        members.map((m) => {
          const p = byId.get(m.memberId);
          return {
            memberId: m.memberId,
            displayName: m.displayName,
            isMock: m.isMock,
            included: !!p,
            mode: p?.customShareAmount != null ? 'custom' : 'equal',
            amount: p?.customShareAmount != null ? p.customShareAmount.toFixed(2) : '',
          };
        }),
      );
      return;
    }

    this.paidByMemberId.set(me?.memberId ?? members[0]?.memberId ?? '');
    this.everyoneEqually();
  }

  /** The one-tap default: everyone, split equally. */
  protected everyoneEqually(): void {
    this.rows.set(
      this.ctx.members().map((m) => ({
        memberId: m.memberId,
        displayName: m.displayName,
        isMock: m.isMock,
        included: true,
        mode: 'equal' as const,
        amount: '',
      })),
    );
    this.splitRemainder.set(false);
  }

  protected toggle(memberId: string): void {
    this.rows.update((rows) =>
      rows.map((r) => (r.memberId === memberId ? { ...r, included: !r.included } : r)),
    );
  }

  protected setMode(memberId: string, mode: 'equal' | 'custom'): void {
    this.rows.update((rows) =>
      rows.map((r) =>
        r.memberId === memberId
          ? { ...r, mode, amount: mode === 'custom' && !r.amount ? '' : r.amount }
          : r,
      ),
    );
  }

  protected setAmount(memberId: string, amount: string): void {
    this.rows.update((rows) =>
      rows.map((r) => (r.memberId === memberId ? { ...r, amount } : r)),
    );
  }

  /** Typing a value switches the row to a custom share; clearing it goes back to equal. */
  protected onCustomInput(memberId: string, value: string): void {
    const mode = value.trim() ? 'custom' : 'equal';
    this.rows.update((rows) =>
      rows.map((r) => (r.memberId === memberId ? { ...r, mode, amount: value } : r)),
    );
  }

  protected toggleSplitRemainder(): void {
    this.splitRemainder.update((on) => !on);
  }

  protected shareOf(memberId: string): number {
    return this.split().shares[memberId] ?? 0;
  }

  /** The slice of the leftover this member absorbed on top of their custom amount. */
  protected extraOf(memberId: string): number | null {
    return this.split().extras[memberId] ?? null;
  }

  protected isMe(memberId: string): boolean {
    return this.ctx.me()?.memberId === memberId;
  }

  protected save(): void {
    if (!this.canSave()) return;

    this.busy.set(true);
    this.error.set(null);

    const participants: ParticipantInput[] = this.included().map((r) => ({
      memberId: r.memberId,
      customShareAmount: r.mode === 'custom' ? Number(r.amount) : null,
    }));

    const body = {
      amount: this.total(),
      description: this.description().trim() || null,
      date: this.date(),
      type: this.type(),
      paidByMemberId: this.paidByMemberId(),
      categoryId: this.categoryId(),
      participants,
      // the API rejects the flag unless at least one participant carries a custom share
      splitRemainder: this.splitRemainder() && this.split().hasCustom,
    };

    const tx = this.editing();
    const request: Observable<unknown> = tx
      ? this.api.updateTransaction(this.ctx.id(), tx.id, body)
      : this.api.createTransaction(this.ctx.id(), body);

    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.ok(tx ? 'Transaction updated.' : 'Transaction added.');
        this.saved.emit();
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
