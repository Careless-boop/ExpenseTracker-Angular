import { environment } from '../../environments/environment';

/**
 * All calls go through this prefix: a relative path in development (proxied by the
 * dev server), an absolute URL to the API subdomain in production.
 */
export const API = environment.apiUrl;
