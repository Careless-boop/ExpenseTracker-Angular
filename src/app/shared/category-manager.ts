import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../core/api-error';
import { categoryColor, categoryGradient } from '../core/format';
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
  '#D96F4E',
  '#C4704F',
  '#E0A33E',
  '#7FA35C',
  '#3E7D5C',
  '#5C8FA3',
  '#5C6FA3',
  '#9A7FB8',
  '#B85C8A',
  '#9A8C7A',
];

const EMOJI = ['☕', '🛒', '🍜', '🏠', '🚌', '🎬', '✈️', '💼', '🐈', '🎁', '💊', '👕', '📚', '⚽', '🌿'];

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
          <button class="btn btn--primary" type="button" (click)="openCreate()">+ New category</button>
        }
      </app-empty-state>
    } @else {
      <div class="cat-grid">
        @for (c of categories(); track c.id) {
          <div class="cat-card">
            <app-category-icon [icon]="c.icon" [color]="c.color" size="lg" />
            <div style="flex:1;min-width:0">
              <div class="row" style="gap:8px">
                <span style="font-weight:800;font-size:15px">{{ c.name }}</span>
                @if (c.isDefault) {
                  <span class="badge badge--muted">Default</span>
                }
              </div>
              <div class="row" style="gap:6px;margin-top:3px">
                <span class="cat-dot" [style.background]="strong(c.color)"></span>
                <span class="hint" style="color:var(--muted)">
                  {{ c.transactionCount }} {{ c.transactionCount === 1 ? 'transaction' : 'transactions' }}
                </span>
              </div>
            </div>
            @if (canEdit()) {
              <div class="list-row__actions">
                <button class="icon-btn" type="button" title="Edit" (click)="openEdit(c)">✎</button>
                @if (!c.isDefault) {
                  <button class="icon-btn icon-btn--danger" type="button" title="Delete" (click)="deleting.set(c)">×</button>
                }
              </div>
            }
          </div>
        }
      </div>
    }

    @if (editing(); as draft) {
      <app-dialog [title]="draft.id ? 'Edit category' : 'New category'" size="sm" (closed)="editing.set(null)">
        <div class="field">
          <label class="label">Name</label>
          <input
            class="input"
            [class.is-invalid]="fieldError('name')"
            type="text"
            maxlength="100"
            placeholder="e.g. Coffee"
            [(ngModel)]="draft.name"
          />
          @if (fieldError('name'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="field">
          <label class="label">Emoji</label>
          <div class="picker">
            @for (e of emoji; track e) {
              <button
                type="button"
                class="emoji-btn"
                [class.is-active]="draft.icon === e"
                (click)="draft.icon = e"
              >
                {{ e }}
              </button>
            }
            <input
              class="input emoji-free"
              type="text"
              maxlength="50"
              placeholder="any…"
              [(ngModel)]="draft.icon"
            />
          </div>
        </div>

        <div class="field">
          <label class="label">Colour</label>
          <div class="picker">
            @for (s of swatches; track s) {
              <button
                type="button"
                class="swatch"
                [class.is-picked]="sameColor(draft.color, s)"
                [style.background]="s"
                [title]="s"
                (click)="draft.color = s"
              ></button>
            }
            <label class="swatch swatch--custom" title="Pick any colour">
              <input type="color" [ngModel]="draft.color" (ngModelChange)="draft.color = up($event)" />
            </label>
          </div>
          @if (!validHex(draft.color)) {
            <div class="field__error">Must be a 6-digit hex colour, e.g. #F1F2F2</div>
          }
        </div>

        <div class="row" style="gap:10px;flex-wrap:nowrap">
          <div class="preview">
            <div class="cat-icon" [style.background]="previewSoft(draft.color)">{{ draft.icon || '📦' }}</div>
            <div style="font-weight:700;font-size:13.5px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              {{ draft.name || 'New category' }}
            </div>
          </div>
          <button class="btn btn--sm btn--ghost" type="button" (click)="editing.set(null)">Cancel</button>
          <button
            class="btn btn--sm btn--primary"
            type="button"
            [disabled]="busy() || !draft.name.trim() || !validHex(draft.color)"
            (click)="save.emit(draft)"
          >
            {{ draft.id ? 'Save' : 'Create' }}
          </button>
        </div>
      </app-dialog>
    }

    @if (deleting(); as target) {
      <app-dialog [title]="'Delete “' + target.name + '”?'" size="sm" (closed)="deleting.set(null)">
        <div class="hint" style="font-size:14px;color:var(--muted);line-height:1.55">
          It has <strong style="color:var(--ink)">{{ target.transactionCount }} transactions</strong>. They
          won't be lost — pick where they should go:
        </div>

        <div class="field">
          <select class="select" [ngModel]="reassignTo()" (ngModelChange)="reassignTo.set($event)">
            <option [ngValue]="null">📦 Other (default)</option>
            @for (c of reassignTargets(); track c.id) {
              <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option>
            }
          </select>
        </div>

        <div class="dialog__foot">
          <button class="btn btn--ghost" type="button" (click)="deleting.set(null)">Cancel</button>
          <button
            class="btn btn--red"
            type="button"
            [disabled]="busy()"
            (click)="remove.emit({ id: target.id, reassignToCategoryId: reassignTo() })"
          >
            Delete &amp; move {{ target.transactionCount }}
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: `
    .cat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 920px) {
      .cat-grid {
        grid-template-columns: 1fr;
      }
    }

    .cat-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px 18px;
    }

    .cat-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    .picker {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .emoji-btn {
      width: 40px;
      height: 40px;
      border: 1.5px solid var(--border);
      border-radius: 11px;
      background: #fff;
      font-size: 18px;
      cursor: pointer;

      &.is-active {
        background: var(--accent-soft);
        border-color: var(--accent);
      }
    }

    .emoji-free {
      width: 64px;
      height: 40px;
      text-align: center;
      font-size: 16px;
    }

    .swatch {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid #fff;
      cursor: pointer;
      padding: 0;

      &.is-picked {
        border-color: var(--ink);
      }
    }

    .swatch--custom {
      display: grid;
      place-items: center;
      overflow: hidden;
      background: conic-gradient(#e05a5a, #e0a33e, #7fa35c, #5c8fa3, #9a7fb8, #e05a5a);
      border-color: var(--ink);

      input {
        opacity: 0;
        width: 100%;
        height: 100%;
        border: none;
        padding: 0;
        cursor: pointer;
      }
    }

    .preview {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 11px;
      background: var(--bg);

      .cat-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        font-size: 15px;
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
  protected readonly strong = categoryColor;
  protected readonly previewSoft = categoryGradient;

  protected readonly reassignTargets = computed(() =>
    this.categories().filter((c) => c.id !== this.deleting()?.id && !c.isDefault),
  );

  openCreate(): void {
    this.editing.set({ id: null, name: '', icon: '☕', color: '#D96F4E' });
  }

  protected openEdit(c: CategoryLike): void {
    this.editing.set({ id: c.id, name: c.name, icon: c.icon, color: c.color ?? '#D96F4E' });
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

  protected up(value: string): string {
    return (value ?? '').toUpperCase();
  }

  protected fieldError(field: string): string | null {
    return this.error()?.fieldErrors[field]?.[0] ?? null;
  }
}
