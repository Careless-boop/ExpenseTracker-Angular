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

      <div class="split">
        <div class="panel__head">
          <div class="panel__title" style="font-size:13px">Split between</div>
          <div class="spacer"></div>
          <button class="btn btn--xs" type="button" (click)="everyoneEqually()">
            Everyone, equally
          </button>
        </div>

        @for (row of rows(); track row.memberId) {
          <div class="split__row" [class.is-out]="!row.included">
            <input
              class="checkbox"
              type="checkbox"
              [checked]="row.included"
              (change)="toggle(row.memberId)"
            />
            <app-avatar [name]="row.displayName" [isMock]="row.isMock" size="sm" />
            <div class="split__name">
              {{ row.displayName }}
              @if (isMe(row.memberId)) {
                <span style="font-weight:normal;color:var(--muted-2)">(you)</span>
              }
              @if (row.isMock) {
                <span class="badge badge--placeholder">placeholder</span>
              }
            </div>

            @if (row.included) {
              <div class="segmented segmented--sm">
                <button
                  type="button"
                  [class.is-active]="row.mode === 'equal'"
                  (click)="setMode(row.memberId, 'equal')"
                >
                  Equal
                </button>
                <button
                  type="button"
                  [class.is-active]="row.mode === 'custom'"
                  (click)="setMode(row.memberId, 'custom')"
                >
                  Custom
                </button>
              </div>

              @if (row.mode === 'custom') {
                <div class="money-input money-input--sm">
                  <div class="money-input__addon">{{ symbol() }}</div>
                  <input
                    type="text"
                    inputmode="decimal"
                    [ngModel]="row.amount"
                    (ngModelChange)="setAmount(row.memberId, $event)"
                  />
                </div>
              }

              <!-- the real per-person number, never a rounded average -->
              <div class="split__share">
                @if (submittable()) {
                  <div>
                    {{ type() === 'Income' ? 'gets' : 'owes' }} {{ fmt(shareOf(row.memberId)) }}
                  </div>
                  <!-- keep the custom amount visible next to the rest it absorbed -->
                  @if (extraOf(row.memberId); as extra) {
                    <div class="split__breakdown">
                      {{ fmt(+row.amount) }} + {{ fmt(extra) }}
                    </div>
                  }
                } @else {
                  —
                }
              </div>
            } @else {
              <div class="split__share" style="color:var(--muted-2)">not included</div>
            }
          </div>
        }

        <!--
          Offered only when every participant is custom — with an equal-share participant
          present the rest already goes to them, and the API rejects the flag.
        -->
        @if (split().allCustom && total() > 0) {
          <label class="split-rest">
            <input
              class="checkbox"
              type="checkbox"
              [checked]="splitRemainder()"
              (change)="toggleSplitRemainder()"
            />
            Split the rest between them
            <span>— divide whatever the custom shares don't cover</span>
          </label>
        }

        <!-- running reconciliation; submit stays disabled until it balances -->
        @if (split(); as s) {
          <div
            class="reconcile"
            [class.reconcile--ok]="s.state === 'ok'"
            [class.reconcile--warn]="s.state === 'partial'"
            [class.reconcile--bad]="s.state === 'short' || s.state === 'over'"
          >
            <div class="reconcile__dot">
              {{ s.state === 'ok' ? '✓' : s.state === 'partial' ? '≈' : '!' }}
            </div>
            <div class="reconcile__text">{{ reconcileText() }}</div>
            <div class="reconcile__sum">
              {{ fmt(submittable() ? total() : s.customTotal) }} / {{ fmt(total()) }}
            </div>
          </div>
        }
      </div>

      @if (fieldError('participants'); as msg) {
        <div class="field__error">{{ msg }}</div>
      }

      <div class="dialog__foot">
        <button class="btn" type="button" (click)="cancelled.emit()">Cancel</button>
        <button
          class="btn btn--primary btn--wide"
          type="button"
          [disabled]="!canSave()"
          (click)="save()"
        >
          Save transaction
        </button>
      </div>
    </app-dialog>
  `,
  styles: `
    .split {
      border: 1px solid var(--panel-head-border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .split__row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 16px;
      border-bottom: 1px solid var(--row-border);
      flex-wrap: wrap;

      &:nth-child(even) {
        background: var(--row-zebra);
      }

      &.is-out {
        opacity: 0.55;
      }
    }

    .split__name {
      flex: 1;
      min-width: 90px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: bold;
      color: var(--text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .split__share {
      width: 86px;
      text-align: right;
      font-size: 12px;
      font-weight: bold;
      color: var(--accent);
    }

    .split__breakdown {
      margin-top: 2px;
      font-size: 10px;
      font-weight: normal;
      color: var(--muted);
      white-space: nowrap;
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
      // the API rejects the flag unless every participant carries a custom share
      splitRemainder: this.splitRemainder() && this.split().allCustom,
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
