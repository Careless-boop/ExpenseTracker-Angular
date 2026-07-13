import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../core/api-error';
import { DialogComponent } from './dialog';
import { CategoryIconComponent, EmptyStateComponent } from './ui';

export interface CategoryLike {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  transactionCount: number;
}

export interface CategoryDraft {
  id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface CategoryDeletion {
  id: string;
  reassignToCategoryId: string | null;
}

const SWATCHES = [
  '#27AE60',
  '#E67E22',
  '#3498DB',
  '#9B59B6',
  '#16A085',
  '#E74C3C',
  '#F1C40F',
  '#2980B9',
  '#8E44AD',
  '#D35400',
  '#1ABC9C',
  '#95A5A6',
];

const EMOJI = ['🛒', '🍔', '🏠', '🎬', '🚗', '✈️', '🏂', '💊', '🎁', '📦', '💡', '📱'];

/**
 * The list Categories tab is identical in shape to Personal Categories, so both
 * screens render this. The parent owns the API calls.
 */
@Component({
  selector: 'app-category-manager',
  imports: [FormsModule, DialogComponent, CategoryIconComponent, EmptyStateComponent],
  template: `
    @if (!categories().length) {
      <app-empty-state
        title="No categories yet"
        text="Categories group your spending and give the dashboard its breakdown."
        glyph="📦"
      >
        @if (canEdit()) {
          <button class="btn btn--green" type="button" (click)="openCreate()">
            ＋ Add a category
          </button>
        }
      </app-empty-state>
    } @else {
      <div class="panel__body">
        <div class="grid-cards">
          @for (c of categories(); track c.id) {
            <div class="cat-card">
              <app-category-icon [icon]="c.icon" [color]="c.color" size="lg" />
              <div style="flex:1;min-width:0">
                <div class="row" style="gap:6px">
                  <span class="list-row__title">{{ c.name }}</span>
                  @if (c.isDefault) {
                    <span class="badge badge--soft">Default</span>
                  }
                </div>
                <div class="list-row__meta">
                  {{ c.transactionCount }}
                  {{ c.transactionCount === 1 ? 'transaction' : 'transactions' }}
                </div>
              </div>
              @if (canEdit()) {
                <div class="list-row__actions">
                  <button class="icon-btn" type="button" title="Edit" (click)="openEdit(c)">
                    ✎
                  </button>
                  <!-- the default category cannot be deleted -->
                  @if (!c.isDefault) {
                    <button
                      class="icon-btn icon-btn--danger"
                      type="button"
                      title="Delete"
                      (click)="deleting.set(c)"
                    >
                      ✕
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    }

    @if (editing(); as draft) {
      <app-dialog
        [title]="draft.id ? 'Edit category' : 'New category'"
        size="sm"
        (closed)="editing.set(null)"
      >
        <div class="field">
          <label class="field__label">Name <span>(≤ 100)</span></label>
          <input
            class="input"
            [class.is-invalid]="fieldError('name')"
            type="text"
            maxlength="100"
            [(ngModel)]="draft.name"
            placeholder="Groceries"
          />
          @if (fieldError('name'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="field">
          <label class="field__label">Icon <span>(emoji)</span></label>
          <div class="row">
            <input
              class="input input--auto"
              type="text"
              maxlength="50"
              style="width:70px;text-align:center;font-size:18px"
              [(ngModel)]="draft.icon"
            />
            <div class="row" style="gap:4px">
              @for (e of emoji; track e) {
                <button
                  class="icon-btn"
                  type="button"
                  style="font-size:15px"
                  (click)="draft.icon = e"
                >
                  {{ e }}
                </button>
              }
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field__label">Colour <span>(6-digit hex)</span></label>
          <div class="row" style="gap:6px">
            @for (s of swatches; track s) {
              <button
                class="swatch"
                type="button"
                [class.is-picked]="sameColor(draft.color, s)"
                [style.background]="s"
                [title]="s"
                (click)="draft.color = s"
              ></button>
            }
            <input
              class="input input--auto input--sm"
              type="text"
              style="width:100px;font-family:var(--font-mono)"
              maxlength="7"
              [class.is-invalid]="fieldError('color') || !validHex(draft.color)"
              [(ngModel)]="draft.color"
            />
          </div>
          @if (!validHex(draft.color)) {
            <div class="field__error">Must be a 6-digit hex colour, e.g. #F1F2F2</div>
          }
        </div>

        <div class="dialog__foot">
          <button class="btn" type="button" (click)="editing.set(null)">Cancel</button>
          <button
            class="btn btn--primary"
            type="button"
            [disabled]="busy() || !draft.name.trim() || !validHex(draft.color)"
            (click)="save.emit(draft)"
          >
            {{ draft.id ? 'Save changes' : 'Create category' }}
          </button>
        </div>
      </app-dialog>
    }

    @if (deleting(); as target) {
      <app-dialog title="Delete category" size="sm" (closed)="deleting.set(null)">
        <div class="hint">
          <strong>{{ target.name }}</strong> has
          <strong>{{ target.transactionCount }}</strong>
          {{ target.transactionCount === 1 ? 'transaction' : 'transactions' }}. Deleting it never
          orphans them — choose where they should go.
        </div>

        <div class="field">
          <label class="field__label">Reassign transactions to</label>
          <select
            class="select"
            [ngModel]="reassignTo()"
            (ngModelChange)="reassignTo.set($event)"
          >
            <option [ngValue]="null">The default category</option>
            @for (c of reassignTargets(); track c.id) {
              <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option>
            }
          </select>
          @if (!reassignTo()) {
            <div class="hint">
              Left as-is, everything moves to your default “Other” category.
            </div>
          }
        </div>

        <div class="dialog__foot">
          <button class="btn" type="button" (click)="deleting.set(null)">Cancel</button>
          <button
            class="btn btn--red"
            type="button"
            [disabled]="busy()"
            (click)="remove.emit({ id: target.id, reassignToCategoryId: reassignTo() })"
          >
            Delete category
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: `
    .cat-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius);
      box-shadow: var(--lift), var(--panel-inset);
    }

    .swatch {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: 1px solid rgba(0, 0, 0, 0.3);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
      cursor: pointer;
      padding: 0;

      &.is-picked {
        outline: 2px solid var(--grad-blue-border);
        outline-offset: 1px;
      }
    }
  `,
})
export class CategoryManagerComponent {
  readonly categories = input.required<CategoryLike[]>();
  readonly canEdit = input(true);
  readonly busy = input(false);
  readonly error = input<ApiError | null>(null);

  readonly save = output<CategoryDraft>();
  readonly remove = output<CategoryDeletion>();

  protected readonly editing = signal<CategoryDraft | null>(null);
  protected readonly deleting = signal<CategoryLike | null>(null);
  protected readonly reassignTo = signal<string | null>(null);

  protected readonly swatches = SWATCHES;
  protected readonly emoji = EMOJI;

  protected readonly reassignTargets = computed(() =>
    this.categories().filter((c) => c.id !== this.deleting()?.id),
  );

  openCreate(): void {
    this.editing.set({ id: null, name: '', icon: '📦', color: '#3498DB' });
  }

  protected openEdit(c: CategoryLike): void {
    this.editing.set({ id: c.id, name: c.name, icon: c.icon, color: c.color ?? '#3498DB' });
  }

  close(): void {
    this.editing.set(null);
    this.deleting.set(null);
    this.reassignTo.set(null);
  }

  protected validHex(color: string | null): boolean {
    return !color || /^#[0-9a-fA-F]{6}$/.test(color);
  }

  protected sameColor(a: string | null, b: string): boolean {
    return (a ?? '').toLowerCase() === b.toLowerCase();
  }

  protected fieldError(field: string): string | null {
    return this.error()?.fieldErrors[field]?.[0] ?? null;
  }
}
