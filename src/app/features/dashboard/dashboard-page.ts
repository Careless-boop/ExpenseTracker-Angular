import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { DashboardApi } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { categoryColor, longDate, money, toIsoDate } from '../../core/format';
import { CategoryBreakdown, DashboardSummary, TransactionType } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UserPrefsService } from '../../core/user-prefs.service';
import { CategoryIconComponent } from '../../shared/ui';

type PresetKey = 'this-month' | 'last-month' | 'last-3-months' | 'custom';

interface Period {
  from: string;
  to: string;
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'last-3-months', label: '3 months' },
  { key: 'custom', label: 'Custom…' },
];

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

const RING = 2 * Math.PI * 80;

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, CategoryIconComponent],
  template: `
    <div class="page">
      @if (summary(); as s) {
        @if (isFirstRun()) {
          <div class="empty" style="max-width:520px;margin:64px auto">
            <div class="firstrun-mark"><span class="brand__mark" style="width:30px;height:30px;box-shadow:inset -7px -7px 0 var(--accent-2)"></span></div>
            <div class="empty__title" style="font-size:24px">Welcome! Let's get your first expense in.</div>
            <div class="empty__text" style="max-width:400px">
              Track your own spending, or start a shared list to split costs with friends — trips,
              flatmates, anything.
            </div>
            <div class="empty__actions">
              <a class="btn btn--primary" routerLink="/transactions">+ Add a transaction</a>
              <a class="btn btn--ghost" routerLink="/lists">Create an expense list</a>
            </div>
          </div>
        } @else {
          <header class="page-head">
            <div>
              <h1 class="page-title">Hey {{ firstName() }} 👋</h1>
              <div class="page-sub">{{ periodLabel() }}</div>
            </div>
            <div class="period">
              @for (p of presets; track p.key) {
                <button type="button" [class.is-active]="preset() === p.key" (click)="choose(p.key)">
                  {{ p.label }}
                </button>
              }
            </div>
          </header>

          @if (preset() === 'custom') {
            <div class="card card--pad row" style="gap:12px">
              <div class="field">
                <label class="label">From</label>
                <input class="input input--auto" type="date" [value]="period().from" (change)="setCustom('from', $event)" />
              </div>
              <div class="field">
                <label class="label">To</label>
                <input class="input input--auto" type="date" [value]="period().to" (change)="setCustom('to', $event)" />
              </div>
              <button class="btn btn--primary btn--sm" type="button" style="align-self:flex-end" (click)="load()">Apply</button>
              @if (invalidRange()) {
                <div class="field__error">“From” must not be after “To”.</div>
              }
            </div>
          }

          <section class="grid-tiles">
            <div class="stat">
              <div class="stat__label">Income</div>
              <div class="stat__value" style="color:var(--income)">+{{ fmt(s.current.totalIncome) }}</div>
            </div>
            <div class="stat">
              <div class="stat__label">Expenses</div>
              <div class="stat__value">−{{ fmt(s.current.totalExpenses) }}</div>
            </div>
            <div class="stat">
              <div class="stat__label">Net</div>
              <div class="row" style="gap:8px;margin-top:6px">
                <div class="stat__value" style="margin-top:0">
                  {{ s.current.net >= 0 ? '' : '−' }}{{ fmt(s.current.net) }}
                </div>
                @if (s.netChangePercent !== null) {
                  <span
                    class="trend"
                    [class.trend--up]="s.netChangePercent >= 0"
                    [class.trend--down]="s.netChangePercent < 0"
                  >
                    {{ s.netChangePercent >= 0 ? '▲' : '▼' }} {{ absPercent(s.netChangePercent) }}%
                  </span>
                }
              </div>
              @if (s.netChangePercent !== null) {
                <div class="hint" style="margin-top:4px">vs {{ fmt(s.previous.net) }} last period</div>
              } @else {
                <div class="hint" style="margin-top:4px">No comparison — last period netted zero</div>
              }
            </div>
            <div class="stat">
              <div class="stat__label">Transactions</div>
              <div class="stat__value">{{ s.current.transactionCount }}</div>
            </div>
          </section>

          <section class="breakdown">
            <div class="card card--pad">
              <div class="row">
                <div class="panel__title">Spending by category</div>
                <div class="spacer"></div>
                <div class="segmented segmented--sm">
                  <button type="button" class="is-expense" [class.is-active]="type() === 'Expense'" (click)="setType('Expense')">Spent</button>
                  <button type="button" class="is-income" [class.is-active]="type() === 'Income'" (click)="setType('Income')">Received</button>
                </div>
              </div>

              @if (breakdown(); as b) {
                <div class="donut">
                  <svg width="210" height="210" viewBox="0 0 210 210">
                    @for (seg of donutSegs(); track $index) {
                      <circle
                        cx="105" cy="105" r="80" fill="none"
                        [attr.stroke]="seg.color" stroke-width="30"
                        [attr.stroke-dasharray]="seg.dash" [attr.stroke-dashoffset]="seg.off"
                        transform="rotate(-90 105 105)"
                      />
                    }
                    @if (!donutSegs().length) {
                      <circle cx="105" cy="105" r="80" fill="none" stroke="var(--pill)" stroke-width="30" />
                    }
                  </svg>
                  <div class="donut__center">
                    <div class="hint" style="font-weight:700;color:var(--muted)">
                      {{ type() === 'Expense' ? 'Spent' : 'Received' }}
                    </div>
                    <div class="donut__total">{{ fmt(b.total) }}</div>
                  </div>
                </div>
              }
            </div>

            <div class="card" style="padding:10px 8px">
              @if (breakdown(); as b) {
                @if (!b.categories.length) {
                  <div class="empty" style="padding:40px 20px">
                    <div class="empty__glyph">○</div>
                    <div class="empty__title" style="font-size:15px">Nothing in this period</div>
                  </div>
                } @else {
                  @for (c of b.categories; track c.categoryId) {
                    <a class="legend-row" routerLink="/transactions" [queryParams]="{ categoryId: c.categoryId, type: type() }">
                      <app-category-icon [icon]="c.icon" [color]="c.color" />
                      <div style="min-width:0;flex:1">
                        <div class="row" style="gap:8px">
                          <div style="font-weight:700;font-size:14px">{{ c.name }}</div>
                          <div data-hide-mobile class="hint" style="color:var(--muted)">{{ c.transactionCount }} transactions</div>
                          <div class="money" style="margin-left:auto;font-size:14px">{{ fmt(c.total) }}</div>
                        </div>
                        <div class="row" style="gap:10px;margin-top:6px;flex-wrap:nowrap">
                          <div class="progress"><span [style.background]="strong(c.color)" [style.width.%]="barWidth(c, b)"></span></div>
                          <div class="tnum" style="width:44px;text-align:right;font-size:12px;font-weight:700;color:var(--muted)">{{ round(c.percentage) }}%</div>
                        </div>
                      </div>
                    </a>
                  }
                }
              }
            </div>
          </section>
        }
      } @else {
        <section class="grid-tiles">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="stat">
              <div class="skeleton" style="width:50%;height:11px"></div>
              <div class="skeleton" style="width:70%;height:24px;margin-top:12px"></div>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .period {
      margin-left: auto;
      display: flex;
      gap: 6px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 4px;

      button {
        height: 34px;
        padding: 0 14px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: var(--ink-2);
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;

        &.is-active {
          background: var(--accent-soft);
          color: var(--accent-3);
        }
      }
    }

    .trend {
      padding: 3px 8px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .trend--up {
      background: var(--income-soft);
      color: var(--income);
    }
    .trend--down {
      background: var(--danger-soft);
      color: var(--danger);
    }

    .breakdown {
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 14px;
      align-items: start;
    }

    .donut {
      position: relative;
      width: 210px;
      margin: 18px auto 6px;
    }
    .donut__center {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      text-align: center;
    }
    .donut__total {
      font-size: 21px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 14px;
      border-radius: 12px;
      color: var(--ink);

      &:hover {
        background: var(--row-hover);
      }
    }

    .firstrun-mark {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--accent-soft);
      display: grid;
      place-items: center;
      margin-bottom: 6px;
    }

    @media (max-width: 920px) {
      .breakdown {
        grid-template-columns: 1fr;
      }
      .period {
        margin-left: 0;
        width: 100%;
        button {
          flex: 1;
          padding: 0 6px;
        }
      }
    }
  `,
})
export class DashboardPageComponent {
  private readonly api = inject(DashboardApi);
  private readonly toasts = inject(ToastService);
  private readonly prefs = inject(UserPrefsService);
  private readonly auth = inject(AuthService);

  protected readonly presets = PRESETS;
  protected readonly preset = signal<PresetKey>('this-month');
  protected readonly period = signal<Period>(presetPeriod('this-month'));
  protected readonly type = signal<TransactionType>('Expense');

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly breakdown = signal<CategoryBreakdown | null>(null);

  protected readonly fmt = (n: number) => money(n, this.prefs.currency());
  protected readonly strong = categoryColor;

  protected readonly firstName = computed(() => {
    const u = this.auth.user();
    return (u?.displayName || u?.userName || 'there').split(/\s+/)[0];
  });

  /** A brand-new user has no transactions at all — not just none in this period. */
  protected readonly isFirstRun = computed(() => {
    const s = this.summary();
    return (
      !!s &&
      s.current.transactionCount === 0 &&
      s.previous.transactionCount === 0 &&
      this.preset() === 'this-month'
    );
  });

  protected readonly invalidRange = computed(() => {
    const { from, to } = this.period();
    return !!from && !!to && from > to;
  });

  protected readonly periodLabel = computed(() => {
    const { from, to } = this.period();
    return `${longDate(from)} – ${longDate(to)}`;
  });

  /** SVG ring segments, using each category's own colour. */
  protected readonly donutSegs = computed(() => {
    const b = this.breakdown();
    if (!b?.categories.length || b.total <= 0) return [];

    let cum = 0;
    return b.categories.map((c) => {
      const frac = c.percentage / 100;
      const seg = {
        color: categoryColor(c.color),
        dash: `${(frac * RING - 2).toFixed(2)} ${RING.toFixed(2)}`,
        off: (-cum * RING).toFixed(2),
      };
      cum += frac;
      return seg;
    });
  });

  constructor() {
    this.load();
  }

  protected choose(key: PresetKey): void {
    this.preset.set(key);
    if (key !== 'custom') {
      this.period.set(presetPeriod(key));
      this.load();
    }
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

  protected barWidth(c: { total: number }, b: CategoryBreakdown): number {
    const max = b.categories[0]?.total || 1;
    return Math.max(4, (c.total / max) * 100);
  }

  protected absPercent(value: number): string {
    return Math.abs(value).toFixed(1);
  }

  protected round(value: number): number {
    return Math.round(value);
  }
}
