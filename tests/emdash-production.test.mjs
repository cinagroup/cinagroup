import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  verifyProductionConfig,
  verifyRouteOwnership,
  verifyAdminPolicy,
  setProductionRoutes,
  WORKER,
  REDIRECT_WORKER,
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
test('protected redirect requires its exact route and rejects conflicting routes', () => {
  const spec = ROUTES[1];
  const redirect = {
    id: 'redirect',
    pattern: spec.host + '/*',
    script: REDIRECT_WORKER,
    request_limit_fail_open: false,
  };
  assert.equal(verifyRouteOwnership([redirect], spec), redirect);
  assert.throws(() => verifyRouteOwnership([], spec), /Required protected/);
  for (const route of [
    { ...redirect, script: WORKER },
    { ...redirect, pattern: '*.xn--fiqs8s/*' },
    { ...redirect, pattern: spec.host + '/private/*' },
    { ...redirect, request_limit_fail_open: true },
  ])
    assert.throws(() => verifyRouteOwnership([redirect, route], spec), /Conflicting/);
});
test('cutover and rollback never mutate the protected redirect route', async () => {
  for (const operation of ['cutover', 'rollback']) {
    const [primary, redirect] = ROUTES;
    const paths = Object.fromEntries(ROUTES.map((spec) => [spec.zone, '/zones/' + spec.zone + '/workers/routes']));
    const own = { id: 'primary', pattern: primary.host + '/*', script: WORKER, request_limit_fail_open: false };
    const protectedRoute = {
      id: 'redirect',
      pattern: redirect.host + '/*',
      script: REDIRECT_WORKER,
      request_limit_fail_open: false,
    };
    const calls = [];
    const api = async (path, method = 'GET', body) => {
      calls.push({ path, method, body });
      if (method !== 'GET') return { id: 'created' };
      if (path === paths[primary.zone]) return operation === 'rollback' ? [own] : [];
      if (path === paths[redirect.zone]) return [protectedRoute];
      throw new Error('Unexpected API path');
    };
    await setProductionRoutes(operation, { api, audit: async () => {} });
    const writes = calls.filter((call) => call.method !== 'GET');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].path, paths[primary.zone] + (operation === 'rollback' ? '/primary' : ''));
    assert.equal(writes[0].method, operation === 'rollback' ? 'DELETE' : 'POST');
  }
});
test('missing or changed protected redirect prevents primary route mutation', async () => {
  for (const operation of ['cutover', 'rollback']) {
    for (const disappearedDuringRecheck of [false, true]) {
      const [primary, redirect] = ROUTES;
      const own = { id: 'primary', pattern: primary.host + '/*', script: WORKER, request_limit_fail_open: false };
      const protectedRoute = {
        id: 'redirect',
        pattern: redirect.host + '/*',
        script: REDIRECT_WORKER,
        request_limit_fail_open: false,
      };
      let redirectReads = 0;
      const calls = [];
      const api = async (path, method = 'GET') => {
        calls.push({ path, method });
        if (path.includes(primary.zone)) return operation === 'rollback' ? [own] : [];
        if (path.includes(redirect.zone))
          return disappearedDuringRecheck && ++redirectReads === 1 ? [protectedRoute] : [];
        throw new Error('Unexpected API path');
      };
      await assert.rejects(setProductionRoutes(operation, { api, audit: async () => {} }), /Required protected/);
      assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
    }
  }
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
  const manualPrefix = "github.event_name == 'workflow_dispatch' && ";
  for (const [name, operations] of expected) {
    const step = steps.find((item) => item.name === name);
    assert.ok(step, name);
    assert.ok(step.if?.startsWith(manualPrefix), name + ': an explicit manual event is required');
    const condition = step.if.slice(manualPrefix.length);
    const inner = condition.replace(/^\((.*)\)$/, '$1');
    const actual = inner.split(' || ').map((clause) => {
      const match = /^inputs\.operation == '([a-z-]+)'$/.exec(clause);
      assert.ok(match, name + ': no broader or implicit operation');
      return match[1];
    });
    assert.deepEqual(actual, operations, name);
  }
  assert.equal(
    steps.find((item) => item.name === 'Verify live production resources')?.if,
    "github.event_name == 'workflow_dispatch' && inputs.operation != 'validate'"
  );
  assert.equal(
    steps.find((item) => item.id === 'briefing'),
    undefined,
    'briefing pushes have no deployment exception'
  );
  for (const name of [
    'Check types, lint and formatting',
    'Audit source content and build production',
    'Audit built public content and evidence',
  ]) {
    const step = steps.find((item) => item.name === name);
    assert.ok(step, name);
    assert.equal(step.if, undefined, name + ': validation runs on pushes');
  }
  const releaseGate = steps.find((item) => item.name === 'Require reviewed briefing content before production changes');
  assert.ok(releaseGate?.if?.startsWith(manualPrefix));
  for (const operation of [...deployOperations, 'cutover'])
    assert.ok(releaseGate.if.includes(`inputs.operation == '${operation}'`));
  assert.ok(!releaseGate.if.includes("inputs.operation == 'rollback'"));
  assert.match(releaseGate.run, /git diff .*5de80389a0dfaa0f04650635defa62c9bff48845.*verify-briefing-release\.mjs/);
  assert.ok(steps.indexOf(releaseGate) < steps.findIndex((item) => item.name === 'Verify live production resources'));
  assert.equal(steps.find((item) => item.name === 'Checkout repository')?.with?.['fetch-depth'], 0);
  const onlineDeploy = steps.find((item) => item.name === 'Verify uploaded production Worker through workers.dev');
  assert.equal(onlineDeploy?.if, "steps.deploy.outcome == 'success'");
  assert.equal(onlineDeploy?.run, 'node scripts/verify-emdash-production.mjs --staging');
  const parity = steps.find((item) => item.name === 'Verify current migration parity before route cutover');
  assert.equal(parity?.if, "github.event_name == 'workflow_dispatch' && inputs.operation == 'cutover'");
  assert.equal(parity?.run, 'node scripts/verify-emdash-production.mjs --staging --migration-parity');
  const mutationCommands =
    /d1 migrations apply|wrangler deploy --name|scripts\/emdash-production\.mjs (?:cutover|rollback)|scripts\/initialize-site-content\.mjs (?:apply|resume)/;
  for (const step of steps) {
    if (mutationCommands.test(step.run ?? '')) assert.ok(expected.has(step.name), 'Unaccounted mutation step');
  }
  assert.ok(workflow.on.push);
  assert.ok(workflow.on.pull_request);
});
