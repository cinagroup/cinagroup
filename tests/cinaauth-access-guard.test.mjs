import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCinaAuthAccessGuard } from '../src/emdash/cinaauth-access-guard.ts';
import { CinaAuthAccessError } from '../src/emdash/cinaauth-access-core.ts';

const bindings = () => ({
  EMDASH_AUTH_MODE: 'cinaauth-access',
  CF_ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
  CF_ACCESS_AUDIENCE: 'a'.repeat(64),
  CF_ACCESS_CINA_AUTH_IDP_ID: 'test-idp',
  CF_ACCESS_CINA_AUTH_IDP_TYPE: 'oidc',
  EMDASH_ACCESS_ADMIN_EMAIL: 'admin@example.test',
});
function fixture({ ready = true, allowed = true } = {}) {
  const calls = { authorize: 0, next: 0 };
  const guard = createCinaAuthAccessGuard({
    runtimeBindings: () => (ready ? bindings() : {}),
    authorize: async () => {
      calls.authorize++;
      if (!allowed) throw new CinaAuthAccessError(401);
      return { email: 'admin@example.test', name: 'Test admin', role: 50 };
    },
  });
  const fetch = (pathname, method = 'GET') =>
    guard(new Request(`https://preview.example.test${pathname}`, { method }), async () => {
      calls.next++;
      return new Response('native route');
    });
  return { fetch, calls };
}

for (const path of [
  '/_emdash/admin/',
  '/_emdash/admin/setup',
  '/_emdash/api/setup',
  '/_emdash/api/setup/status',
  '/_emdash/api/auth/mode',
  '/_emdash/api/manifest',
  '/_emdash/api/media/upload',
  '/_emdash/api/oauth/token',
  '/_emdash/api/mcp',
]) {
  test(`Access identity is required before native ${path}`, async () => {
    const f = fixture({ allowed: false });
    assert.equal((await f.fetch(path)).status, 401);
    assert.deepEqual(f.calls, { authorize: 1, next: 0 });
  });
}

for (const path of [
  '/_emdash/api/setup/admin',
  '/_emdash/api/setup/admin/verify',
  '/_emdash/api/setup/admin-verify',
  '/_emdash/api/setup/dev-reset',
  '/_emdash/api/setup/dev-bypass',
  '/_emdash/api/auth/passkey',
  '/_emdash/api/auth/passkey/options',
  '/_emdash/api/auth/passkey/verify',
  '/_emdash/api/auth/passkey/register/options',
  '/_emdash/api/auth/login',
  '/_emdash/api/auth/register',
  '/_emdash/api/auth/signup/request',
  '/_emdash/api/auth/magic-link/send',
  '/_emdash/api/auth/invite/accept',
  '/_emdash/api/auth/oauth/github/callback',
  '/_emdash/api/auth/dev-bypass',
  '/_emdash/admin/login',
  '/_emdash/admin/signup',
  '/_emdash/admin/invite/accept',
  '/%5Femdash/api/auth/%70asskey/verify',
  '/_EMDASH/api/auth/PASSKEY/verify',
]) {
  test(`native alternative auth is blocked: ${path}`, async () => {
    const f = fixture();
    assert.equal((await f.fetch(path, 'POST')).status, 403);
    assert.equal(f.calls.next, 0);
  });
}

test('validated administrator may use native setup write and existing OAuth/PAT features', async () => {
  const f = fixture();
  for (const path of [
    '/_emdash/api/setup',
    '/_emdash/api/oauth/register',
    '/_emdash/api/oauth/token',
    '/_emdash/api/auth/tokens',
  ]) {
    assert.equal((await f.fetch(path, 'POST')).status, 200);
  }
  assert.deepEqual(f.calls, { authorize: 4, next: 4 });
});

for (const path of [
  '/blog/article',
  '/_emdash/api/media/file/01TEST.jpg',
  '/_emdash/api/media/file/01TEST.%E4%B8%AD%E6%96%87',
  '/_emdash/api/media/file/01TEST.file%20name+suffix',
]) {
  test(`public content remains readable without Access configuration: ${path}`, async () => {
    const f = fixture({ ready: false, allowed: false });
    assert.equal((await f.fetch(path)).status, 200);
    assert.equal(f.calls.authorize, 0);
  });
}

for (const path of [
  '/_emdash/api/media/file/',
  '/_emdash/api/media/file/backups/test.json',
  '/_emdash/api/media/file/transfers/test.json',
  '/_emdash/api/media/file/%62ackups/test.json',
  '/_emdash/api/media/file/name%2Ffile.jpg',
  '/_emdash/api/media/file/name%5Cfile.jpg',
  '/_emdash/api/media/file/name%2520file.jpg',
  '/_emdash/api/media/file/a//file.jpg',
  '/_emdash/api/media/assets',
]) {
  test(`private or noncanonical media does not bypass Access: ${path}`, async () => {
    const f = fixture({ allowed: false });
    assert.equal((await f.fetch(path)).status, 401);
    assert.equal(f.calls.next, 0);
  });
}

test('media HEAD remains public; media writes require identity', async () => {
  const f = fixture({ allowed: false });
  assert.equal((await f.fetch('/_emdash/api/media/file/test.jpg', 'HEAD')).status, 200);
  assert.equal((await f.fetch('/_emdash/api/media/file/test.jpg', 'POST')).status, 401);
});

test('Access entry is a fixed redirect and accepts no password POST', async () => {
  const f = fixture({ allowed: false });
  const redirect = await f.fetch('/_emdash/access/?returnTo=https://untrusted.example.test');
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get('Location'), '/_emdash/admin/');
  assert.equal(redirect.headers.get('Cache-Control'), 'no-store');
  assert.equal((await f.fetch('/_emdash/access/', 'POST')).status, 405);
  assert.deepEqual(f.calls, { authorize: 0, next: 0 });
});

test('missing Access mode/configuration fails closed on private and access entry paths', async () => {
  const f = fixture({ ready: false });
  for (const path of ['/_emdash/admin/', '/_emdash/access/', '/_emdash/api/setup/admin']) {
    assert.equal((await f.fetch(path)).status, 503);
  }
  assert.deepEqual(f.calls, { authorize: 0, next: 0 });
});

test('authorized native responses are never cacheable and preserve status, headers, cookies and streamed body', async () => {
  const guard = createCinaAuthAccessGuard({
    runtimeBindings: bindings,
    authorize: async () => ({ email: 'admin@example.test', name: 'Test admin', role: 50 }),
  });
  const headers = new Headers({
    'Cache-Control': 'public, max-age=600',
    'X-Native-Header': 'preserved',
    'Content-Encoding': 'gzip',
  });
  headers.append('Set-Cookie', 'session=first; HttpOnly; Secure');
  headers.append('Set-Cookie', 'other=second; HttpOnly; Secure');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('native streamed content'));
      controller.close();
    },
  });
  const native = new Response(stream, { status: 202, statusText: 'Native accepted', headers });
  const result = await guard(new Request('https://preview.example.test/_emdash/admin/'), async () => native);
  assert.equal(result.status, 202);
  assert.equal(result.statusText, 'Native accepted');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('X-Native-Header'), 'preserved');
  assert.equal(result.headers.get('Content-Encoding'), 'gzip');
  assert.deepEqual(result.headers.getSetCookie(), headers.getSetCookie());
  assert.equal(result.body, stream);
  assert.equal(native.bodyUsed, false);
  assert.equal(await result.text(), 'native streamed content');
});

test('private HEAD retains a bodyless response and an existing strict cache policy', async () => {
  const guard = createCinaAuthAccessGuard({
    runtimeBindings: bindings,
    authorize: async () => ({ email: 'admin@example.test', name: 'Test admin', role: 50 }),
  });
  const result = await guard(
    new Request('https://preview.example.test/_emdash/api/manifest', { method: 'HEAD' }),
    async () => new Response(null, { status: 200, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  );
  assert.equal(result.status, 200);
  assert.equal(result.body, null);
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store, max-age=0');
});

test('public content and canonical media preserve their native cache policies', async () => {
  const guard = createCinaAuthAccessGuard({
    runtimeBindings: () => ({}),
    authorize: async () => {
      throw new Error('must not authorize public content');
    },
  });
  for (const path of ['/blog/article', '/_emdash/api/media/file/public-image.jpg']) {
    const result = await guard(
      new Request(`https://preview.example.test${path}`),
      async () => new Response('public', { headers: { 'Cache-Control': 'public, max-age=600' } })
    );
    assert.equal(result.headers.get('Cache-Control'), 'public, max-age=600');
  }
});
