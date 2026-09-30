import type { AuthResult } from 'emdash';
import { CinaAuthAccessError, getCinaAuthAccessConfig } from './cinaauth-access-core.ts';

const NATIVE_AUTH_PATHS = [
  '/_emdash/api/setup/admin',
  '/_emdash/api/setup/admin-verify',
  '/_emdash/api/setup/dev-bypass',
  '/_emdash/api/setup/dev-reset',
  '/_emdash/api/auth/passkey',
  '/_emdash/api/auth/login',
  '/_emdash/api/auth/register',
  '/_emdash/api/auth/signup',
  '/_emdash/api/auth/magic-link',
  '/_emdash/api/auth/invite',
  '/_emdash/api/auth/oauth',
  '/_emdash/api/auth/dev-bypass',
  '/_emdash/admin/login',
  '/_emdash/admin/signup',
  '/_emdash/admin/invite',
];

function privatePath(request: Request): string | null {
  let path = new URL(request.url).pathname;
  try {
    for (let i = 0; i < 3; i++) path = decodeURIComponent(path);
  } catch {
    return '/_emdash/invalid-path';
  }
  path = path.replaceAll('\\', '/').replace(/\/+/g, '/').toLowerCase();
  return path === '/_emdash' || path.startsWith('/_emdash/') ? path : null;
}

/** Keep the current preview gate's exact public-media exception. */
function isPublicMediaRead(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const prefix = '/_emdash/api/media/file/';
  const path = new URL(request.url).pathname;
  if (!path.startsWith(prefix)) return false;
  const rawKey = path.slice(prefix.length);
  let key: string;
  try {
    key = decodeURIComponent(rawKey);
    if (encodeURI(key) !== rawKey) return false;
  } catch {
    return false;
  }
  if (!key || !/^[\p{L}\p{M}\p{N}._~+ /-]+$/u.test(key)) return false;
  const segments = key.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return false;
  return !['backups', 'transfers'].includes(segments[0].toLowerCase());
}

function response(status: number, body: string | null, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extra,
    },
  });
}

export function createCinaAuthAccessGuard(dependencies: {
  runtimeBindings: () => unknown;
  authorize: (request: Request) => Promise<AuthResult>;
}) {
  return async (request: Request, next: (request: Request) => Promise<Response>): Promise<Response> => {
    if (isPublicMediaRead(request) || privatePath(request) === null) return next(request);
    try {
      getCinaAuthAccessConfig(dependencies.runtimeBindings());
    } catch {
      return response(503, 'Preview authentication unavailable');
    }
    const path = privatePath(request);
    // No password form or password-cookie fallback in Access mode. The fixed
    // target is protected by Access; query parameters cannot change it.
    if (path === '/_emdash/access' || path === '/_emdash/access/') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return response(405, 'Method not allowed', { Allow: 'GET, HEAD' });
      }
      return response(303, null, { Location: '/_emdash/admin/' });
    }
    if (NATIVE_AUTH_PATHS.some((prefix) => path === prefix || path?.startsWith(`${prefix}/`))) {
      return response(403, 'This authentication method is disabled');
    }
    try {
      await dependencies.authorize(request);
    } catch (error) {
      const status = error instanceof CinaAuthAccessError ? error.status : 401;
      return response(status, status === 503 ? 'Preview authentication unavailable' : 'Access identity required');
    }
    const native = await next(request);
    // Preserve Cloudflare's response metadata (including compressed bodies)
    // while obtaining mutable headers, as the existing Worker wrapper does.
    const result = new Response(native.body, native);
    if (!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(result.headers.get('Cache-Control') ?? '')) {
      result.headers.set('Cache-Control', 'no-store');
    }
    return result;
  };
}
