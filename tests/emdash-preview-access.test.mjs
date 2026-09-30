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
  for (const method of ['GET', 'HEAD']) {
    for (const configured of [undefined, secret]) {
      for (const key of ['01K7P4J26T0WYS88MQ72GHAFBJ.png', 'images/pilot-image_1~small.webp']) {
        const response = await fetchWithPreviewAdminAccess(
          new Request(`${host}/_emdash/api/media/file/${key}`, { method }),
          configured,
          next,
          now
        );
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'image/png');
        assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
        assert.equal(response.headers.get('Set-Cookie'), null);
      }
    }
  }
  assert.equal(calls, 8);
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
