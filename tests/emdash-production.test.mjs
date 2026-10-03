import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  verifyProductionConfig,
  verifyRouteOwnership,
  verifyAdminPolicy,
  WORKER,
  ROUTES,
  IDP,
} from '../scripts/emdash-production.mjs';

test('production resource configuration cannot reuse preview resources or attach a route during upload', () => {
  const config = JSON.parse(readFileSync('wrangler.production.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'));
  verifyProductionConfig(config);
  for (const field of ['name', 'workers_dev', 'preview_urls'])
    assert.throws(() => verifyProductionConfig({ ...config, [field]: null }));
  assert.throws(() => verifyProductionConfig({ ...config, routes: [{ pattern: 'cinagroup.com/*' }] }));
  const altered = structuredClone(config);
  altered.d1_databases[0].database_id = '050ec919-1b18-4de8-86a8-62c16c28e59c';
  assert.throws(() => verifyProductionConfig(altered));
});
test('cutover and rollback refuse any conflicting or broader route and accept only owned exact routes', () => {
  const spec = ROUTES[0];
  assert.equal(verifyRouteOwnership([], spec), null);
  const own = { id: 'owned', pattern: spec.host + '/*', script: WORKER, request_limit_fail_open: false };
  assert.equal(verifyRouteOwnership([own], spec), own);
  for (const route of [
    { ...own, script: 'other' },
    { ...own, pattern: '*.com/*' },
    { ...own, pattern: 'cinagroup.com/private/*' },
    { ...own, request_limit_fail_open: true },
  ])
    assert.throws(() => verifyRouteOwnership([route], spec));
  assert.equal(verifyRouteOwnership([{ pattern: 'admin.cinagroup.com/*', script: 'cinaadmin' }], spec), null);
});
test('production admin policy requires the selected email and dedicated CinaAuth method', () => {
  const policy = {
    decision: 'allow',
    include: [{ email: { email: 'admin@example.test' } }],
    require: [{ login_method: { id: IDP } }],
  };
  verifyAdminPolicy([policy], 'admin@example.test');
  assert.throws(() => verifyAdminPolicy([policy], 'other@example.test'));
  assert.throws(() => verifyAdminPolicy([{ ...policy, include: [{ everyone: {} }] }], 'admin@example.test'));
  assert.throws(() => verifyAdminPolicy([{ ...policy, require: [] }], 'admin@example.test'));
  assert.throws(() => verifyAdminPolicy([policy, policy], 'admin@example.test'));
});

test('pushes and pull requests cannot deploy or change production routes', async () => {
  const { load } = await import('js-yaml');
  const workflow = load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const steps = workflow.jobs.production.steps;
  for (const name of [
    'Apply tracked contact migrations with exact production target',
    'Deploy validated production Worker',
    'Attach production routes and verify live domains',
    'Restore retained Pages routing',
  ]) {
    const step = steps.find((s) => s.name === name);
    assert.ok(step);
    assert.match(
      step.if,
      /^github.event_name == 'workflow_dispatch' && inputs.operation == '(deploy|cutover|rollback)'$/
    );
  }
  assert.ok(workflow.on.push);
  assert.ok(workflow.on.pull_request);
});
