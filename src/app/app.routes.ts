import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    data: { mode: 'login' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPageComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    data: { mode: 'register' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPageComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPageComponent),
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/personal/transactions-page').then(
            (m) => m.PersonalTransactionsPageComponent,
          ),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/personal/categories-page').then(
            (m) => m.PersonalCategoriesPageComponent,
          ),
      },
      {
        path: 'lists',
        loadComponent: () =>
          import('./features/lists/lists-page').then((m) => m.ListsPageComponent),
      },
      {
        path: 'lists/:id',
        loadComponent: () =>
          import('./features/lists/list-detail').then((m) => m.ListDetailComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'transactions' },
          {
            path: 'transactions',
            loadComponent: () =>
              import('./features/lists/tab-transactions').then((m) => m.TabTransactionsComponent),
          },
          {
            path: 'balances',
            loadComponent: () =>
              import('./features/lists/tab-balances').then((m) => m.TabBalancesComponent),
          },
          {
            path: 'categories',
            loadComponent: () =>
              import('./features/lists/tab-categories').then((m) => m.TabCategoriesComponent),
          },
          {
            path: 'members',
            loadComponent: () =>
              import('./features/lists/tab-members').then((m) => m.TabMembersComponent),
          },
          {
            path: 'settlements',
            loadComponent: () =>
              import('./features/lists/tab-settlements').then((m) => m.TabSettlementsComponent),
          },
        ],
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPageComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
