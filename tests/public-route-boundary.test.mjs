import assert from 'node:assert/strict';
import test from 'node:test';

import {
  previewPublicProbeScope,
  projectPublicRouteResponse,
  projectPublicRouteThrow,
} from '../src/emdash/public-route-boundary.mjs';

const ORIGIN = 'https://cinagroup-emdash-preview.cinagroup.workers.dev';
const SECRET = 'NEVER-PRINT-TOKEN';

test('only exact anonymous preview probe URLs are eligible', () => {
  assert.deepEqual(previewPublicProbeScope(new Request(`${ORIGIN}/ko/blog/`, { method: 'HEAD' }), '/ko/blog'), {
    method: 'HEAD',
    path: '/ko/blog/',
    routeKind: 'native_cms_index',
  });
  assert.equal(previewPublicProbeScope(new Request(`${ORIGIN}/ko/blog/`), '/500'), null);
  for (const url of [
    `${ORIGIN}/ko/blog/?token=${SECRET}`,
    `${ORIGIN}/ko/blog/extra`,
    'https://other.example.test/ko/blog/',
  ]) {
    assert.equal(previewPublicProbeScope(new Request(url)), null);
  }
  assert.equal(previewPublicProbeScope(new Request(`${ORIGIN}/ko/blog/`, { method: 'POST' })), null);
});

test('a bodyless 500 exposes only fixed route-boundary flags', () => {
  const scope = { method: 'GET', path: '/ko/blog/', routeKind: 'native_cms_index' };
  const response = new Response(null, {
    status: 500,
    headers: { 'X-Astro-Route-Type': 'fallback', 'X-Astro-Error': SECRET, 'X-Unrelated-Secret': SECRET },
  });
  assert.deepEqual(projectPublicRouteResponse(scope, response), {
    kind: 'response_500',
    method: 'GET',
    path: '/ko/blog/',
    routeKind: 'native_cms_index',
    bodyPresent: false,
    routeType: 'fallback',
    rerouteDisabled: false,
    astroErrorFlag: true,
  });
  assert.ok(!JSON.stringify(projectPublicRouteResponse(scope, response)).includes(SECRET));
  assert.equal(projectPublicRouteResponse(scope, new Response('ok', { status: 200 })), null);
});

test('a caught exception is projected without its message and remains available to rethrow', () => {
  const error = new TypeError(`Cannot perform I/O on behalf of a different request ${SECRET}`);
  const projected = projectPublicRouteThrow(
    { method: 'HEAD', path: '/fr/blog/', routeKind: 'native_cms_index' },
    error
  );
  assert.equal(projected.kind, 'throw');
  assert.equal(projected.category, 'cross_request_io');
  assert.equal(projected.errorName, 'TypeError');
  assert.ok(!JSON.stringify(projected).includes(SECRET));
});
