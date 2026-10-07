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
  // The single, pinned exception to "no push mutates production": an automated
  // briefing publish. It is confined to the briefing collection plus its derived
  // archive manifest, it must be gated on the computed `briefing.auto` output,
  // and it reuses exactly the manual `deploy` operation's steps. Any broader
  // push-triggered mutation is still rejected below.
  const AUTO_PUBLISH_GATE = "steps.briefing.outputs.auto == 'true'";
  const autoPublishSteps = new Set([
    'Verify live production resources',
    'Apply tracked contact migrations with exact production target',
    'Deploy validated production Worker',
  ]);
  const manualPrefix = "github.event_name == 'workflow_dispatch' && ";
  for (const [name, operations] of expected) {
    const step = steps.find((item) => item.name === name);
    assert.ok(step, name);
    // Strip only the recognised auto-publish gate; nothing else may follow.
    const gateSuffix = ` || ${AUTO_PUBLISH_GATE}`;
    const allowsAutoByPush = autoPublishSteps.has(name);
    assert.equal(
      step.if.endsWith(gateSuffix),
      allowsAutoByPush,
      name + ': auto-publish gate must match the pinned step set'
    );
    let manual = allowsAutoByPush ? step.if.slice(0, -gateSuffix.length) : step.if;
    // Unwrap one optional layer of grouping parens around the manual condition.
    if (manual.startsWith('(') && manual.endsWith(')')) manual = manual.slice(1, -1);
    assert.ok(manual.startsWith(manualPrefix), name + ': mutating step must be gated on an explicit manual event');
    const condition = manual.slice(manualPrefix.length);
    const inner = condition.replace(/^\((.*)\)$/, '$1');
    const clauses = inner.split(' || ');
    const actual = clauses.map((clause) => {
      const match = /^inputs\.operation == '([a-z-]+)'$/.exec(clause);
      assert.ok(match, name + ': no broader or implicit operation');
      return match[1];
    });
    assert.deepEqual(actual, operations, name);
    for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
      for (const operation of ['validate', ...deployOperations, 'cutover', 'rollback', 'unknown']) {
        const manualEnabled = event === 'workflow_dispatch' && actual.includes(operation);
        assert.equal(manualEnabled, event === 'workflow_dispatch' && operations.includes(operation), name);
      }
    }
  }
  // A whitelisted push may only enable the pinned auto-publish steps; every
  // other mutating step stays manual-only.
  for (const step of steps) {
    if (!step.if) continue;
    const hasAutoGate = step.if.includes(AUTO_PUBLISH_GATE);
    if (hasAutoGate) assert.ok(autoPublishSteps.has(step.name), 'Unpinned auto-publish step: ' + step.name);
  }
  // The auto-publish decision must be a real whitelist over briefing files only.
  const detector = steps.find((item) => item.id === 'briefing');
  assert.ok(detector, 'briefing detection step');
  const detectorIf = detector.if ?? '';
  assert.ok(
    detectorIf.includes("github.event_name == 'push'") && detectorIf.includes('refs/heads/main'),
    'briefing detection must be a main-branch push only'
  );
  assert.match(
    detector.run,
    /src\/data\/post\/ai-news-briefing-\*\.md/,
    'auto-publish whitelist must pin the briefing collection'
  );
  assert.match(
    detector.run,
    /docs\/briefing-archive-manifest\.json/,
    'auto-publish whitelist must pin the derived archive manifest'
  );
  assert.match(detector.run, /\*\)\s*auto=false/, 'any non-whitelisted path must disable auto-publish');
  const mutationCommands =
    /d1 migrations apply|wrangler deploy --name|scripts\/emdash-production\.mjs (?:cutover|rollback)|scripts\/initialize-site-content\.mjs (?:apply|resume)/;
  for (const step of steps) {
    if (mutationCommands.test(step.run ?? '')) assert.ok(expected.has(step.name), 'Unaccounted mutation step');
  }
  assert.ok(workflow.on.push);
  assert.ok(workflow.on.pull_request);
});
