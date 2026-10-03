import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canonicalizeCmsBlogResponse,
  createPublicResponseParity,
  fetchGeneratedSitemapAsset,
  fetchPublicCanonicalRedirect,
} from '../src/emdash/public-response-parity.ts';

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

test('successful CMS-only blog indexes and published details canonicalize without losing the query', () => {
  for (const path of [
    '/ko/blog',
    '/ru/blog',
    '/es/blog',
    '/pt/blog',
    '/fr/blog',
    '/blog/new-post',
    '/zh/blog/new-post',
    '/ja/blog/new-post',
  ]) {
    const request = new Request(origin + path + '?source=one&token=a%2Fb&source=two');
    const rendered = new Response('<html>published</html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
    const response = canonicalizeCmsBlogResponse(request, rendered);
    assert.equal(response.status, 308, path);
    assert.equal(response.headers.get('Location'), path + '/?source=one&token=a%2Fb&source=two', path);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', path);
    assert.equal(response.body, null, path);
    assert.equal(request.url, origin + path + '?source=one&token=a%2Fb&source=two', path);
  }
  for (const path of ['/blog', '/zh/blog', '/ja/blog']) {
    const response = canonicalizeCmsBlogResponse(
      new Request(origin + path),
      new Response('<html>index</html>', { headers: { 'Content-Type': 'text/html' } })
    );
    assert.equal(response.status, 308, path);
    assert.equal(response.headers.get('Location'), path + '/', path);
  }
});

test('HEAD canonical redirect has no body; slash and legacy asset paths retain existing behavior', async () => {
  const head = new Request(origin + '/ko/blog/new-post?lang=ko', { method: 'HEAD' });
  const rendered = new Response(null, { headers: { 'Content-Type': 'text/html' } });
  const canonical = canonicalizeCmsBlogResponse(head, rendered);
  assert.equal(canonical.status, 308);
  assert.equal(canonical.headers.get('Location'), '/ko/blog/new-post/?lang=ko');
  assert.equal(canonical.headers.get('Cache-Control'), 'no-store');
  assert.equal(canonical.body, null);

  const slash = new Response('<html>canonical</html>', { headers: { 'Content-Type': 'text/html' } });
  assert.equal(canonicalizeCmsBlogResponse(new Request(origin + '/ko/blog/new-post/'), slash), slash);

  const legacy = new Request(origin + '/zh/blog/legacy-post?src=old');
  const assetRedirect = await fetchPublicCanonicalRedirect(legacy, {
    async fetch(candidate) {
      assert.equal(candidate.url, origin + '/zh/blog/legacy-post/?src=old');
      return new Response('<html>legacy</html>', { headers: { 'Content-Type': 'text/html' } });
    },
  });
  assert.equal(assetRedirect.status, 308);
  assert.equal(assetRedirect.headers.get('Location'), '/zh/blog/legacy-post/?src=old');
});

test('missing, draft, failed, non-HTML, and unsafe-method CMS responses do not canonicalize', async () => {
  const url = origin + '/ko/blog/new-post?draft=1';
  for (const status of [404, 503]) {
    const rendered = new Response('unavailable', { status, headers: { 'Content-Type': 'text/html' } });
    assert.equal(canonicalizeCmsBlogResponse(new Request(url), rendered), rendered);
  }
  for (const contentType of ['application/json', 'text/plain', 'text/htmlbogus']) {
    const rendered = new Response('not a rendered page', { headers: { 'Content-Type': contentType } });
    assert.equal(canonicalizeCmsBlogResponse(new Request(url), rendered), rendered);
  }
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer example' },
    body: '{"draft":true}',
  });
  const rendered = new Response('untouched', { headers: { 'Content-Type': 'text/html' } });
  assert.equal(canonicalizeCmsBlogResponse(request, rendered), rendered);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('Authorization'), 'Bearer example');
  assert.equal(await request.text(), '{"draft":true}');
  assert.equal(await rendered.text(), 'untouched');
});

test('native admin/API/media, signed previews, encoded aliases, and unknown shapes are untouched', async () => {
  for (const path of [
    '/_emdash/admin/setup',
    '/_emdash/api/setup/status',
    '/_emdash/api/auth/mode',
    '/_emdash/api/media/file/example.png',
    '/cms-preview/secret-post?_preview=signed%2Ftoken',
    '/zh/cms-preview/secret-post?_preview=signed%2Ftoken',
    '/%62log/new-post',
    '/blog/%6eew-post',
    '/blog/Bad-Slug',
    '/blog/unknown/path',
    '/en/blog/new-post',
  ]) {
    const request = new Request(origin + path, { headers: { Authorization: 'Bearer example' } });
    const rendered = new Response('untouched', { headers: { 'Content-Type': 'text/html' } });
    assert.equal(canonicalizeCmsBlogResponse(request, rendered), rendered, path);
    assert.equal(request.url, origin + path, path);
    assert.equal(request.headers.get('Authorization'), 'Bearer example', path);
    assert.equal(await rendered.text(), 'untouched', path);
  }
});

test('generated sitemap index and canonical numeric chunks use the static asset response unchanged', async () => {
  for (const path of ['/sitemap-index.xml', '/sitemap-0.xml', '/sitemap-1.xml', '/sitemap-123.xml']) {
    for (const method of ['GET', 'HEAD']) {
      const request = new Request(origin + path + '?source=one&token=a%2Fb', {
        method,
        headers: { 'If-None-Match': '"sitemap-version"', Accept: 'application/xml' },
      });
      const asset = new Response(method === 'HEAD' ? null : '<xml>legacy</xml>', {
        headers: { 'Content-Type': 'application/xml', ETag: '"sitemap-version"' },
      });
      let calls = 0;
      const response = await fetchGeneratedSitemapAsset(request, {
        async fetch(actual) {
          calls++;
          assert.equal(actual, request, path);
          assert.equal(actual.url, origin + path + '?source=one&token=a%2Fb', path);
          assert.equal(actual.method, method, path);
          assert.equal(actual.headers.get('If-None-Match'), '"sitemap-version"', path);
          assert.equal(actual.headers.get('Accept'), 'application/xml', path);
          return asset;
        },
      });
      assert.equal(calls, 1, path);
      assert.equal(response, asset, path);
      assert.equal(response.headers.get('ETag'), '"sitemap-version"', path);
      assert.equal(await response.text(), method === 'HEAD' ? '' : '<xml>legacy</xml>', path);
    }
  }
});

test('conditional and missing generated sitemap assets never fall through to the EmDash collection route', async () => {
  for (const status of [304, 404]) {
    const request = new Request(origin + '/sitemap-0.xml?revision=one', {
      headers: { 'If-None-Match': '"sitemap-version"' },
    });
    const asset = new Response(status === 304 ? null : 'Not found', { status });
    const response = await fetchGeneratedSitemapAsset(request, {
      async fetch(actual) {
        assert.equal(actual, request);
        return asset;
      },
    });
    assert.equal(response, asset);
    assert.equal(response.status, status);
  }
});

test('governed and native feeds, aliases, slashed paths, and unsafe methods bypass the static sitemap probe', async () => {
  let calls = 0;
  const assets = {
    async fetch() {
      calls++;
      return new Response('unexpected');
    },
  };
  for (const path of [
    '/sitemap.xml',
    '/sitemap-emdash.xml',
    '/sitemap-posts.xml',
    '/sitemap-00.xml',
    '/sitemap-0.xml/',
    '/SITEMAP-0.XML',
    '/%73itemap-0.xml',
    '/sitemap-0.xml/other',
    '/cms-preview/?_preview=signed',
    '/_emdash/api/media/file/photo.png',
  ]) {
    assert.equal(await fetchGeneratedSitemapAsset(new Request(origin + path), assets), undefined, path);
  }
  const post = new Request(origin + '/sitemap-0.xml?keep=one', {
    method: 'POST',
    headers: { Authorization: 'Bearer example' },
    body: 'unchanged body',
  });
  assert.equal(await fetchGeneratedSitemapAsset(post, assets), undefined);
  assert.equal(post.url, origin + '/sitemap-0.xml?keep=one');
  assert.equal(post.headers.get('Authorization'), 'Bearer example');
  assert.equal(await post.text(), 'unchanged body');
  assert.equal(calls, 0);
});
