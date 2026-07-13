import { Component, inject, signal, viewChild } from '@angular/core';
import { Observable } from 'rxjs';

import { PersonalApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { PersonalCategory } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import {
  CategoryDeletion,
  CategoryDraft,
  CategoryManagerComponent,
} from '../../shared/category-manager';

@Component({
  selector: 'app-personal-categories-page',
  imports: [CategoryManagerComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <h1 class="page-title">Categories</h1>
        <div class="spacer"></div>
        <button class="btn btn--green" type="button" (click)="manager()?.openCreate()">
          ＋ New category
        </button>
      </div>

      <div class="panel">
        <app-category-manager
          [categories]="categories()"
          [busy]="busy()"
          [error]="error()"
          (save)="save($event)"
          (remove)="remove($event)"
        />
      </div>
    </div>
  `,
})
export class PersonalCategoriesPageComponent {
  private readonly api = inject(PersonalApi);
  private readonly toasts = inject(ToastService);

  protected readonly manager = viewChild(CategoryManagerComponent);

  protected readonly categories = signal<PersonalCategory[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.categories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: (err: unknown) => this.toasts.error(toApiError(err).message),
    });
  }

  protected save(draft: CategoryDraft): void {
    this.busy.set(true);
    this.error.set(null);

    const body = { name: draft.name.trim(), icon: draft.icon, color: draft.color };
    const request: Observable<unknown> = draft.id
      ? this.api.updateCategory(draft.id, body)
      : this.api.createCategory(body);

    request.subscribe({
      next: () => this.done(draft.id ? 'Category updated.' : 'Category created.'),
      error: (err: unknown) => this.fail(err),
    });
  }

  protected remove({ id, reassignToCategoryId }: CategoryDeletion): void {
    this.busy.set(true);
    this.api.deleteCategory(id, reassignToCategoryId).subscribe({
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
