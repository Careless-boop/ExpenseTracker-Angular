import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';
import { ToastHostComponent } from './shared/ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent],
  template: `
    <router-outlet />
    <app-toast-host />
  `,
})
export class App {
  // Instantiated for their side effects: the theme attribute on <html>, and
  // re-reading the user behind a session that survived a reload.
  private readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);

  constructor() {
    this.auth.loadCurrentUser().subscribe();
  }
}
