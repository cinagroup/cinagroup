import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  fetchWithPreviewAdminAccess,
  isAstroPrerenderRequest,
  isIsolatedPreviewHostname,
} from '../src/emdash-preview-access.ts';

const host = 'https://cinagroup-emdash-preview.example.workers.dev';
const secret = 'preview-secret-with-at-least-32-characters';
const now = 1_800_000_000;

test('preview Worker accepts only its exact workers.dev hostname', () => {
  assert.equal(isIsolatedPreviewHostname('https://cinagroup-emdash-preview.cinagroup.workers.dev/'), true);
  for (const url of [
    'https://cinagroup.com/',
    'https://cinagroup-emdash-preview.cinagroup.workers.dev.evil.example/',
    'https://other.cinagroup.workers.dev/',
  ]) {
    assert.equal(isIsolatedPreviewHostname(url), false);
  }
});

test('only Astro Cloudflare loopback prerender endpoints bypass the public hostname lock', () => {
  for (const path of ['/__astro_static_paths', '/__astro_prerender', '/__astro_static_images']) {
    assert.equal(isAstroPrerenderRequest(`http://localhost:42817${path}`), true);
  }
  for (const url of [
    'https://localhost:42817/__astro_prerender',
    'http://localhost:42817/_emdash/admin/setup',
    'http://localhost:42817/',
    'http://127.0.0.1:42817/__astro_prerender',
    'http://cinagroup.com:42817/__astro_prerender',
  ]) {
    assert.equal(isAstroPrerenderRequest(url), false);
  }
});

test('preview setup stays closed until a strong secret is configured', async () => {
  let forwarded = false;
  const next = async () => {
    forwarded = true;
    return new Response('unexpected');
  };
  for (const path of ['/_emdash/api/setup/admin', '/%5Femdash/api/setup/admin']) {
    for (const configured of [undefined, '', 'weak']) {
      const response = await fetchWithPreviewAdminAccess(
        new Request(`${host}${path}`, { method: 'POST' }),
        configured,
        next,
        now
      );
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  assert.equal(forwarded, false);
});

test('preview admin requires a password, then accepts only a fresh signed cookie', async () => {
  let calls = 0;
  const next = async (request) => {
    calls++;
    assert.equal(request.headers.get('Authorization'), null);
    return new Response('admin');
  };
  const loginUrl = `${host}/_emdash/admin/setup`;
  const anonymous = await fetchWithPreviewAdminAccess(new Request(loginUrl), secret, next, now);
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('WWW-Authenticate'), /^Basic /);

  const wrong = new Request(loginUrl, {
    headers: { Authorization: `Basic ${Buffer.from('preview:wrong').toString('base64')}` },
  });
  assert.equal((await fetchWithPreviewAdminAccess(wrong, secret, next, now)).status, 401);
  assert.equal(calls, 0);

  const login = new Request(loginUrl, {
    headers: { Authorization: `Basic ${Buffer.from(`preview:${secret}`).toString('base64')}` },
  });
  const response = await fetchWithPreviewAdminAccess(login, secret, next, now);
  assert.equal(response.status, 200);
  const cookie = response.headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(cookie, /Path=\/_emdash/);
  assert.equal(calls, 1);

  const cookieValue = cookie.split(';')[0];
  const api = new Request(`${host}/_emdash/api/setup/admin/verify`, {
    method: 'POST',
    headers: { Cookie: cookieValue },
  });
  assert.equal((await fetchWithPreviewAdminAccess(api, secret, next, now + 60)).status, 200);
  assert.equal(calls, 2);
  assert.equal((await fetchWithPreviewAdminAccess(api, secret, next, now + 60 * 60 * 8)).status, 401);
  assert.equal(
    (
      await fetchWithPreviewAdminAccess(
        new Request(`${host}/_emdash/api/setup`, {
          headers: { Cookie: `${cookieValue.slice(0, -1)}${cookieValue.endsWith('0') ? '1' : '0'}` },
        }),
        secret,
        next,
        now
      )
    ).status,
    401
  );
  assert.equal(calls, 2);
});

test('public preview routes bypass the admin gate, while an admin path on any host remains protected', async () => {
  const next = async () => new Response('site');
  for (const url of [`${host}/`, `${host}/cms-preview/`]) {
    const response = await fetchWithPreviewAdminAccess(new Request(url), undefined, next, now);
    assert.equal(response.status, 200);
  }
  const mismatchedHostAdmin = await fetchWithPreviewAdminAccess(
    new Request('https://cinagroup.com/_emdash/admin/'),
    undefined,
    next,
    now
  );
  assert.equal(mismatchedHostAdmin.status, 503);
});

test('canonical public media GET and HEAD reads bypass the admin gate without issuing an access cookie', async () => {
  let calls = 0;
  const next = async (request) => {
    calls++;
    return new Response(request.method === 'HEAD' ? null : 'media', {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  };
  const keys = [
    '01K7P4J26T0WYS88MQ72GHAFBJ.png',
    'images/pilot-image_1~small.webp',
    '01K7P4J26T0WYS88MQ72GHAFBJ.图片',
    '01K7P4J26T0WYS88MQ72GHAFBJ.image extension+png',
    'images/résumé.png',
    'images/re\u0301sume\u0301.png',
  ];
  for (const method of ['GET', 'HEAD']) {
    for (const configured of [undefined, secret]) {
      for (const key of keys) {
        const url = `${host}/_emdash/api/media/file/${encodeURI(key)}`;
        // Astro's router decodes URI path text before creating the media key param.
        assert.equal(decodeURI(new URL(url).pathname).slice('/_emdash/api/media/file/'.length), key);
        const response = await fetchWithPreviewAdminAccess(new Request(url, { method }), configured, next, now);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'image/png');
        assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
        assert.equal(response.headers.get('Set-Cookie'), null);
      }
    }
  }
  assert.equal(calls, keys.length * 4);
});

test('media writes, private keys, ambiguous paths and administrative APIs cannot bypass the preview gate', async () => {
  let forwarded = false;
  const next = async () => {
    forwarded = true;
    return new Response('unexpected');
  };
  const paths = [
    '/_emdash/api/media/file/',
    '/_emdash/api/media/file/backups/snapshot.zip',
    '/_emdash/api/media/file/Backups/snapshot.zip',
    '/_emdash/api/media/file/transfers/imports/staged.png',
    '/_emdash/api/media/file/transfers',
    '/_emdash/api/media/file/images//pilot.png',
    '/_emdash/api/media/file/pilot.png/',
    '/_emdash/api/media/file/pilot%2epng',
    '/_emdash/api/media/file/pilot%2Bpng',
    '/_emdash/api/media/file/pilot%2520image.png',
    '/_emdash/api/media/file/pilot%00image.png',
    '/_emdash/api/media/file/pilot%C0%AFimage.png',
    '/_emdash/api/media/file/pilot.%e5%9b%be',
    '/_emdash/api/media/file/pilot.%25E5%259B%25BE',
    '/_emdash/api/media/file/%62ackups/snapshot.zip',
    '/_emdash/api/media/file/%2562ackups/snapshot.zip',
    '/_emdash/api/media/file/images%2f..%2fbackups/snapshot.zip',
    '/_emdash/api/media/file/images%5c..%5cbackups/snapshot.zip',
    '/_emdash/api/media/file/%2e%2e/%2e%2e/%2e%2e/admin/setup',
    '/%5Femdash/api/media/file/pilot.png',
    '/_emdash//api/media/file/pilot.png',
    '/_EMDASH/api/media/file/pilot.png',
    '/_emdash/api/media/file/pilot%zz.png',
    '/_emdash/api/media/asset/01K7P4J26T0WYS88MQ72GHAFBJ/pilot.png',
    '/_emdash/api/media/upload-url',
    '/_emdash/api/media/01K7P4J26T0WYS88MQ72GHAFBJ/upload',
    '/_emdash/api/media/01K7P4J26T0WYS88MQ72GHAFBJ/confirm',
    '/_emdash/api/setup/admin',
  ];
  for (const path of paths) {
    for (const method of ['GET', 'HEAD']) {
      const request = new Request(`${host}${path}`, { method });
      assert.equal((await fetchWithPreviewAdminAccess(request, undefined, next, now)).status, 503, path);
      assert.equal((await fetchWithPreviewAdminAccess(request, secret, next, now)).status, 401, path);
    }
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const request = new Request(`${host}/_emdash/api/media/file/pilot.png`, { method });
    assert.equal((await fetchWithPreviewAdminAccess(request, secret, next, now)).status, 401, method);
  }
  assert.equal(forwarded, false);
});

const accessOrigin = 'https://cinagroup-emdash-preview.cinagroup.workers.dev';
const accessUrl = accessOrigin + '/_emdash/access/';
const encodedPassword = (password) => new URLSearchParams({ password }).toString();

function accessPost(
  body,
  { origin = accessOrigin, contentType = 'application/x-www-form-urlencoded', headers = {} } = {}
) {
  const requestHeaders = new Headers(headers);
  if (origin !== null) requestHeaders.set('Origin', origin);
  if (contentType !== null) requestHeaders.set('Content-Type', contentType);
  return new Request(accessUrl, {
    method: 'POST',
    headers: requestHeaders,
    body,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}

const forbiddenLoginForward = async () => assert.fail('The outer access form must not reach EmDash');

function assertLoginSecurityHeaders(response) {
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Type'), /^text\/html(?:;|$)/);
  const policy = response.headers.get('Content-Security-Policy');
  assert.match(policy, /(?:^|;)\s*default-src\s+'none'(?:;|$)/);
  assert.match(policy, /(?:^|;)\s*form-action\s+'self'(?:;|$)/);
  assert.match(policy, /(?:^|;)\s*base-uri\s+'none'(?:;|$)/);
  assert.match(policy, /(?:^|;)\s*frame-ancestors\s+'none'(?:;|$)/);
  assert.equal(response.headers.get('WWW-Authenticate'), null);
}

test('canonical access GET and HEAD serve a private, script-free form without Basic challenges or a password value', async () => {
  const get = await fetchWithPreviewAdminAccess(new Request(accessUrl), secret, forbiddenLoginForward, now);
  assert.equal(get.status, 200);
  assertLoginSecurityHeaders(get);
  assert.equal(get.headers.get('Set-Cookie'), null);
  const html = await get.text();
  assert.match(html, /<form\b[^>]*method=["']post["']/i);
  assert.match(html, /<form\b[^>]*action=["']\/_emdash\/access\/["']/i);
  assert.match(html, /<input\b[^>]*type=["']password["']/i);
  assert.match(html, /<input\b[^>]*name=["']password["']/i);
  assert.doesNotMatch(html, /<script\b/i);
  assert(!html.includes(secret));
  assert(!html.includes(Buffer.from('preview:' + secret).toString('base64')));
  const head = await fetchWithPreviewAdminAccess(
    new Request(accessUrl, { method: 'HEAD' }),
    secret,
    forbiddenLoginForward,
    now
  );
  assert.equal(head.status, 200);
  assertLoginSecurityHeaders(head);
  assert.equal(head.body, null);
  assert.equal(head.headers.get('Set-Cookie'), null);
});

test('access form stays unavailable until a strong secret exists and encoded aliases stay behind the original gate', async () => {
  for (const configured of [undefined, '', 'weak']) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const request = method === 'POST' ? accessPost(encodedPassword(secret)) : new Request(accessUrl, { method });
      const response = await fetchWithPreviewAdminAccess(request, configured, forbiddenLoginForward, now);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('Set-Cookie'), null);
    }
  }
  for (const path of ['/_emdash/access', '/%5Femdash/access/', '/_emdash//access/', '/_EMDASH/access/']) {
    const response = await fetchWithPreviewAdminAccess(
      new Request(accessOrigin + path),
      secret,
      forbiddenLoginForward,
      now
    );
    assert.equal(response.status, 401, path);
  }
});

test('access form rejects unsupported methods and cross-origin or missing-Origin login attempts', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await fetchWithPreviewAdminAccess(
      new Request(accessUrl, { method }),
      secret,
      forbiddenLoginForward,
      now
    );
    assert.equal(response.status, 405, method);
    assert.deepEqual(
      response.headers
        .get('Allow')
        .split(',')
        .map((part) => part.trim())
        .sort(),
      ['GET', 'HEAD', 'POST']
    );
    assert.equal(response.headers.get('WWW-Authenticate'), null);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  for (const origin of [
    null,
    'null',
    'https://cinagroup.com',
    accessOrigin + '.evil.example',
    accessOrigin + '/',
    accessOrigin.replace('https:', 'http:'),
  ]) {
    const response = await fetchWithPreviewAdminAccess(
      accessPost(encodedPassword(secret), { origin }),
      secret,
      forbiddenLoginForward,
      now
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('WWW-Authenticate'), null);
    assert(!(await response.text()).includes(secret));
  }
});

test('access form accepts only URL-encoded media and exactly one valid password field', async () => {
  for (const contentType of [null, 'application/json', 'text/plain', 'multipart/form-data; boundary=test']) {
    const response = await fetchWithPreviewAdminAccess(
      accessPost(encodedPassword(secret), { contentType }),
      secret,
      forbiddenLoginForward,
      now
    );
    assert.equal(response.status, 415);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('WWW-Authenticate'), null);
  }
  for (const body of [
    '',
    'other=value',
    encodedPassword(secret) + '&' + encodedPassword(secret),
    encodedPassword(secret) + '&unexpected=value',
    new URLSearchParams({ Password: secret }).toString(),
    encodedPassword('short'),
    encodedPassword('x'.repeat(129)),
    encodedPassword(secret + '\n'),
    encodedPassword(secret + '\t'),
    encodedPassword(secret + '\0'),
    encodedPassword(secret + '\x7f'),
    encodedPassword(secret + '中文'),
  ]) {
    const response = await fetchWithPreviewAdminAccess(accessPost(body), secret, forbiddenLoginForward, now);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('WWW-Authenticate'), null);
    assert(!(await response.text()).includes(secret));
  }
});

test('access POST rejects oversized declared and actual bodies even when Content-Length lies or is absent', async () => {
  for (const request of [
    accessPost(encodedPassword(secret), { headers: { 'Content-Length': '2049' } }),
    accessPost('password=' + 'x'.repeat(2049)),
    accessPost('password=' + 'x'.repeat(2049), { headers: { 'Content-Length': '1' } }),
  ]) {
    const response = await fetchWithPreviewAdminAccess(request, secret, forbiddenLoginForward, now);
    assert.equal(response.status, 413);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('WWW-Authenticate'), null);
  }
});

test('access POST limits chunked streams without draining content past the byte budget', async () => {
  let reads = 0;
  let canceled = false;
  const stream = new ReadableStream(
    {
      pull(controller) {
        reads++;
        if (reads === 1) controller.enqueue(new TextEncoder().encode(encodedPassword(secret)));
        else if (reads === 2) controller.enqueue(new TextEncoder().encode('x'.repeat(2049)));
        else throw new Error('Access reader exceeded its byte budget');
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 }
  );
  const request = accessPost(stream);
  assert.equal(request.headers.get('Content-Length'), null);
  const response = await fetchWithPreviewAdminAccess(request, secret, forbiddenLoginForward, now);
  assert.equal(response.status, 413);
  assert.equal(reads, 2);
  assert.equal(canceled, true);
  assert.equal(response.headers.get('Set-Cookie'), null);
});

test('correct form login issues the existing HMAC cookie and a fixed redirect without echoing credentials', async () => {
  const request = new Request(accessUrl + '?next=https://evil.example/', {
    method: 'POST',
    headers: { Origin: accessOrigin, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: encodedPassword(secret),
  });
  const response = await fetchWithPreviewAdminAccess(request, secret, forbiddenLoginForward, now);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), '/_emdash/admin/');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('WWW-Authenticate'), null);
  const cookie = response.headers.get('Set-Cookie');
  assert.match(cookie, /^emdash_preview_access=v1\.1800000000\.[a-f0-9]{64};/);
  assert.match(cookie, /Path=\/_emdash(?:;|$)/);
  assert.match(cookie, /Max-Age=28800(?:;|$)/);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert(!cookie.includes(secret));
  const html = await response.text();
  assert(!html.includes(secret));
  assert(!html.includes(cookie.split(';')[0]));
  const basic = await fetchWithPreviewAdminAccess(
    new Request(accessOrigin + '/_emdash/admin/setup', {
      headers: { Authorization: 'Basic ' + Buffer.from('preview:' + secret).toString('base64') },
    }),
    secret,
    async () => new Response('Admin'),
    now
  );
  assert.equal(cookie.split(';')[0], basic.headers.get('Set-Cookie').split(';')[0]);
});

test('form-login cookie authorizes native API requests while preserving their body and Bearer credentials', async () => {
  const login = await fetchWithPreviewAdminAccess(
    accessPost(encodedPassword(secret)),
    secret,
    forbiddenLoginForward,
    now
  );
  const cookieValue = login.headers.get('Set-Cookie').split(';')[0];
  const nativeBearer = 'Bearer local-native-api-test-token';
  const body = JSON.stringify({ title: 'Draft editorial test' });
  let calls = 0;
  const response = await fetchWithPreviewAdminAccess(
    new Request(accessOrigin + '/_emdash/api/content/posts', {
      method: 'POST',
      headers: { Cookie: cookieValue, Authorization: nativeBearer, 'Content-Type': 'application/json' },
      body,
    }),
    secret,
    async (request) => {
      calls++;
      assert.equal(request.method, 'POST');
      assert.equal(new URL(request.url).pathname, '/_emdash/api/content/posts');
      assert.equal(request.headers.get('Authorization'), nativeBearer);
      assert.equal(await request.text(), body);
      return Response.json({ saved: true });
    },
    now + 60
  );
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Set-Cookie'), null);
  const result = await response.text();
  for (const value of [secret, nativeBearer, cookieValue]) assert(!result.includes(value));
  assert.equal(
    (
      await fetchWithPreviewAdminAccess(
        new Request(accessOrigin + '/_emdash/api/setup', { headers: { Cookie: cookieValue } }),
        'rotated-secret-with-at-least-32-characters',
        forbiddenLoginForward,
        now + 60
      )
    ).status,
    401
  );
});

test('wrong form passwords return identical generic HTML without reflecting values or triggering Basic login', async () => {
  const passwords = ['wrong-preview-password-with-32-characters', 'another-invalid-password-with-32-characters'];
  const bodies = [];
  for (const password of passwords) {
    const response = await fetchWithPreviewAdminAccess(
      accessPost(encodedPassword(password)),
      secret,
      forbiddenLoginForward,
      now
    );
    assert.equal(response.status, 200);
    assertLoginSecurityHeaders(response);
    assert.equal(response.headers.get('Set-Cookie'), null);
    const html = await response.text();
    for (const value of [password, secret, Buffer.from('preview:' + secret).toString('base64')])
      assert(!html.includes(value));
    bodies.push(html);
  }
  assert.equal(bodies[0], bodies[1]);
});

test('unreadable login bodies return a generic invalid-body error without unsafe diagnostics', async () => {
  const diagnostic = 'unsafe login body ' + secret;
  const stream = new ReadableStream({
    start(controller) {
      controller.error(new TypeError(diagnostic));
    },
  });
  const response = await fetchWithPreviewAdminAccess(accessPost(stream), secret, forbiddenLoginForward, now);
  assert.equal(response.status, 400);
  const html = await response.text();
  assert(!html.includes(diagnostic));
  assert(!html.includes(secret));
  assert.equal(response.headers.get('WWW-Authenticate'), null);
  assert.equal(response.headers.get('Set-Cookie'), null);
});

test('access page rejects another hostname even when its submitted Origin matches that hostname', async () => {
  for (const method of ['GET', 'HEAD', 'POST']) {
    const response = await fetchWithPreviewAdminAccess(
      new Request('https://cinagroup.com/_emdash/access/', {
        method,
        ...(method === 'POST'
          ? {
              headers: { Origin: 'https://cinagroup.com', 'Content-Type': 'application/x-www-form-urlencoded' },
              body: encodedPassword(secret),
            }
          : {}),
      }),
      secret,
      forbiddenLoginForward,
      now
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('WWW-Authenticate'), null);
  }
});

test('invalid UTF-8 login bytes are rejected before decoding or password comparison', async () => {
  const response = await fetchWithPreviewAdminAccess(
    accessPost(new Uint8Array([0xff])),
    secret,
    forbiddenLoginForward,
    now
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('WWW-Authenticate'), null);
});
