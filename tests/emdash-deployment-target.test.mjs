import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyDeploymentHeaders,
  isDeploymentHostname,
  productionAliasRedirect,
  resolveDeploymentTarget,
  PREVIEW_HOST,
  PRODUCTION_HOST,
  PRODUCTION_STAGING_HOST,
  PRODUCTION_ALIAS,
} from '../src/emdash/deployment-target.ts';

test('an explicit runtime target is required', () => {
  for (const bindings of [undefined, {}, { EMDASH_DEPLOYMENT_TARGET: 'prod' }, { EMDASH_DEPLOYMENT_TARGET: true }])
    assert.equal(resolveDeploymentTarget(bindings), null);
  for (const target of ['preview', 'production'])
    assert.equal(resolveDeploymentTarget({ EMDASH_DEPLOYMENT_TARGET: target }), target);
});
test('preview and production hosts stay isolated', () => {
  assert.equal(isDeploymentHostname('https://' + PREVIEW_HOST + '/', 'preview'), true);
  for (const host of [PRODUCTION_HOST, PRODUCTION_STAGING_HOST, PRODUCTION_ALIAS]) {
    assert.equal(isDeploymentHostname('https://' + host + '/', 'production'), true);
    assert.equal(isDeploymentHostname('https://' + host + '/', 'preview'), false);
  }
  for (const host of [PREVIEW_HOST, 'www.cinagroup.com', 'evilcinagroup.com', 'cinagroup.com.example.com'])
    assert.equal(isDeploymentHostname('https://' + host + '/', 'production'), false);
  assert.equal(isDeploymentHostname('https://cinagroup.com/', null), false);
});
test('only canonical production HTML is indexable; archive restrictions are retained', () => {
  for (const [target, host, blocked] of [
    ['production', PRODUCTION_HOST, false],
    ['production', PRODUCTION_STAGING_HOST, true],
    ['preview', PREVIEW_HOST, true],
  ]) {
    const result = applyDeploymentHeaders(new Request('https://' + host + '/'), new Response('html'), target);
    assert.equal(result.headers.get('X-Robots-Tag')?.includes('noindex') ?? false, blocked);
    assert.equal(result.headers.get('X-CinaGroup-Deployment'), 'emdash-' + target);
  }
  const archive = applyDeploymentHeaders(
    new Request('https://cinagroup.com/blog/archive/'),
    new Response('archive', { headers: { 'X-Robots-Tag': 'noindex,follow' } }),
    'production'
  );
  assert.equal(archive.headers.get('X-Robots-Tag'), 'noindex,follow');
  for (const path of ['/_emdash/admin/', '/cms-preview/token'])
    assert.match(
      applyDeploymentHeaders(
        new Request('https://cinagroup.com' + path),
        new Response('private'),
        'production'
      ).headers.get('X-Robots-Tag'),
      /noindex/
    );
});
test('the audited alias redirects to the fixed canonical origin with path and query intact', () => {
  const request = new Request('https://' + PRODUCTION_ALIAS + '/zh/contact/?next=https://evil.test', {
    method: 'POST',
    body: 'test',
  });
  const result = productionAliasRedirect(request, 'production');
  assert.equal(result.status, 308);
  assert.equal(result.headers.get('Location'), 'https://cinagroup.com/zh/contact/?next=https://evil.test');
  assert.equal(productionAliasRedirect(request, 'preview'), null);
  assert.equal(productionAliasRedirect(new Request('https://cinagroup.com/'), 'production'), null);
});
