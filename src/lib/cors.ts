/**
 * CORS helpers for the storefront integration.
 *
 * The chatbot Worker is hosted at e.g. `https://agent-exam.<sub>.workers.dev`
 * and the storefront is at `https://farhan.pp.ua`. Because the chat widget
 * runs inside the storefront page (either as an iframe or via the
 * `/agents/...` WebSocket / fetch), every response must carry
 * `Access-Control-Allow-Origin: <storefront-origin>` (echoed, not `*`,
 * because we need credentials for the session).
 *
 * Allowed origins are configured via the `ALLOWED_ORIGINS` environment
 * variable (comma-separated). Localhost is included for development.
 */

const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Session-Id',
  'cf-aig-metadata',
].join(', ');

const ALLOWED_METHODS = 'GET, POST, PUT, DELETE, OPTIONS';

const EXPOSED_HEADERS = [
  'X-Session-Id',
  'cf-aig-metadata',
  'x-messages',
].join(', ');

const MAX_AGE = '86400';

/**
 * Build the set of allowed origins from the env. Memoized per-request
 * because Workers' `env` is request-scoped, but the underlying string
 * parse is cheap.
 */
function getAllowedOrigins(env: Env): Set<string> {
  const raw = env.ALLOWED_ORIGINS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isOriginAllowed(env: Env, origin: string | null): boolean {
  if (!origin) return false;
  const allowed = getAllowedOrigins(env);
  // Wildcard support: if '*' is in the list, allow any origin
  if (allowed.has('*')) return true;
  return allowed.has(origin);
}

/**
 * Build CORS response headers for a given origin. Returns an empty object
 * if the origin isn't allowed — callers can spread this unconditionally.
 */
export function getCorsHeaders(env: Env, origin: string | null): Record<string, string> {
  if (!isOriginAllowed(env, origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    'Access-Control-Max-Age': MAX_AGE,
    Vary: 'Origin',
  };
}

/**
 * Build a preflight (OPTIONS) response. Echoes the request origin so the
 * browser's preflight check passes.
 */
export function preflightResponse(env: Env, origin: string | null): Response {
  const headers = getCorsHeaders(env, origin);
  return new Response(undefined, {
    status: origin && isOriginAllowed(env, origin) ? 204 : 403,
    headers,
  });
}
