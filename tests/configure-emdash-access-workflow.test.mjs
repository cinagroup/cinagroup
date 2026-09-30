import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const workflow = yaml.load(
  readFileSync(fileURLToPath(new URL('../.github/workflows/emdash-preview.yml', import.meta.url)), 'utf8')
);
const steps = workflow.jobs.preview.steps;
const step = (name) => steps.find((entry) => entry.name === name);
const app = step('Configure or verify dedicated preview Access applications');
const runtime = step('Configure absent preview Access runtime bindings');
const authTests = step('Test Access authentication and public media boundaries');
const configTests = step('Test isolated Access application and runtime configuration');
const migration = step('Migrate the exact legacy preview admin Access policy');

test('two manual operations are whitelisted and excluded from the general resource audit', () => {
  const options = workflow.on.workflow_dispatch.inputs.operation.options;
  for (const operation of ['configure-access', 'configure-access-runtime']) {
    assert.equal(options.filter((value) => value === operation).length, 1);
    assert.ok(step('Validate manual preview operation').run.includes(operation));
    assert.ok(
      step('Audit Cloudflare preview resources and existing Worker').if.includes(`inputs.operation != '${operation}'`)
    );
  }
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(
    workflow.concurrency.group,
    "${{ github.event_name == 'pull_request' && format('emdash-preview-pr-{0}', github.event.pull_request.number) || 'emdash-preview' }}"
  );
});

test('runtime follows real Access app verification and receives its AUD through a step output', () => {
  const gate =
    "github.event_name == 'workflow_dispatch' && (inputs.operation == 'configure-access' || inputs.operation == 'configure-access-runtime')";
  assert.equal(app.if, gate);
  assert.equal(runtime.if, gate);
  assert.equal(app.id, 'preview-access-apps');
  assert.equal(app.env.ACCESS_OPERATION, "${{ inputs.operation == 'configure-access' && 'configure' || 'plan' }}");
  assert.ok(steps.indexOf(app) < steps.indexOf(runtime));
  assert.match(app.run, /node scripts\/configure-emdash-access-preview\.mjs "\$ACCESS_OPERATION"/);
  assert.match(app.run, /appendFileSync\(process\.env\.GITHUB_OUTPUT, `aud=\$\{admin\[0\]\.aud\}\\n`\)/);
  assert.equal(runtime.run, 'node scripts/configure-emdash-access-runtime.mjs configure');
  assert.equal(runtime.env.CF_ACCESS_AUDIENCE, '${{ steps.preview-access-apps.outputs.aud }}');
  assert.equal(runtime.env.EMDASH_AUTH_MODE, 'cinaauth-access');
  assert.equal(runtime.env.CF_ACCESS_TEAM_DOMAIN, 'cinagroup.cloudflareaccess.com');
  assert.equal(runtime.env.CF_ACCESS_CINA_AUTH_IDP_TYPE, 'oidc');
  for (const item of [app, runtime]) {
    assert.equal(item.env.CLOUDFLARE_API_TOKEN, '${{ secrets.CLOUDFLARE_API_TOKEN }}');
    assert.equal(item.env.CLOUDFLARE_ACCOUNT_ID, '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    assert.equal(item.env.CF_ACCESS_CINA_AUTH_IDP_ID, '${{ secrets.CF_ACCESS_CINA_AUTH_IDP_ID }}');
    assert.equal(item.env.EMDASH_ACCESS_ADMIN_EMAIL, '${{ secrets.EMDASH_ACCESS_ADMIN_EMAIL }}');
    assert.ok(!Object.keys(item.env).includes('EMDASH_PREVIEW_ADMIN_PASSWORD'));
    assert.ok(!Object.keys(item.env).includes('EMDASH_ENCRYPTION_KEY'));
  }
  assert.ok(!/secret bulk|wrangler deploy/.test(runtime.run));
});

test('policy migration is a separate pinned one-policy action with no runtime, deploy, or other write step', () => {
  const operation = 'migrate-access-policy';
  const gate = "github.event_name == 'workflow_dispatch' && inputs.operation == 'migrate-access-policy'";
  assert.equal(workflow.on.workflow_dispatch.inputs.operation.options.filter((value) => value === operation).length, 1);
  assert.ok(step('Validate manual preview operation').run.includes(operation));
  assert.ok(
    step('Audit Cloudflare preview resources and existing Worker').if.includes(`inputs.operation != '${operation}'`)
  );
  assert.equal(migration.if, gate);
  assert.equal(migration.run, 'node scripts/configure-emdash-access-preview.mjs migrate-policy');
  assert.deepEqual(Object.keys(migration.env).sort(), [
    'CF_ACCESS_CINA_AUTH_IDP_ID',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
    'EMDASH_ACCESS_ADMIN_EMAIL',
  ]);
  for (const [key, secret] of Object.entries({
    CLOUDFLARE_API_TOKEN: 'CLOUDFLARE_API_TOKEN',
    CLOUDFLARE_ACCOUNT_ID: 'CLOUDFLARE_ACCOUNT_ID',
    CF_ACCESS_CINA_AUTH_IDP_ID: 'CF_ACCESS_CINA_AUTH_IDP_ID',
    EMDASH_ACCESS_ADMIN_EMAIL: 'EMDASH_ACCESS_ADMIN_EMAIL',
  }))
    assert.equal(migration.env[key], '${{ secrets.' + secret + ' }}');
  for (const other of [app, runtime, step('Deploy preview Worker')]) assert.ok(!other.if.includes(operation));
  for (const other of steps.filter((entry) => entry !== migration)) {
    if (!other.env?.CLOUDFLARE_API_TOKEN && !other.with?.apiToken) continue;
    assert.ok(!other.if.includes(`inputs.operation == '${operation}'`));
  }
  assert.ok(steps.indexOf(configTests) < steps.indexOf(migration));
  assert.ok(steps.indexOf(authTests) < steps.indexOf(migration));
});

test('authentication, challenge, app and runtime mock tests run before all new configuration actions', () => {
  for (const filename of [
    'tests/cinaauth-access.test.mjs',
    'tests/cinaauth-access-guard.test.mjs',
    'tests/verify-emdash-preview-access-challenge.test.mjs',
  ])
    assert.ok(authTests.run.includes(filename));
  for (const filename of [
    'tests/configure-emdash-access-preview.test.mjs',
    'tests/configure-emdash-access-runtime.test.mjs',
    'tests/configure-emdash-access-workflow.test.mjs',
  ])
    assert.ok(configTests.run.includes(filename));
  for (const check of [authTests, configTests, step('Check formatting'), step('Check ESLint')]) {
    assert.ok(steps.indexOf(check) < steps.indexOf(app));
    assert.ok(steps.indexOf(check) < steps.indexOf(runtime));
  }
});

test('audit-access remains read-only and cannot run either new credentialed action', () => {
  const audit = step('Audit isolated preview Access configuration (read-only)');
  assert.equal(audit.if, "github.event_name == 'workflow_dispatch' && inputs.operation == 'audit-access'");
  assert.equal(audit.run, 'node scripts/access-emdash-preview.mjs audit');
  assert.deepEqual(Object.keys(audit.env).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']);
  for (const item of [app, runtime]) assert.ok(!item.if.includes("inputs.operation == 'audit-access'"));
  for (const item of steps.filter((entry) => entry !== app && entry !== runtime)) {
    if (!item.env?.CLOUDFLARE_API_TOKEN && !item.with?.apiToken) continue;
    assert.ok(!item.if.includes("inputs.operation == 'configure-access'"));
    assert.ok(!item.if.includes("inputs.operation == 'configure-access-runtime'"));
  }
});

test('the output extractor accepts only a complete scoped report and exact canonical 64-hex AUD', () => {
  const match = app.run.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE\n?$/);
  assert.ok(match, 'Must be one inline Node extractor after the app helper');
  const source = match[1];
  const directory = mkdtempSync(join(tmpdir(), 'emdash-access-output-test-'));
  const reportPath = join(directory, 'emdash-access-applications.json');
  const outputPath = join(directory, 'output.txt');
  const good = {
    previewHostname: 'cinagroup-emdash-preview.cinagroup.workers.dev',
    applications: [
      { role: 'admin', state: 'existing', aud: 'a'.repeat(64) },
      { role: 'publicMedia', state: 'created' },
    ],
  };
  try {
    for (const change of [
      null,
      (r) => {
        r.applications[0].aud += '\n';
      },
      (r) => {
        r.applications[0].aud = 'private-invalid-aud';
      },
      (r) => {
        r.applications[0].aud = 'A'.repeat(64);
      },
      (r) => {
        r.applications[0].state = 'would_create';
      },
      (r) => {
        r.applications.pop();
      },
      (r) => {
        r.applications.push({ role: 'admin', state: 'existing', aud: 'b'.repeat(64) });
      },
      (r) => {
        r.previewHostname = 'cinagroup.com';
      },
    ]) {
      const report = structuredClone(good);
      change?.(report);
      writeFileSync(reportPath, JSON.stringify(report));
      if (existsSync(outputPath)) rmSync(outputPath);
      const child = spawnSync(process.execPath, ['--input-type=module'], {
        input: source,
        encoding: 'utf8',
        env: {
          ...process.env,
          RUNNER_TEMP: directory,
          GITHUB_OUTPUT: outputPath,
          EMDASH_ACCESS_ADMIN_EMAIL: 'DO-NOT-LOG-EMAIL',
          CLOUDFLARE_API_TOKEN: 'DO-NOT-LOG-TOKEN',
        },
      });
      assert.equal(child.status, change ? 1 : 0);
      for (const sensitive of ['private-invalid-aud', 'DO-NOT-LOG-EMAIL', 'DO-NOT-LOG-TOKEN'])
        assert.ok(!`${child.stdout}${child.stderr}`.includes(sensitive));
      if (change) assert.ok(!existsSync(outputPath));
      else assert.equal(readFileSync(outputPath, 'utf8'), `aud=${'a'.repeat(64)}\n`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
