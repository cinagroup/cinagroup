import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyPrivatePreviewResponse } from '../scripts/verify-emdash-preview-access-challenge.mjs';

const origin = 'https://cinagroup-emdash-preview.cinagroup.workers.dev';
const path = '/_emdash/api/setup/status';
const loginPath = `/cdn-cgi/access/login/${new URL(origin).hostname}`;
const login = (returnTo = path) =>
  `https://cinagroup.cloudflareaccess.com${loginPath}?kid=public-aud&meta=sensitive-meta&redirect_url=${encodeURIComponent(returnTo)}`;
const redirect = (location) => new Response(null, { status: 302, headers: { Location: location } });

test('fixed Cloudflare Access login challenge is accepted without Worker headers or redirect query logging', () => {
  const result = classifyPrivatePreviewResponse(redirect(login()), path, origin);
  assert.deepEqual(result, { status: 302, mode: 'cloudflare-access' });
  assert.deepEqual(classifyPrivatePreviewResponse(redirect(login(`${origin}${path}`)), path, origin), result);
});

test('external, spoofed, insecure, credentialed, or wrong-app login destinations are rejected', () => {
  for (const location of [
    `https://evil.example${loginPath}?redirect_url=${encodeURIComponent(path)}`,
    `https://cinagroup.cloudflareaccess.com.evil.example${loginPath}?redirect_url=${encodeURIComponent(path)}`,
    `http://cinagroup.cloudflareaccess.com${loginPath}?redirect_url=${encodeURIComponent(path)}`,
    `https://user@cinagroup.cloudflareaccess.com${loginPath}?redirect_url=${encodeURIComponent(path)}`,
    `https://cinagroup.cloudflareaccess.com/cdn-cgi/access/login/other.example?redirect_url=${encodeURIComponent(path)}`,
  ]) {
    assert.throws(() => classifyPrivatePreviewResponse(redirect(location), path, origin), /Access login redirect/);
  }
});

test('missing, duplicate, external, or wrong return paths are rejected without echoing secret query values', () => {
  for (const location of [
    `https://cinagroup.cloudflareaccess.com${loginPath}?meta=sensitive-meta`,
    `${login()}&redirect_url=${encodeURIComponent(path)}`,
    login('https://evil.example/'),
    login('/_emdash/admin/setup'),
    login(`${path}?token=sensitive-meta`),
  ]) {
    assert.throws(
      () => classifyPrivatePreviewResponse(redirect(location), path, origin),
      (error) => !error.message.includes('sensitive-meta') && /Access return path/.test(error.message)
    );
  }
});

test('Worker denials are classified but cannot be mistaken for an Access challenge', () => {
  const headers = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store, max-age=0' };
  assert.deepEqual(classifyPrivatePreviewResponse(new Response(null, { status: 401, headers }), path, origin), {
    status: 401,
    mode: 'worker-denied',
  });
  assert.deepEqual(
    classifyPrivatePreviewResponse(
      new Response(null, { status: 401, headers: { ...headers, 'WWW-Authenticate': 'Basic realm="preview"' } }),
      path,
      origin
    ),
    { status: 401, mode: 'legacy-basic' }
  );
  assert.deepEqual(classifyPrivatePreviewResponse(new Response(null, { status: 503, headers }), path, origin), {
    status: 503,
    mode: 'worker-unavailable',
  });
  assert.throws(() => classifyPrivatePreviewResponse(new Response(null, { status: 401 }), path, origin), /noindex/);
  assert.throws(() => classifyPrivatePreviewResponse(new Response(null, { status: 403 }), path, origin), /not closed/);
  assert.throws(
    () => classifyPrivatePreviewResponse(new Response('native', { status: 200 }), path, origin),
    /not closed/
  );
});
