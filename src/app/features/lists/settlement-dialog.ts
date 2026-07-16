import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ExpenseListApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { currencySymbol } from '../../core/currencies';
import { money } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { DialogComponent } from '../../shared/dialog';
import { ListContext } from './list-context';

export interface SettlementSeed {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/**
 * fromMemberId defaults to the current user ("I paid them back") and may only be
 * set to a *mock* member — you cannot fabricate a payment in another real user's
 * name (the API returns 403). So the "paid by" picker offers you + placeholders,
 * and that constraint is the whole feature.
 */
@Component({
  selector: 'app-settlement-dialog',
  imports: [FormsModule, DialogComponent],
  template: `
    <app-dialog title="Record a settlement" size="sm" (closed)="cancelled.emit()">
      <div class="field">
        <label class="field__label">
          Paid by <span>— only you or a placeholder</span>
        </label>
        <select class="select" [ngModel]="fromMemberId()" (ngModelChange)="fromMemberId.set($event)">
          @for (m of payers(); track m.memberId) {
            <option [ngValue]="m.memberId">
              {{ m.displayName }}{{ m.isMock ? ' — placeholder' : ' (you)' }}
            </option>
          }
        </select>
      </div>

      <div class="field">
        <label class="field__label">Paid to</label>
        <select class="select" [ngModel]="toMemberId()" (ngModelChange)="toMemberId.set($event)">
          <option [ngValue]="''">Choose a member…</option>
          @for (m of recipients(); track m.memberId) {
            <option [ngValue]="m.memberId">{{ m.displayName }}</option>
          }
        </select>
        @if (fieldError('toMemberId'); as msg) {
          <div class="field__error">{{ msg }}</div>
        }
      </div>

      <div class="field">
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
        <label class="field__label">Note <span>(≤ 500, optional)</span></label>
        <input
          class="input"
          type="text"
          maxlength="500"
          [ngModel]="note()"
          (ngModelChange)="note.set($event)"
        />
      </div>

      @if (sameMember()) {
        <div class="callout callout--bad">You can't settle with yourself.</div>
      }

      <div class="dialog__foot">
        <button class="btn" type="button" (click)="cancelled.emit()">Cancel</button>
        <button
          class="btn btn--green btn--wide"
          type="button"
          [disabled]="!canSave()"
          (click)="save()"
        >
          Record settlement
        </button>
      </div>
    </app-dialog>
  `,
})
export class SettlementDialog {
  readonly seed = input<SettlementSeed | null>(null);

  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly ctx = inject(ListContext);
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);

  protected readonly fromMemberId = signal('');
  protected readonly toMemberId = signal('');
  protected readonly amount = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly fmt = (n: number) => money(n, this.ctx.currency());
  protected readonly symbol = computed(() => currencySymbol(this.ctx.currency()));

  /** You, plus every placeholder — nobody else. */
  protected readonly payers = computed(() => {
    const me = this.ctx.me();
    return [...(me ? [me] : []), ...this.ctx.mockMembers()];
  });

  protected readonly recipients = computed(() =>
    this.ctx.members().filter((m) => m.memberId !== this.fromMemberId()),
  );

  protected readonly sameMember = computed(
    () => !!this.toMemberId() && this.toMemberId() === this.fromMemberId(),
  );

  protected readonly canSave = computed(() => {
    const value = Number(this.amount());
    return (
      !this.busy() &&
      !!this.fromMemberId() &&
      !!this.toMemberId() &&
      !this.sameMember() &&
      Number.isFinite(value) &&
      value > 0
    );
  });

  constructor() {
    queueMicrotask(() => {
      const seed = this.seed();
      const me = this.ctx.me();
      this.fromMemberId.set(seed?.fromMemberId ?? me?.memberId ?? '');
      this.toMemberId.set(seed?.toMemberId ?? '');
      this.amount.set(seed ? seed.amount.toFixed(2) : '');
    });
  }

  protected save(): void {
    if (!this.canSave()) return;

    this.busy.set(true);
    this.error.set(null);

    const me = this.ctx.me();
    const from = this.fromMemberId();

    this.api
      .createSettlement(this.ctx.id(), {
        toMemberId: this.toMemberId(),
        amount: Number(this.amount()),
        note: this.note().trim() || null,
        // omit when it's just "I paid them back"
        fromMemberId: from === me?.memberId ? null : from,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toasts.ok('Settlement recorded.');
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
