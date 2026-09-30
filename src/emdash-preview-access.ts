const COOKIE_NAME = 'emdash_preview_access';
const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();
const PREVIEW_HOSTNAME = 'cinagroup-emdash-preview.cinagroup.workers.dev';
const ACCESS_PATH = '/_emdash/access/';
const FORM_BODY_LIMIT = 2048;

export function isIsolatedPreviewHostname(url: string): boolean {
  return new URL(url).hostname.toLowerCase() === PREVIEW_HOSTNAME;
}

/** Astro's Cloudflare adapter invokes these loopback endpoints while prerendering at build time. */
export function isAstroPrerenderRequest(url: string): boolean {
  const parsed = new URL(url);
  return (
    parsed.protocol === 'http:' &&
    parsed.hostname === 'localhost' &&
    parsed.port !== '' &&
    ['/__astro_static_paths', '/__astro_prerender', '/__astro_static_images'].includes(parsed.pathname)
  );
}

function isPreviewAdminRequest(request: Request): boolean {
  const url = new URL(request.url);
  let path = url.pathname;
  try {
    // Decode conservatively so encoded path segments cannot reach Astro without passing this gate.
    for (let i = 0; i < 3; i++) path = decodeURIComponent(path);
  } catch {
    return true;
  }
  path = path.replace(/\/+/g, '/').toLowerCase();
  return path === '/_emdash' || path.startsWith('/_emdash/');
}

/** Only canonical public file reads bypass the gate; upload and metadata APIs stay protected. */
function isPublicPreviewMediaRequest(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const prefix = '/_emdash/api/media/file/';
  const path = new URL(request.url).pathname;
  if (!path.startsWith(prefix)) return false;

  // Unicode extensions and spaces need one canonical URL encoding. Reject
  // encoded separators, ASCII aliases and further encoding before Astro decodes.
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

function deny(status: 401 | 503): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  if (status === 401) headers.set('WWW-Authenticate', 'Basic realm="CinaGroup EmDash preview"');
  return new Response(status === 401 ? 'Preview admin access required' : 'Preview admin unavailable', {
    status,
    headers,
  });
}

async function sign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function equalHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

async function validCookie(request: Request, secret: string, now: number): Promise<boolean> {
  const cookie = request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  const match = /^v1\.(\d{10})\.([a-f0-9]{64})$/.exec(cookie ?? '');
  if (!match) return false;
  const issuedAt = Number(match[1]);
  if (issuedAt > now || now - issuedAt >= SESSION_SECONDS) return false;
  return equalHex(match[2], await sign(secret, `v1.${issuedAt}`));
}

function basicPassword(request: Request): string | undefined {
  const authorization = request.headers.get('Authorization');
  const encoded = /^Basic ([A-Za-z0-9+/=]{1,4096})$/i.exec(authorization ?? '')?.[1];
  if (!encoded) return;
  try {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(':');
    if (separator < 0 || decoded.slice(0, separator) !== 'preview') return;
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(decoded.slice(separator + 1), (character) => character.charCodeAt(0))
    );
  } catch {
    return;
  }
}

const ACCESS_SCRIPT = String.raw`(() => {
  const form = document.querySelector('form');
  const button = form && form.querySelector('button[type="submit"]');
  const error = document.getElementById('preview-access-error');
  if (!form || !button || !error) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    error.hidden = true;
    error.textContent = '';
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new URLSearchParams(new FormData(form)),
        credentials: 'same-origin',
        mode: 'same-origin',
        redirect: 'follow',
      });
      const destination = new URL(response.url);
      if (!response.ok || destination.origin !== location.origin || destination.username || destination.password || !/^\/_emdash\/admin(?:\/|$)/.test(destination.pathname)) {
        throw new Error('Sign-in failed');
      }
      location.assign('/_emdash/admin/');
    } catch {
      error.textContent = 'Sign-in failed. Check your preview password.';
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
})();`;

function accessHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-2yR28yZaY0X815CP6tyZnAtV92Hw3IfEIUhc2G2IPWk='; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow',
  });
}

function accessPage(head = false, failed = false): Response {
  const headers = accessHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Preview access | CinaGroup</title>
<style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f4f6f8;color:#152333;font:16px/1.5 system-ui,sans-serif}main{box-sizing:border-box;width:min(440px,calc(100% - 32px));padding:32px;background:white;border:1px solid #d6dce3;border-radius:12px}h1{margin:0 0 12px;font-size:26px}p{margin:0 0 20px}label{display:block;font-weight:600;margin-bottom:8px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:6px}input{border:1px solid #8190a0}button{margin-top:20px;background:#152333;color:white;border:0;cursor:pointer}:focus-visible{outline:3px solid #4788cb;outline-offset:3px}.error{color:#a32626}</style></head>
<body><main><h1>Preview access</h1><p>Sign in with your preview password to continue to EmDash.</p><p>Username: <strong>preview</strong></p><p id="preview-access-error" class="error" role="alert" ${failed ? '' : 'hidden'}>${failed ? 'Sign-in failed. Check your preview password.' : ''}</p>
<form method="post" action="${ACCESS_PATH}"><label for="preview-password">Preview password</label><input id="preview-password" name="password" type="password" autocomplete="current-password" minlength="32" maxlength="128" required autofocus><button type="submit">Continue to EmDash</button></form></main><script>${ACCESS_SCRIPT}</script></body></html>`;
  return new Response(head ? null : html, { headers });
}

function rejectAccess(status: number, headers = accessHeaders()): Response {
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  return new Response('Preview login request rejected', { status, headers });
}

async function readAccessPassword(request: Request): Promise<string | Response> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded')
    return rejectAccess(415);
  const declaredSize = request.headers.get('Content-Length');
  if (/^\d+$/.test(declaredSize ?? '') && Number(declaredSize) > FORM_BODY_LIMIT) return rejectAccess(413);
  const reader = request.body?.getReader();
  if (!reader) return rejectAccess(400);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > FORM_BODY_LIMIT) {
        await reader.cancel();
        return rejectAccess(413);
      }
      parts.push(value);
    }
  } catch {
    return rejectAccess(400);
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  let fields: URLSearchParams;
  try {
    fields = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return rejectAccess(400);
  }
  const password = fields.get('password');
  if (fields.size !== 1 || fields.getAll('password').length !== 1 || !/^[\x21-\x7e]{32,128}$/.test(password ?? ''))
    return rejectAccess(400);
  return password!;
}

async function accessCookie(secret: string, issuedAt: number): Promise<string> {
  const value = `v1.${issuedAt}.${await sign(secret, `v1.${issuedAt}`)}`;
  return `${COOKIE_NAME}=${value}; Path=/_emdash; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

async function handleAccessPage(request: Request, secret: string | undefined, now: number): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== `https://${PREVIEW_HOSTNAME}`) return rejectAccess(403);
  if (!secret || secret.length < 32) return deny(503);
  if (request.method === 'GET' || request.method === 'HEAD') return accessPage(request.method === 'HEAD');
  if (request.method !== 'POST') {
    const headers = accessHeaders();
    headers.set('Allow', 'GET, HEAD, POST');
    return rejectAccess(405, headers);
  }
  if (request.headers.get('Origin') !== url.origin) return rejectAccess(403);
  const password = await readAccessPassword(request);
  if (password instanceof Response) return password;
  if (!equalHex(await sign(password, 'preview-password'), await sign(secret, 'preview-password')))
    return accessPage(false, true);
  const headers = accessHeaders();
  headers.set('Location', '/_emdash/admin/');
  headers.set('Set-Cookie', await accessCookie(secret, now));
  return new Response(null, { status: 303, headers });
}

/** Gate the public workers.dev admin until a preview-only secret is provisioned. */
export async function fetchWithPreviewAdminAccess(
  request: Request,
  secret: string | undefined,
  next: (request: Request) => Promise<Response>,
  now = Math.floor(Date.now() / 1000)
): Promise<Response> {
  if (new URL(request.url).pathname === ACCESS_PATH) return handleAccessPage(request, secret, now);
  if (isPublicPreviewMediaRequest(request)) return next(request);
  if (!isPreviewAdminRequest(request)) return next(request);
  if (!secret || secret.length < 32) return deny(503);

  let issuedAt: number | undefined;
  if (!(await validCookie(request, secret, now))) {
    const supplied = basicPassword(request);
    if (supplied === undefined) return deny(401);
    const expected = await sign(secret, 'preview-password');
    if (!equalHex(await sign(supplied, 'preview-password'), expected)) return deny(401);
    issuedAt = now;
  }

  // Browser Basic credentials are only for this outer gate; EmDash owns its Authorization header.
  const forwardedHeaders = new Headers(request.headers);
  if (/^Basic /i.test(forwardedHeaders.get('Authorization') ?? '')) {
    forwardedHeaders.delete('Authorization');
  }
  const response = await next(new Request(request, { headers: forwardedHeaders }));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  if (issuedAt !== undefined) {
    headers.append('Set-Cookie', await accessCookie(secret, issuedAt));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
