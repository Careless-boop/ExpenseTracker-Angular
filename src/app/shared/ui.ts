import { Component, computed, inject, input, output } from '@angular/core';

import { ToastService } from '../core/toast.service';
import { avatarGradient, categoryGradient, initials } from '../core/format';

/** Circular initials avatar. Mock members are always dashed and never filled. */
@Component({
  selector: 'app-avatar',
  template: `
    <div
      class="avatar"
      [class.avatar--sm]="size() === 'sm'"
      [class.avatar--mock]="isMock()"
      [style.background]="isMock() ? null : gradient()"
      [title]="name()"
    >
      {{ label() }}
    </div>
  `,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly isMock = input(false);
  readonly size = input<'sm' | 'md'>('md');

  protected readonly label = computed(() => initials(this.name()));
  protected readonly gradient = computed(() => avatarGradient(this.name()));
}

/** Rounded-square emoji tile tinted with the category's own hex colour. */
@Component({
  selector: 'app-category-icon',
  template: `
    <div
      class="cat-icon"
      [class.cat-icon--lg]="size() === 'lg'"
      [style.background]="gradient()"
    >
      {{ icon() || '📦' }}
    </div>
  `,
})
export class CategoryIconComponent {
  readonly icon = input<string | null>(null);
  readonly color = input<string | null>(null);
  readonly size = input<'md' | 'lg'>('md');

  protected readonly gradient = computed(() => categoryGradient(this.color()));
}

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty">
      <div class="empty__coin">{{ glyph() }}</div>
      <div class="empty__title">{{ title() }}</div>
      @if (text()) {
        <div class="empty__text">{{ text() }}</div>
      }
      <div class="row" style="justify-content:center">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly text = input<string>('');
  readonly glyph = input('$');
}

@Component({
  selector: 'app-skeleton-rows',
  template: `
    @for (row of rows(); track $index) {
      <div class="list-row">
        <div class="skeleton" style="width:32px;height:32px;border-radius:8px"></div>
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
 * Page size is clamped to the API's 1–100 range and paging is server-side; the
 * backend has no sort parameter, so order is fixed newest-first.
 */
@Component({
  selector: 'app-pager',
  template: `
    <div class="pager">
      <div class="pager__info">{{ total() }} {{ noun() }} · newest first</div>
      <div class="spacer"></div>
      <button
        class="btn btn--sm"
        type="button"
        [disabled]="page() <= 1"
        (click)="go.emit(page() - 1)"
      >
        « Prev
      </button>
      @for (n of pages(); track n) {
        <button
          class="pager__num"
          type="button"
          [class.is-active]="n === page()"
          (click)="go.emit(n)"
        >
          {{ n }}
        </button>
      }
      <button
        class="btn btn--sm"
        type="button"
        [disabled]="page() >= totalPages()"
        (click)="go.emit(page() + 1)"
      >
        Next »
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

  protected readonly pages = computed(() => {
    const count = this.totalPages();
    const current = this.page();
    // A short window around the current page keeps the bar from overflowing.
    const from = Math.max(1, Math.min(current - 2, count - 4));
    const to = Math.min(count, from + 4);
    const list: number[] = [];
    for (let i = from; i <= to; i++) list.push(i);
    return list;
  });
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
