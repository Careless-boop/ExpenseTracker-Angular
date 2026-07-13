import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { AuthService } from './auth.service';

/** Endpoints that must never carry a bearer token or trigger a refresh loop. */
const ANONYMOUS = ['/auth/login', '/auth/register', '/auth/refresh'];

function isAnonymous(url: string): boolean {
  return ANONYMOUS.some((path) => url.includes(path));
}

function withToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  if (isAnonymous(req.url)) {
    return next(req);
  }

  const token = auth.accessToken();
  const request = token ? withToken(req, token) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      const is401 = err instanceof HttpErrorResponse && err.status === 401;

      if (!is401 || !auth.hasRefreshToken()) {
        return throwError(() => err);
      }

      // Access tokens live 60 minutes; on expiry, refresh once and replay.
      // AuthService shares the in-flight refresh so parallel 401s spend one token.
      return auth.refresh().pipe(
        switchMap((fresh) => next(withToken(req, fresh))),
        catchError(() => throwError(() => err)),
      );
    }),
  );
};
