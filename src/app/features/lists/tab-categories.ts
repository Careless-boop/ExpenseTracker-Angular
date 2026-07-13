import { Component, inject, signal, viewChild } from '@angular/core';
import { Observable } from 'rxjs';

import { ExpenseListApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { ExpenseListCategory } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import {
  CategoryDeletion,
  CategoryDraft,
  CategoryManagerComponent,
} from '../../shared/category-manager';
import { ListContext } from './list-context';

@Component({
  selector: 'app-tab-categories',
  imports: [CategoryManagerComponent],
  template: `
    <div class="panel__head">
      <div class="panel__title">Categories</div>
      <div class="spacer"></div>
      @if (ctx.canEdit()) {
        <button class="btn btn--sm btn--green" type="button" (click)="manager()?.openCreate()">
          ＋ New category
        </button>
      }
    </div>

    <app-category-manager
      [categories]="categories()"
      [canEdit]="ctx.canEdit()"
      [busy]="busy()"
      [error]="error()"
      (save)="save($event)"
      (remove)="remove($event)"
    />
  `,
})
export class TabCategoriesComponent {
  protected readonly ctx = inject(ListContext);
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);

  protected readonly manager = viewChild(CategoryManagerComponent);

  protected readonly categories = signal<ExpenseListCategory[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.api.categories(this.ctx.id()).subscribe({
      next: (categories) => this.categories.set(categories),
      error: (err: unknown) => this.toasts.error(toApiError(err).message),
    });
  }

  protected save(draft: CategoryDraft): void {
    this.busy.set(true);
    this.error.set(null);

    const body = { name: draft.name.trim(), icon: draft.icon, color: draft.color };
    const request: Observable<unknown> = draft.id
      ? this.api.updateCategory(this.ctx.id(), draft.id, body)
      : this.api.createCategory(this.ctx.id(), body);

    request.subscribe({
      next: () => this.done(draft.id ? 'Category updated.' : 'Category created.'),
      error: (err: unknown) => this.fail(err),
    });
  }

  protected remove({ id, reassignToCategoryId }: CategoryDeletion): void {
    this.busy.set(true);
    this.api.deleteCategory(this.ctx.id(), id, reassignToCategoryId).subscribe({
      next: () => this.done('Category deleted.'),
      error: (err: unknown) => this.fail(err),
    });
  }

  private done(message: string): void {
    this.busy.set(false);
    this.manager()?.close();
    this.toasts.ok(message);
    this.load();
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    const apiError = toApiError(err);
    this.error.set(apiError);
    if (!Object.keys(apiError.fieldErrors).length) {
      this.toasts.error(apiError.message);
    }
  }
}
