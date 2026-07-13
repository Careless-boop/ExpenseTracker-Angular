/**
 * Production. The SPA is served from expenses.viktorhalushka.dev and the API from
 * api.viktorhalushka.dev, so calls are cross-origin: the API's Cors:AllowedOrigins
 * must list the SPA origin. Swapped in by the `production` fileReplacements.
 */
export const environment = {
  apiUrl: 'https://api.viktorhalushka.dev/api/v1',
};
