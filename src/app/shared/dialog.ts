import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-dialog',
  // Closes only on Escape or an explicit action — never on a backdrop click, so a
  // stray tap outside a half-filled form can't discard it.
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <div class="scrim">
      <div
        class="dialog"
        [class.dialog--sm]="size() === 'sm'"
        [class.dialog--lg]="size() === 'lg'"
        role="dialog"
        aria-modal="true"
      >
        <div class="dialog__head">
          <div class="dialog__title">{{ title() }}</div>
        </div>
        @if (sub()) {
          <div class="dialog__sub">{{ sub() }}</div>
        }
        <div class="dialog__body">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class DialogComponent {
  readonly title = input.required<string>();
  readonly sub = input<string>('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly closed = output<void>();
}

/** Confirmation dialog for destructive / irreversible actions. */
@Component({
  selector: 'app-confirm',
  imports: [DialogComponent],
  template: `
    <app-dialog [title]="title()" size="sm" (closed)="cancelled.emit()">
      <div class="hint" style="font-size:14px;color:var(--muted);line-height:1.55">
        <ng-content />
      </div>
      <div class="dialog__foot">
        <button class="btn btn--ghost" type="button" (click)="cancelled.emit()">Cancel</button>
        <button
          class="btn"
          [class.btn--red]="tone() === 'danger'"
          [class.btn--primary]="tone() !== 'danger'"
          type="button"
          [disabled]="busy()"
          (click)="confirmed.emit()"
        >
          {{ confirmLabel() }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class ConfirmComponent {
  readonly title = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly tone = input<'danger' | 'irreversible' | 'normal'>('danger');
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
