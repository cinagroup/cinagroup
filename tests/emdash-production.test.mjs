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

test('pushes and pull requests cannot mutate production, including content initialization', async () => {
  const { load } = await import('js-yaml');
  const workflow = load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const steps = workflow.jobs.production.steps;
  const deployOperations = ['deploy', 'deploy-and-initialize', 'deploy-and-resume-initialization'];
  const expected = new Map([
    ['Apply tracked contact migrations with exact production target', deployOperations],
    ['Initialize missing public site content and menus', deployOperations.slice(1)],
    ['Deploy validated production Worker', deployOperations],
    ['Attach production routes and verify live domains', ['cutover']],
    ['Restore retained Pages routing', ['rollback']],
  ]);
  for (const [name, operations] of expected) {
    const step = steps.find((item) => item.name === name);
    assert.ok(step, name);
    const prefix = "github.event_name == 'workflow_dispatch' && ";
    assert.ok(step.if.startsWith(prefix), name + ': only an explicit manual event');
    const condition = step.if.slice(prefix.length).replace(/^\((.*)\)$/, '$1');
    const clauses = condition.split(' || ');
    const actual = clauses.map((clause) => {
      const match = /^inputs.operation == '([a-z-]+)'$/.exec(clause);
      assert.ok(match, name + ': no broader or implicit operation');
      return match[1];
    });
    assert.deepEqual(actual, operations, name);
    for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
      for (const operation of ['validate', ...deployOperations, 'cutover', 'rollback', 'unknown']) {
        const enabled = event === 'workflow_dispatch' && actual.includes(operation);
        assert.equal(enabled, event === 'workflow_dispatch' && operations.includes(operation), name);
      }
    }
  }
  const mutationCommands =
    /d1 migrations apply|wrangler deploy --name|scripts\/emdash-production\.mjs (?:cutover|rollback)|scripts\/initialize-site-content\.mjs (?:apply|resume)/;
  for (const step of steps) {
    if (mutationCommands.test(step.run ?? '')) assert.ok(expected.has(step.name), 'Unaccounted mutation step');
  }
  assert.ok(workflow.on.push);
  assert.ok(workflow.on.pull_request);
});
