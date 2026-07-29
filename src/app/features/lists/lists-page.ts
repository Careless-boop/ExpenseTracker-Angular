import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ExpenseListApi } from '../../core/api.service';
import { ApiError, toApiError } from '../../core/api-error';
import { CURRENCIES } from '../../core/currencies';
import { longDate } from '../../core/format';
import { ExpenseList } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UserPrefsService } from '../../core/user-prefs.service';
import { DialogComponent } from '../../shared/dialog';

const COVERS = [
  'linear-gradient(120deg,#F3D9C8,#E9B99C)',
  'linear-gradient(120deg,#DCE8D2,#B9CFA6)',
  'linear-gradient(120deg,#D8E4EC,#A9C4D4)',
  'linear-gradient(120deg,#EDE0F0,#CDB8DA)',
  'linear-gradient(120deg,#FBEBD2,#EED2A0)',
];
const LIST_EMOJI = ['✈️', '🏠', '🎾', '🏔️', '🎂', '🍽️', '🚗', '⛺', '🛒', '🎉'];

function hashInt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

@Component({
  selector: 'app-lists-page',
  imports: [FormsModule, RouterLink, DialogComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Expense lists</h1>
          <div class="page-sub">Shared costs, split fairly. Settle up with the fewest transfers.</div>
        </div>
        <button class="btn btn--primary" type="button" style="margin-left:auto" (click)="openCreate()">
          + New list
        </button>
      </div>

      @if (loading()) {
        <div class="grid-cards">
          @for (i of [1, 2, 3]; track i) {
            <div class="card" style="padding:18px">
              <div class="skeleton" style="width:60%;height:16px"></div>
              <div class="skeleton" style="width:90%;margin-top:12px"></div>
            </div>
          }
        </div>
      } @else if (!lists().length) {
        <div class="empty" style="max-width:520px;margin:64px auto">
          <div class="empty__glyph">👥</div>
          <div class="empty__title" style="font-size:22px">Split costs without the spreadsheet</div>
          <div class="empty__text" style="max-width:400px">
            Make a list for a trip or your flat, add expenses as they happen, and we'll work out who
            owes whom — with the fewest possible transfers.
          </div>
          <div class="empty__actions">
            <button class="btn btn--primary" type="button" (click)="openCreate()">
              + Create your first list
            </button>
          </div>
        </div>
      } @else {
        @if (active().length) {
          <div class="grid-cards">
            @for (l of active(); track l.id) {
              <a class="lcard" [routerLink]="['/lists', l.id]">
                <div class="lcard__cover" [style.background]="cover(l.id)">
                  <div class="lcard__emoji">{{ emoji(l.id) }}</div>
                  <span class="lcard__role">{{ l.currentUserRole }}</span>
                </div>
                <div class="lcard__body">
                  <div style="font-weight:800;font-size:16px">{{ l.name }}</div>
                  <div class="page-sub" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    {{ l.description || 'No description' }}
                  </div>
                  <div class="lcard__meta">
                    <span class="badge">{{ l.currency }}</span>
                    {{ l.memberCount }} {{ l.memberCount === 1 ? 'person' : 'people' }} ·
                    {{ l.transactionCount }} {{ l.transactionCount === 1 ? 'expense' : 'expenses' }}
                  </div>
                </div>
              </a>
            }
          </div>
        }

        @if (closed().length) {
          <div class="row" style="gap:10px;margin-top:6px">
            <div class="section-label">CLOSED</div>
            <div style="flex:1;height:1px;background:var(--border)"></div>
          </div>
          <div class="grid-cards">
            @for (l of closed(); track l.id) {
              <a class="lcard-closed" [routerLink]="['/lists', l.id]">
                <div class="cat-icon cat-icon--lg" style="background:#f1ece4;filter:grayscale(.4)">{{ emoji(l.id) }}</div>
                <div style="min-width:0;flex:1">
                  <div class="row" style="gap:8px">
                    <div style="font-weight:800;font-size:14.5px;color:#6e6355">{{ l.name }}</div>
                    <span class="badge badge--closed">Closed</span>
                  </div>
                  <div class="page-sub" style="margin-top:2px">Closed {{ date(l.closedAt!) }} · {{ l.memberCount }} people</div>
                </div>
              </a>
            }
          </div>
        }
      }
    </div>

    @if (creating()) {
      <app-dialog
        title="New expense list"
        sub="You'll be the owner. Add people after it's created."
        size="sm"
        (closed)="creating.set(false)"
      >
        <div class="field">
          <label class="label">Name</label>
          <input
            class="input"
            [class.is-invalid]="fieldError('name')"
            type="text"
            maxlength="200"
            [(ngModel)]="name"
            placeholder="e.g. Flat 12 bills"
          />
          @if (fieldError('name'); as msg) {
            <div class="field__error">{{ msg }}</div>
          }
        </div>

        <div class="field">
          <label class="label">Description <span>(optional)</span></label>
          <input class="input" type="text" maxlength="1000" [(ngModel)]="description" placeholder="What's it for?" />
        </div>

        <div class="row" style="gap:12px;flex-wrap:nowrap;align-items:flex-start">
          <div class="field field--grow">
            <label class="label">Currency</label>
            <select class="select" [ngModel]="currency()" (ngModelChange)="currency.set($event)">
              @for (c of currencies; track c.code) {
                <option [value]="c.code">{{ c.code }} ({{ c.symbol }})</option>
              }
            </select>
          </div>
          <div class="field field--grow">
            <label class="label">Cover URL <span>(optional)</span></label>
            <input class="input" type="url" maxlength="500" [(ngModel)]="coverImage" placeholder="https://…" />
          </div>
        </div>

        <div class="dialog__foot">
          <button class="btn btn--ghost" type="button" (click)="creating.set(false)">Cancel</button>
          <button
            class="btn btn--primary btn--wide"
            type="button"
            [disabled]="busy() || !name().trim()"
            (click)="create()"
          >
            Create list
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: `
    .lcard {
      display: block;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      color: var(--ink);
      transition: box-shadow 0.15s;

      &:hover {
        box-shadow: 0 6px 20px rgba(55, 47, 39, 0.09);
      }
    }

    .lcard__cover {
      height: 74px;
      position: relative;
    }

    .lcard__emoji {
      position: absolute;
      left: 18px;
      bottom: -18px;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: #fff;
      border: 1px solid var(--border);
      display: grid;
      place-items: center;
      font-size: 20px;
    }

    .lcard__role {
      position: absolute;
      right: 12px;
      top: 12px;
      padding: 3px 10px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.85);
      font-size: 11px;
      font-weight: 800;
      color: #7a6a50;
      text-transform: uppercase;
    }

    .lcard__body {
      padding: 26px 18px 16px;
    }

    .lcard__meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      font-size: 12.5px;
      color: var(--muted);
      font-weight: 600;
    }

    .lcard-closed {
      display: flex;
      align-items: center;
      gap: 14px;
      background: #fdfbf7;
      border: 1px dashed #e3d5c2;
      border-radius: 16px;
      padding: 16px 18px;
      color: var(--ink);

      &:hover {
        background: #f8f2e9;
      }
    }
  `,
})
export class ListsPageComponent {
  private readonly api = inject(ExpenseListApi);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly prefs = inject(UserPrefsService);

  protected readonly currencies = CURRENCIES;

  protected readonly lists = signal<ExpenseList[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly creating = signal(false);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly coverImage = signal('');
  protected readonly currency = signal('USD');

  protected readonly date = longDate;

  // The API stores no per-list emoji/cover; derive a stable one from the id.
  protected cover(id: string): string {
    return COVERS[hashInt(id) % COVERS.length];
  }
  protected emoji(id: string): string {
    return LIST_EMOJI[hashInt(id) % LIST_EMOJI.length];
  }

  protected readonly active = computed(() => this.lists().filter((l) => !l.closedAt));
  protected readonly closed = computed(() => this.lists().filter((l) => !!l.closedAt));

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.all().subscribe({
      next: (lists) => {
        this.lists.set(lists);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.toasts.error(toApiError(err).message);
      },
    });
  }

  protected openCreate(): void {
    this.error.set(null);
    this.name.set('');
    this.description.set('');
    this.coverImage.set('');
    this.currency.set(this.prefs.currency());
    this.creating.set(true);
  }

  protected create(): void {
    this.busy.set(true);
    this.error.set(null);

    this.api
      .create({
        name: this.name().trim(),
        description: this.description().trim() || null,
        coverImage: this.coverImage().trim() || null,
        currency: this.currency(),
      })
      .subscribe({
        next: ({ id }) => {
          this.busy.set(false);
          this.creating.set(false);
          void this.router.navigate(['/lists', id]);
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
