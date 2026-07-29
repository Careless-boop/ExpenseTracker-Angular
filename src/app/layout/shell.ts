import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

import { AuthService } from '../core/auth.service';
import { initials } from '../core/format';

const TITLES: { match: RegExp; title: string }[] = [
  { match: /^\/dashboard/, title: 'Dashboard' },
  { match: /^\/transactions/, title: 'Transactions' },
  { match: /^\/categories/, title: 'Categories' },
  { match: /^\/lists\/[^/]+/, title: 'Expense list' },
  { match: /^\/lists/, title: 'Expense lists' },
  { match: /^\/settings/, title: 'Settings' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app">
      <!-- mobile topbar -->
      <div class="topbar">
        <button class="icon-square burger" type="button" aria-label="Menu" (click)="drawerOpen.set(true)">
          <div><span></span><span></span><span></span></div>
        </button>
        <div class="topbar__title">{{ title() }}</div>
      </div>

      <!-- mobile drawer -->
      @if (drawerOpen()) {
        <div class="drawer-scrim" (click)="drawerOpen.set(false)">
          <div class="drawer" (click)="$event.stopPropagation()">
            <a class="brand" routerLink="/dashboard" (click)="drawerOpen.set(false)">
              <span class="brand__mark"></span>
              <span class="brand__name">ExpenseTracker</span>
            </a>
            @for (item of nav; track item.path) {
              <a
                class="nav-link"
                [routerLink]="item.path"
                routerLinkActive="is-active"
                (click)="drawerOpen.set(false)"
              >
                {{ item.label }}
              </a>
            }
            <a class="nav-link" routerLink="/settings" routerLinkActive="is-active" (click)="drawerOpen.set(false)">
              Settings
            </a>
            <button class="nav-link" type="button" (click)="logout()">Log out</button>
          </div>
        </div>
      }

      <!-- desktop sidebar -->
      <nav class="sidebar">
        <a class="brand" routerLink="/dashboard">
          <span class="brand__mark"></span>
          <span class="brand__name">ExpenseTracker</span>
        </a>

        <a class="nav-add" routerLink="/transactions">
          <span style="font-size:18px;line-height:1">+</span> Add expense
        </a>

        <a class="nav-link" routerLink="/dashboard" routerLinkActive="is-active">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" stroke-width="3"
              stroke-dasharray="30 11" transform="rotate(-45 9 9)" />
          </svg>
          Dashboard
        </a>

        <div class="nav-section">PERSONAL</div>
        <a class="nav-link" routerLink="/transactions" routerLinkActive="is-active">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <rect x="2" y="3" width="14" height="2.6" rx="1.3" fill="currentColor" />
            <rect x="2" y="7.7" width="10" height="2.6" rx="1.3" fill="currentColor" />
            <rect x="2" y="12.4" width="13" height="2.6" rx="1.3" fill="currentColor" />
          </svg>
          Transactions
        </a>
        <a class="nav-link" routerLink="/categories" routerLinkActive="is-active">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <rect x="2" y="2" width="6" height="6" rx="2" fill="currentColor" />
            <rect x="10" y="2" width="6" height="6" rx="3" fill="currentColor" />
            <rect x="2" y="10" width="6" height="6" rx="3" fill="currentColor" />
            <rect x="10" y="10" width="6" height="6" rx="2" fill="currentColor" />
          </svg>
          Categories
        </a>

        <div class="nav-section">SHARED</div>
        <a class="nav-link" routerLink="/lists" routerLinkActive="is-active">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <circle cx="6.5" cy="7" r="3.4" fill="currentColor" />
            <circle cx="12.5" cy="7" r="3.4" fill="currentColor" opacity=".55" />
            <rect x="2.5" y="11.5" width="13" height="4" rx="2" fill="currentColor" opacity=".8" />
          </svg>
          Expense lists
        </a>

        <div class="sidebar__foot">
          <a class="nav-link" routerLink="/settings" routerLinkActive="is-active">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <rect x="2" y="4" width="14" height="2.4" rx="1.2" fill="currentColor" />
              <circle cx="12" cy="5.2" r="2.6" fill="currentColor" />
              <rect x="2" y="11.5" width="14" height="2.4" rx="1.2" fill="currentColor" />
              <circle cx="6" cy="12.7" r="2.6" fill="currentColor" />
            </svg>
            Settings
          </a>
          @if (auth.user(); as user) {
            <div class="sidebar__user">
              <span class="avatar" style="background:#e8d9c4;color:#7a6a50">{{ initials(user.displayName || user.userName) }}</span>
              <div style="min-width:0">
                <div class="name">{{ user.displayName || user.userName }}</div>
                <div class="email">{{ user.email }}</div>
              </div>
              <button class="out" type="button" title="Log out" (click)="logout()">Out</button>
            </div>
          }
        </div>
      </nav>

      <main class="main">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly initials = initials;

  protected readonly drawerOpen = signal(false);
  private readonly url = signal(this.router.url);

  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/transactions', label: 'Transactions' },
    { path: '/categories', label: 'Categories' },
    { path: '/lists', label: 'Expense lists' },
  ];

  protected readonly title = computed(() => {
    const url = this.url();
    return TITLES.find((t) => t.match.test(url))?.title ?? 'ExpenseTracker';
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  protected logout(): void {
    this.drawerOpen.set(false);
    this.auth.logout();
  }
}
