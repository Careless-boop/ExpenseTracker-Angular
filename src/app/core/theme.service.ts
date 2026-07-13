import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const KEY = 'expensetracker.theme';

/** Both themes are first-class in the design project, so the app ships both. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    effect(() => document.documentElement.setAttribute('data-theme', this.theme()));
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    localStorage.setItem(KEY, next);
  }

  private initial(): Theme {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
}
