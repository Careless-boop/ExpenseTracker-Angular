import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { initials } from '../core/format';
import { AvatarComponent } from '../shared/ui';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AvatarComponent],
  template: `
    <header class="chrome">
      <a class="brand" routerLink="/dashboard">
        <span class="brand__coin">$</span>
        <span class="brand__name">ExpenseTracker</span>
      </a>

      <nav class="nav">
        <a routerLink="/dashboard" routerLinkActive="is-active">Dashboard</a>
        <a routerLink="/transactions" routerLinkActive="is-active">Transactions</a>
        <a routerLink="/categories" routerLinkActive="is-active">Categories</a>
        <a routerLink="/lists" routerLinkActive="is-active">Expense Lists</a>
        <a routerLink="/settings" routerLinkActive="is-active">Settings</a>
      </nav>

      <div class="spacer"></div>

      <button
        class="theme-toggle"
        type="button"
        [title]="theme.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        (click)="theme.toggle()"
      >
        {{ theme.theme() === 'dark' ? '☀' : '◐' }}
      </button>

      @if (auth.user(); as user) {
        <div class="account">
          <app-avatar [name]="user.displayName || user.userName" />
          <span class="account__name">{{ user.displayName || user.userName }}</span>
          <button class="btn btn--xs" type="button" (click)="auth.logout()">Log out</button>
        </div>
      }
    </header>

    <router-outlet />
  `,
  styles: `
    .chrome {
      background: var(--chrome);
      border-bottom: 1px solid var(--chrome-border);
      box-shadow: 0 2px 8px rgba(20, 40, 100, 0.35);
      padding: 10px 24px;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }

    .brand__coin {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--grad-coin);
      border: 1px solid var(--grad-gold-border);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 3px rgba(0, 0, 0, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-head);
      font-weight: bold;
      font-size: 18px;
      color: var(--coin-ink);
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
    }

    .brand__name {
      font-family: var(--font-head);
      font-weight: bold;
      font-size: 18px;
      color: #fff;
      text-shadow: 0 1px 2px rgba(10, 30, 80, 0.6);
    }

    .nav {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;

      a {
        padding: 7px 16px;
        border-radius: var(--pill);
        color: #dce8ff;
        font-size: 13px;
        font-weight: bold;
        text-decoration: none;
        text-shadow: 0 1px 1px rgba(10, 30, 80, 0.5);
        border: 1px solid transparent;

        &:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }

        &.is-active {
          background: linear-gradient(180deg, #ffffff 0%, #e2edff 50%, #c6dafa 51%, #e8f1ff 100%);
          border-color: #9fb6e4;
          color: #16337a;
          text-shadow: none;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(10, 30, 80, 0.3);
        }
      }
    }

    .theme-toggle {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.18);
      border: 1px solid rgba(255, 255, 255, 0.4);
      color: #fff;
      font-size: 13px;
      cursor: pointer;

      &:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    }

    .account {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .account__name {
      color: #fff;
      font-size: 13px;
      font-weight: bold;
      text-shadow: 0 1px 1px rgba(10, 30, 80, 0.5);
    }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly initials = initials;
}
