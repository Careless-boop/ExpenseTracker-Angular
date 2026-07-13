import { HttpErrorResponse } from '@angular/common/http';

/**
 * The API speaks a small, consistent error vocabulary:
 *   400 validation  → { error: "Validation failed", details: { Field: ["msg"] } }
 *   400 auth/domain → { errors: ["msg"] }  or  { error: "msg" }
 *   401 / 403 / 404 → { error: "msg" }
 *   429             → rate limited
 *   500             → generic message only
 */
export interface ApiError {
  status: number;
  message: string;
  /** Field name (camelCased to match form controls) → messages. */
  fieldErrors: Record<string, string[]>;
}

const GENERIC: Record<number, string> = {
  0: 'Cannot reach the server. Is the API running?',
  403: "You don't have permission to do that. Your role may have changed — try refreshing.",
  404: 'Not found.',
  429: 'Too many attempts. Wait a moment and try again.',
  500: 'Something went wrong on the server.',
};

function camel(key: string): string {
  // FluentValidation reports "Amount" and "Participants[0].CustomShareAmount".
  const leaf = key.split('.').pop() ?? key;
  const name = leaf.replace(/\[\d+\]$/, '');
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function toApiError(err: unknown): ApiError {
  if (!(err instanceof HttpErrorResponse)) {
    return { status: 0, message: GENERIC[0], fieldErrors: {} };
  }

  const body = err.error as
    | { error?: string; errors?: string[]; details?: Record<string, string[]> }
    | string
    | null;

  const fieldErrors: Record<string, string[]> = {};
  let message = '';

  if (body && typeof body === 'object') {
    if (body.details) {
      for (const [key, msgs] of Object.entries(body.details)) {
        const k = camel(key);
        fieldErrors[k] = [...(fieldErrors[k] ?? []), ...msgs];
      }
    }
    // Identity returns a bare list of rule violations (e.g. password rules).
    if (Array.isArray(body.errors) && body.errors.length) {
      message = body.errors.join(' ');
      fieldErrors['_'] = body.errors;
    }
    if (!message && typeof body.error === 'string') {
      message = body.error;
    }
  }

  if (!message) {
    message = GENERIC[err.status] ?? err.statusText ?? 'Request failed.';
  }
  // "Validation failed" alone tells the user nothing; the field errors carry it.
  if (message === 'Validation failed' && Object.keys(fieldErrors).length) {
    message = 'Please fix the highlighted fields.';
  }

  return { status: err.status, message, fieldErrors };
}
