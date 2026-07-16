import { Component, inject, output, signal } from '@angular/core';

import { ExpenseListApi } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { money } from '../../core/format';
import { MemberBalance } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { DialogComponent } from '../../shared/dialog';
import { AvatarComponent } from '../../shared/ui';
import { ListContext } from './list-context';

/**
 * Closing is not archiving — it files everyone's share into their personal
 * ledger — so this is an explanatory dialog with a per-member preview rather
 * than a plain confirm.
 */
@Component({
  selector: 'app-close-list-dialog',
  imports: [DialogComponent, AvatarComponent],
  template: `
    <app-dialog title="Close this list?" (closed)="closed.emit()">
      <div class="callout callout--warn">
        <strong>Closing freezes the list.</strong> It becomes read-only for everyone, and each
        member's share of the expenses is copied into their personal transactions under a new
        category named after this list.
      </div>

      <div>
        <div class="panel__label" style="margin-bottom:8px">What each member will be filed</div>

        @if (loading()) {
          <div class="skeleton" style="width:100%;height:40px"></div>
        } @else {
          <div class="preview">
            @for (b of shares(); track b.memberId) {
              <div class="preview__row">
                <app-avatar [name]="b.displayName" [isMock]="b.isMock" size="sm" />
                <span style="flex:1">{{ b.displayName }}</span>
                @if (b.isMock) {
                  <span class="badge badge--placeholder">skipped — no account</span>
                } @else {
                  <span class="money money--expense">{{ fmt(b.totalShare) }}</span>
                }
              </div>
            }
          </div>
        }

        <div class="hint" style="margin-top:8px">
          Placeholders are skipped — they have no account and no personal ledger. Members who turned
          the setting off in their own Settings are skipped too.
        </div>
      </div>

      <div class="dialog__foot">
        <button class="btn" type="button" (click)="closed.emit()">Cancel</button>
        <button class="btn btn--gold btn--wide" type="button" [disabled]="busy()" (click)="close()">
          Close the list
        </button>
      </div>
    </app-dialog>
  `,
  styles: `
    .preview {
      border: 1px solid var(--row-border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .preview__row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      font-size: 12px;
      border-bottom: 1px solid var(--row-border);

      &:last-child {
        border-bottom: none;
      }

      &:nth-child(even) {
        background: var(--row-zebra);
      }
    }
  `,
})
export class CloseListDialog {
  readonly closed = output<void>();
  readonly done = output<void>();

  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);
  protected readonly ctx = inject(ListContext);

  protected readonly shares = signal<MemberBalance[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);

  protected readonly fmt = (n: number) => money(n, this.ctx.currency());

  constructor() {
    this.api.balances(this.ctx.id()).subscribe({
      next: (balances) => {
        this.shares.set(balances.memberBalances);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected close(): void {
    this.busy.set(true);
    this.api.close(this.ctx.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.ok('List closed. Shares have been filed to personal transactions.');
        this.done.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toasts.error(toApiError(err).message);
      },
    });
  }
}
