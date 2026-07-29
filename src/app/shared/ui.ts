import { Component, computed, inject, input, output } from '@angular/core';

import { ToastService } from '../core/toast.service';
import { avatarGradient, categoryGradient, initials } from '../core/format';

/** Circular initials avatar in a deterministic colour from the palette. */
@Component({
  selector: 'app-avatar',
  template: `
    <div
      class="avatar"
      [class.avatar--sm]="size() === 'sm'"
      [class.avatar--lg]="size() === 'lg'"
      [style.background]="color()"
      [title]="name()"
    >
      {{ label() }}
    </div>
  `,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  /** Kept for callers; mock members are flagged with a badge, not a different avatar. */
  readonly isMock = input(false);
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  protected readonly label = computed(() => initials(this.name()));
  protected readonly color = computed(() => avatarGradient(this.name()));
}

/** Rounded-square emoji tile tinted with the category's own hex colour. */
@Component({
  selector: 'app-category-icon',
  template: `
    <div class="cat-icon" [class.cat-icon--lg]="size() === 'lg'" [style.background]="soft()">
      {{ icon() || '📦' }}
    </div>
  `,
})
export class CategoryIconComponent {
  readonly icon = input<string | null>(null);
  readonly color = input<string | null>(null);
  readonly size = input<'md' | 'lg'>('md');

  protected readonly soft = computed(() => categoryGradient(this.color()));
}

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty">
      <div class="empty__glyph">{{ glyph() }}</div>
      <div class="empty__title">{{ title() }}</div>
      @if (text()) {
        <div class="empty__text">{{ text() }}</div>
      }
      <div class="empty__actions">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly text = input<string>('');
  readonly glyph = input('🌱');
}

@Component({
  selector: 'app-skeleton-rows',
  template: `
    @for (row of rows(); track $index) {
      <div class="list-row">
        <div class="skeleton" style="width:38px;height:38px;border-radius:12px"></div>
        <div class="list-row__main">
          <div class="skeleton" style="width:40%"></div>
          <div class="skeleton" style="width:22%;margin-top:8px;height:10px"></div>
        </div>
        <div class="skeleton" style="width:70px"></div>
      </div>
    }
  `,
})
export class SkeletonRowsComponent {
  readonly count = input(4);
  protected readonly rows = computed(() => Array.from({ length: this.count() }));
}

/**
 * Server-side paging, fixed newest-first (the API has no sort parameter).
 */
@Component({
  selector: 'app-pager',
  template: `
    <div class="pager">
      <div class="pager__info">
        Page {{ page() }} of {{ totalPages() }} · {{ total() }} total
      </div>
      <div class="spacer"></div>
      <button class="btn btn--sm" type="button" [disabled]="page() <= 1" (click)="go.emit(page() - 1)">
        ← Prev
      </button>
      <button
        class="btn btn--sm"
        type="button"
        [disabled]="page() >= totalPages()"
        (click)="go.emit(page() + 1)"
      >
        Next →
      </button>
    </div>
  `,
})
export class PagerComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly total = input.required<number>();
  readonly noun = input('transactions');
  readonly go = output<number>();
}

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toasts">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class.toast--error]="t.kind === 'error'" [class.toast--ok]="t.kind === 'ok'">
          <span>{{ t.text }}</span>
          <div class="spacer"></div>
          <button class="toast__close" type="button" (click)="toasts.dismiss(t.id)">✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
