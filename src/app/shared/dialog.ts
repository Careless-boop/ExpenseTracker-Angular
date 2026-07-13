import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-dialog',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <div class="scrim" (click)="onScrim($event)">
      <div
        class="dialog"
        [class.dialog--sm]="size() === 'sm'"
        [class.dialog--lg]="size() === 'lg'"
        role="dialog"
        aria-modal="true"
      >
        <div class="dialog__head">
          <div class="dialog__title">{{ title() }}</div>
          <button class="dialog__close" type="button" aria-label="Close" (click)="closed.emit()">
            ✕
          </button>
        </div>
        <div class="dialog__body">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class DialogComponent {
  readonly title = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly closed = output<void>();

  protected onScrim(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('scrim')) {
      this.closed.emit();
    }
  }
}

/** Destructive / irreversible confirmations. Gold = irreversible, red = destructive. */
@Component({
  selector: 'app-confirm',
  imports: [DialogComponent],
  template: `
    <app-dialog [title]="title()" size="sm" (closed)="cancelled.emit()">
      <div class="hint" style="line-height:1.65">
        <ng-content />
      </div>
      <div class="dialog__foot">
        <button class="btn" type="button" (click)="cancelled.emit()">Cancel</button>
        <button
          class="btn"
          [class.btn--red]="tone() === 'danger'"
          [class.btn--gold]="tone() === 'irreversible'"
          [class.btn--primary]="tone() === 'normal'"
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
