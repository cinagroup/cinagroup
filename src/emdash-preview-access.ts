const COOKIE_NAME = 'emdash_preview_access';
const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();
const PREVIEW_HOSTNAME = 'cinagroup-emdash-preview.cinagroup.workers.dev';

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

/** Gate the public workers.dev admin until a preview-only secret is provisioned. */
export async function fetchWithPreviewAdminAccess(
  request: Request,
  secret: string | undefined,
  next: (request: Request) => Promise<Response>,
  now = Math.floor(Date.now() / 1000)
): Promise<Response> {
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
    const value = `v1.${issuedAt}.${await sign(secret, `v1.${issuedAt}`)}`;
    headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=${value}; Path=/_emdash; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
