import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { fetchWithPreviewAdminAccess } from '../src/emdash-preview-access.ts';

const host = 'https://cinagroup-emdash-preview.example.workers.dev';
const secret = 'preview-secret-with-at-least-32-characters';
const now = 1_800_000_000;

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

test('public preview and production-domain requests bypass the admin gate', async () => {
  const next = async () => new Response('site');
  for (const url of [`${host}/`, `${host}/cms-preview/`, 'https://cinagroup.com/_emdash/admin/']) {
    const response = await fetchWithPreviewAdminAccess(new Request(url), undefined, next, now);
    assert.equal(response.status, 200);
  }
});
