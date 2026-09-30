import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createPublicResponseParity, fetchPublicCanonicalRedirect } from '../src/emdash/public-response-parity.ts';

const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
const headerSource = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const parity = createPublicResponseParity(redirects, headerSource);
const origin = 'https://cinagroup-emdash-preview.cinagroup.workers.dev';

test('every legacy exact/splat redirect runs before Astro normalization and preserves the query', () => {
  for (const line of redirects.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'))) {
    const [pattern, destination, status] = line.split(/\s+/);
    for (const path of pattern.endsWith('*') ? [pattern.slice(0, -1), pattern.replace('*', 'old/nested')] : [pattern]) {
      const response = parity.redirect(new Request(origin + path + '?source=legacy'));
      assert.equal(response.status, Number(status), path);
      assert.equal(response.headers.get('Location'), destination + '?source=legacy', path);
    }
  }
  assert.equal(parity.redirect(new Request(origin + '/homes/saas-other/')), undefined);
});

test('legacy redirects preserve non-GET methods and HEAD does not gain a body', () => {
  const response = parity.redirect(new Request(origin + '/homes/saas/', { method: 'POST', body: 'old=value' }));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), '/');
  assert.equal(parity.redirect(new Request(origin + '/index-new', { method: 'HEAD' })).body, null);
});

test('public HTML, unknown pages, and redirects receive checked-in security policy', () => {
  for (const path of ['/', '/zh/', '/contact/', '/missing/', '/homes/saas']) {
    const original = new Response('page', {
      status: path === '/missing/' ? 404 : 200,
      headers: { 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
    const response = parity.applyHeaders(new Request(origin + path), original);
    assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(
      response.headers.get('Permissions-Policy'),
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'
    );
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  }
});

test('public headers preserve stricter policies, Set-Cookie, body stream, and status', async () => {
  const original = new Response('streamed', {
    status: 201,
    statusText: 'Created',
    headers: {
      'Content-Security-Policy': "default-src 'none'",
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'private, no-store',
      'Set-Cookie': 'session=x; Secure; HttpOnly',
    },
  });
  const response = parity.applyHeaders(new Request(origin + '/_astro/example.js'), original);
  assert.equal(response.status, 201);
  assert.equal(response.statusText, 'Created');
  assert.equal(response.body, original.body);
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'none'");
  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=63072000; includeSubDomains');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Set-Cookie'), 'session=x; Secure; HttpOnly');
  assert.equal(await response.text(), 'streamed');
});

test('fingerprinted assets gain immutable caching only when their handler has no cache policy', () => {
  const response = parity.applyHeaders(new Request(origin + '/_astro/example.js'), new Response('asset'));
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(
    parity.applyHeaders(new Request(origin + '/contact/'), new Response('page')).headers.get('Cache-Control'),
    null
  );
  assert.equal(
    parity
      .applyHeaders(new Request(origin + '/missing/'), new Response('missing', { status: 404 }))
      .headers.get('Cache-Control'),
    'no-store'
  );
});

test('API, encoded admin, malformed paths, and signed previews keep their own response policies', () => {
  for (const path of [
    '/api/contact',
    '/api/contact/',
    '/_emdash/admin/setup',
    '/%5Femdash/admin/',
    '/%255Femdash/api/',
    '/cms-preview/?_preview=signed',
    '/zh/cms-preview/post/',
    '/%malformed',
  ]) {
    const original = new Response('private', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' },
    });
    assert.equal(parity.applyHeaders(new Request(origin + path), original), original);
    assert.equal(parity.redirect(new Request(origin + path)), undefined);
  }
});

test('real legacy no-slash routes get a canonical 308 without losing request/query metadata', async () => {
  const request = new Request(origin + '/zh/blog/old-post?utm=one', {
    method: 'HEAD',
    headers: { 'If-None-Match': '"old"' },
  });
  const response = await fetchPublicCanonicalRedirect(request, {
    async fetch(candidate) {
      assert.equal(candidate.url, origin + '/zh/blog/old-post/?utm=one');
      assert.equal(candidate.method, 'HEAD');
      assert.equal(candidate.headers.get('If-None-Match'), '"old"');
      return new Response(null, { status: 304 });
    },
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), '/zh/blog/old-post/?utm=one');
  assert.equal(response.body, null);
});

test('missing assets and dynamic/private/file routes continue to their handler', async () => {
  let calls = 0;
  const assets = {
    async fetch() {
      calls++;
      return new Response('missing', { status: 404 });
    },
  };
  assert.equal(await fetchPublicCanonicalRedirect(new Request(origin + '/ko/blog/new-post'), assets), undefined);
  for (const path of [
    '/api/contact',
    '/_emdash/admin',
    '/cms-preview?locale=zh',
    '/zh/cms-preview/post',
    '/rss.xml',
    '/blog/',
  ]) {
    assert.equal(await fetchPublicCanonicalRedirect(new Request(origin + path), assets), undefined);
  }
  assert.equal(
    await fetchPublicCanonicalRedirect(new Request(origin + '/contact', { method: 'POST' }), assets),
    undefined
  );
  assert.equal(calls, 1);
});

test('flat HTML asset redirects back to the requested path still produce Pages canonical 308', async () => {
  for (const status of [301, 307, 308]) {
    for (const location of ['/zh', origin + '/zh', '/zh?asset=one']) {
      const response = await fetchPublicCanonicalRedirect(new Request(origin + '/zh?utm=original'), {
        async fetch(candidate) {
          assert.equal(candidate.url, origin + '/zh/?utm=original');
          return new Response(null, { status, headers: { Location: location } });
        },
      });
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('Location'), '/zh/?utm=original');
    }
  }
  assert.equal(
    await fetchPublicCanonicalRedirect(new Request(origin + '/zh/?utm=original'), {
      async fetch() {
        assert.fail('The slash destination must not reenter the asset probe');
      },
    }),
    undefined
  );
});

test('redirects to unrelated, cross-origin, or malformed targets do not establish a canonical asset', async () => {
  for (const location of ['/other', '/zh/', '/zh.html', 'https://other.example/zh', '//other.example/zh', 'http://[']) {
    const response = await fetchPublicCanonicalRedirect(new Request(origin + '/zh'), {
      async fetch() {
        return new Response(null, { status: 308, headers: { Location: location } });
      },
    });
    assert.equal(response, undefined, location);
  }
  for (const status of [302, 303]) {
    assert.equal(
      await fetchPublicCanonicalRedirect(new Request(origin + '/zh'), {
        async fetch() {
          return new Response(null, { status, headers: { Location: '/zh' } });
        },
      }),
      undefined
    );
  }
});

test('unsupported policy syntax fails validation rather than silently dropping a future rule', () => {
  for (const source of ['/old https://example.com 301', '/old/*/nested / 301', '/old / 200', '/old/:slug / 301']) {
    assert.throws(() => createPublicResponseParity(source, headerSource), /Unsupported public/);
  }
  assert.throws(() => createPublicResponseParity(redirects, 'Header: unattached'), /Unsupported public/);
});
