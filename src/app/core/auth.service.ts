import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, tap, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay } from 'rxjs/operators';

import { API } from './api.config';
import { AuthResult, User } from './models';

const STORAGE_KEY = 'expensetracker.session';

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
}

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly session = signal<Session | null>(read());

  /**
   * Refresh tokens are single-use and rotate on every call, so two concurrent
   * 401s must not both spend the token. The in-flight refresh is shared.
   */
  private inFlightRefresh: Observable<string> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  hasRefreshToken(): boolean {
    return !!this.session()?.refreshToken;
  }

  login(email: string, password: string): Observable<User> {
    return this.http
      .post<AuthResult>(`${API}/auth/login`, { email, password })
      .pipe(map((r) => this.store(r)));
  }

  register(userName: string, email: string, password: string): Observable<User> {
    return this.http
      .post<AuthResult>(`${API}/auth/register`, { userName, email, password })
      .pipe(map((r) => this.store(r)));
  }

  /** Refresh the access token, rotating the stored refresh token. */
  refresh(): Observable<string> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    const refreshToken = this.session()?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token'));
    }

    this.inFlightRefresh = this.http
      .post<AuthResult>(`${API}/auth/refresh`, { refreshToken })
      .pipe(
        map((r) => {
          this.store(r);
          return r.accessToken;
        }),
        catchError((err) => {
          // A failed refresh is terminal: the rotated token is gone.
          this.clearAndRedirect();
          return throwError(() => err);
        }),
        finalize(() => (this.inFlightRefresh = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.inFlightRefresh;
  }

  /** Re-read the current user; used on a cold start with a stored session. */
  loadCurrentUser(): Observable<User | null> {
    if (!this.isAuthenticated()) {
      return of(null);
    }
    return this.http.get<User>(`${API}/auth/me`).pipe(
      tap((user) => {
        const s = this.session();
        if (s) {
          this.write({ ...s, user });
        }
      }),
      catchError(() => of(null)),
    );
  }

  logout(): void {
    // Best-effort revoke; the local session goes either way.
    this.http
      .post(`${API}/auth/logout`, {})
      .pipe(catchError(() => of(null)))
      .subscribe(() => this.clearAndRedirect());
  }

  private store(result: AuthResult): User {
    this.write({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      user: result.user,
    });
    return result.user;
  }

  private write(session: Session): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.session.set(session);
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.session.set(null);
  }

  clearAndRedirect(): void {
    this.clear();
    void this.router.navigate(['/login']);
  }
}
