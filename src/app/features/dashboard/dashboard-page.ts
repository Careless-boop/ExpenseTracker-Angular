import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { DashboardApi } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { longDate, money, toIsoDate } from '../../core/format';
import { CategoryBreakdown, DashboardSummary, TransactionType } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UserPrefsService } from '../../core/user-prefs.service';
import { CategoryIconComponent, EmptyStateComponent } from '../../shared/ui';

type PresetKey = 'this-month' | 'last-month' | 'last-3-months' | 'custom';

interface Period {
  from: string;
  to: string;
}

function presetPeriod(key: PresetKey): Period {
  const now = new Date();
  const start = (y: number, m: number) => new Date(y, m, 1);
  const end = (y: number, m: number) => new Date(y, m + 1, 0);

  switch (key) {
    case 'last-month':
      return {
        from: toIsoDate(start(now.getFullYear(), now.getMonth() - 1)),
        to: toIsoDate(end(now.getFullYear(), now.getMonth() - 1)),
      };
    case 'last-3-months':
      return {
        from: toIsoDate(start(now.getFullYear(), now.getMonth() - 2)),
        to: toIsoDate(end(now.getFullYear(), now.getMonth())),
      };
    default:
      return {
        from: toIsoDate(start(now.getFullYear(), now.getMonth())),
        to: toIsoDate(end(now.getFullYear(), now.getMonth())),
      };
  }
}

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, CategoryIconComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <h1 class="page-title">Dashboard</h1>
        <div class="spacer"></div>

        <div class="segmented">
          <button
            type="button"
            [class.is-active]="preset() === 'this-month'"
            (click)="choose('this-month')"
          >
            This month
          </button>
          <button
            type="button"
            [class.is-active]="preset() === 'last-month'"
            (click)="choose('last-month')"
          >
            Last month
          </button>
          <button
            type="button"
            [class.is-active]="preset() === 'last-3-months'"
            (click)="choose('last-3-months')"
          >
            Last 3 months
          </button>
          <button
            type="button"
            [class.is-active]="preset() === 'custom'"
            (click)="preset.set('custom')"
          >
            Custom…
          </button>
        </div>
      </div>

      @if (preset() === 'custom') {
        <div class="panel panel__head" style="border-radius:var(--radius)">
          <div class="field">
            <label class="field__label field__label--caps">From</label>
            <input
              class="input input--sm input--auto"
              type="date"
              [value]="period().from"
              (change)="setCustom('from', $event)"
            />
          </div>
          <div class="field">
            <label class="field__label field__label--caps">To</label>
            <input
              class="input input--sm input--auto"
              type="date"
              [value]="period().to"
              (change)="setCustom('to', $event)"
            />
          </div>
          <button class="btn btn--sm btn--primary" type="button" (click)="load()">Apply</button>
          @if (invalidRange()) {
            <div class="field__error">“From” must not be after “To”.</div>
          }
        </div>
      }

      <div class="hint" style="margin-top:-12px">{{ periodLabel() }}</div>

      @if (summary(); as s) {
        @if (isFirstRun()) {
          <div class="panel">
            <app-empty-state
              title="Welcome! Nothing here yet."
              text="Record your first transaction, or start a shared expense list with friends."
            >
              <a class="btn btn--primary" routerLink="/transactions">＋ Add a transaction</a>
              <a class="btn btn--green" routerLink="/lists">Create an expense list</a>
            </app-empty-state>
          </div>
        } @else {
          <div class="grid-tiles">
            <div class="panel" style="padding:18px 20px">
              <div class="stat__label">Total income</div>
              <div class="stat__value money--income">+{{ fmt(s.current.totalIncome) }}</div>
            </div>

            <div class="panel" style="padding:18px 20px">
              <div class="stat__label">Total expenses</div>
              <div class="stat__value money--expense">−{{ fmt(s.current.totalExpenses) }}</div>
            </div>

            <div class="panel" style="padding:18px 20px">
              <div class="row" style="gap:8px">
                <div class="stat__label">Net</div>
                <!-- netChangePercent is null when the previous net was zero: never render "0%" -->
                @if (s.netChangePercent === null) {
                  <span class="badge badge--soft">— no previous period to compare</span>
                } @else {
                  <span
                    class="badge"
                    [class.badge--ok]="s.netChangePercent >= 0"
                    [class.badge--bad]="s.netChangePercent < 0"
                  >
                    {{ s.netChangePercent >= 0 ? '▲' : '▼' }}
                    {{ absPercent(s.netChangePercent) }}% vs last period
                  </span>
                }
              </div>
              <div class="stat__value" style="color:var(--heading)">
                {{ s.current.net >= 0 ? '+' : '−' }}{{ fmt(s.current.net) }}
              </div>
            </div>

            <div class="panel" style="padding:18px 20px">
              <div class="stat__label">Transactions</div>
              <div class="stat__value" style="color:var(--text-2)">
                {{ s.current.transactionCount }}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head">
              <div class="panel__title">Spending by category</div>
              <div class="spacer"></div>
              <div class="segmented segmented--sm">
                <button
                  type="button"
                  class="is-expense"
                  [class.is-active]="type() === 'Expense'"
                  (click)="setType('Expense')"
                >
                  Expenses
                </button>
                <button
                  type="button"
                  class="is-income"
                  [class.is-active]="type() === 'Income'"
                  (click)="setType('Income')"
                >
                  Income
                </button>
              </div>
            </div>

            @if (breakdown(); as b) {
              @if (!b.categories.length) {
                <app-empty-state
                  title="Nothing in this period"
                  [text]="
                    'No ' + (type() === 'Expense' ? 'spending' : 'income') + ' recorded in this range.'
                  "
                  glyph="○"
                />
              } @else {
                <div class="breakdown">
                  <div class="donut-wrap">
                    <div class="donut" [style.background]="donut()"></div>
                    <div class="donut__hole">
                      <div class="donut__label">TOTAL</div>
                      <div class="donut__total">{{ fmt(b.total) }}</div>
                    </div>
                  </div>

                  <div class="legend">
                    @for (c of b.categories; track c.categoryId) {
                      <!-- each row drills into the ledger pre-filtered by that category -->
                      <a
                        class="legend__row"
                        routerLink="/transactions"
                        [queryParams]="{ categoryId: c.categoryId, type: type() }"
                      >
                        <app-category-icon [icon]="c.icon" [color]="c.color" />
                        <div class="legend__name">{{ c.name }}</div>
                        <div class="legend__count">
                          {{ c.transactionCount }}
                          {{ c.transactionCount === 1 ? 'transaction' : 'transactions' }}
                        </div>
                        <div class="legend__total">{{ fmt(c.total) }}</div>
                        <div class="legend__pct">{{ round(c.percentage) }}%</div>
                      </a>
                    }
                  </div>
                </div>
              }
            }
          </div>
        }
      } @else {
        <div class="grid-tiles">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="panel" style="padding:18px 20px">
              <div class="skeleton" style="width:50%;height:10px"></div>
              <div class="skeleton" style="width:70%;height:26px;margin-top:10px"></div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .breakdown {
      padding: 24px;
      display: flex;
      gap: 36px;
      align-items: center;
      flex-wrap: wrap;
    }

    .donut-wrap {
      position: relative;
      width: 200px;
      height: 200px;
      flex-shrink: 0;
    }

    .donut {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      box-shadow: 0 3px 10px rgba(28, 56, 120, 0.25), inset 0 2px 4px rgba(255, 255, 255, 0.4);
    }

    .donut__hole {
      position: absolute;
      top: 50px;
      left: 50px;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: var(--panel);
      box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.28);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .donut__label {
      font-size: 10px;
      font-weight: bold;
      color: var(--muted);
    }

    .donut__total {
      font-family: var(--font-head);
      font-weight: bold;
      font-size: 17px;
      color: var(--heading);
    }

    .legend {
      flex: 1;
      min-width: 300px;
      display: flex;
      flex-direction: column;
    }

    .legend__row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--row-border);
      border-radius: 6px;
      text-decoration: none;

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--row-hover);
      }
    }

    .legend__name {
      flex: 1;
      font-size: 13px;
      font-weight: bold;
      color: var(--text);
    }

    .legend__count {
      font-size: 11px;
      color: var(--muted);
    }

    .legend__total {
      width: 80px;
      text-align: right;
      font-size: 13px;
      font-weight: bold;
      color: var(--text);
    }

    .legend__pct {
      width: 36px;
      text-align: right;
      font-size: 11px;
      font-weight: bold;
      color: var(--label);
    }
  `,
})
export class DashboardPageComponent {
  private readonly api = inject(DashboardApi);
  private readonly toasts = inject(ToastService);
  private readonly prefs = inject(UserPrefsService);

  protected readonly preset = signal<PresetKey>('this-month');
  protected readonly period = signal<Period>(presetPeriod('this-month'));
  protected readonly type = signal<TransactionType>('Expense');

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly breakdown = signal<CategoryBreakdown | null>(null);

  // Personal ledger is shown in the user's currency.
  protected readonly fmt = (n: number) => money(n, this.prefs.currency());

  /** A brand-new user has no transactions at all — not just none in this period. */
  protected readonly isFirstRun = computed(() => {
    const s = this.summary();
    return (
      !!s && s.current.transactionCount === 0 && s.previous.transactionCount === 0 && this.preset() === 'this-month'
    );
  });

  protected readonly invalidRange = computed(() => {
    const { from, to } = this.period();
    return !!from && !!to && from > to;
  });

  protected readonly periodLabel = computed(() => {
    const { from, to } = this.period();
    const days = Math.max(
      1,
      Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1,
    );
    return `${longDate(from)} – ${longDate(to)} · compared with the preceding ${days} days`;
  });

  /** conic-gradient slices, using each category's own colour. */
  protected readonly donut = computed(() => {
    const b = this.breakdown();
    if (!b?.categories.length) return 'transparent';

    let cursor = 0;
    const stops = b.categories.map((c) => {
      const start = cursor;
      cursor += c.percentage;
      const color = c.color && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#95A5A6';
      return `${color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });

  constructor() {
    this.load();
  }

  protected choose(key: PresetKey): void {
    this.preset.set(key);
    this.period.set(presetPeriod(key));
    this.load();
  }

  protected setType(type: TransactionType): void {
    this.type.set(type);
    this.load();
  }

  protected setCustom(edge: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.period.update((p) => ({ ...p, [edge]: value }));
  }

  protected load(): void {
    if (this.invalidRange()) return;

    const { from, to } = this.period();
    forkJoin({
      summary: this.api.summary(from, to),
      breakdown: this.api.byCategory(from, to, this.type()),
    }).subscribe({
      next: ({ summary, breakdown }) => {
        this.summary.set(summary);
        this.breakdown.set(breakdown);
      },
      error: (err: unknown) => this.toasts.error(toApiError(err).message),
    });
  }

  protected absPercent(value: number): string {
    return Math.abs(value).toFixed(1);
  }

  protected round(value: number): number {
    return Math.round(value);
  }
}
