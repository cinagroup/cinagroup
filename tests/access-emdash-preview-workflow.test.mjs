import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const workflowPath = fileURLToPath(new URL('../.github/workflows/emdash-preview.yml', import.meta.url));
const workflow = yaml.load(readFileSync(workflowPath, 'utf8'));
const steps = workflow.jobs.preview.steps;
const step = (name) => steps.find((item) => item.name === name);

test('audit-access dispatch validates the operation and runs the isolated read-only audit after CI', () => {
  const operations = workflow.on.workflow_dispatch.inputs.operation.options;
  assert.equal(operations.filter((operation) => operation === 'audit-access').length, 1);
  assert.match(step('Validate manual preview operation').run, /audit-access/);

  const tests = step('Test read-only Access preview audit');
  const audit = step('Audit isolated preview Access configuration (read-only)');
  assert.ok(tests.run.includes('tests/access-emdash-preview.test.mjs'));
  assert.ok(tests.run.includes('tests/access-emdash-preview-workflow.test.mjs'));
  assert.ok(steps.indexOf(tests) < steps.indexOf(audit));
  assert.equal(audit.if, "github.event_name == 'workflow_dispatch' && inputs.operation == 'audit-access'");
  assert.equal(audit.run, 'node scripts/access-emdash-preview.mjs audit');
  assert.deepEqual(Object.keys(audit.env).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']);
  assert.equal(audit.env.CLOUDFLARE_ACCOUNT_ID, '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
  assert.equal(audit.env.CLOUDFLARE_API_TOKEN, '${{ secrets.CLOUDFLARE_API_TOKEN }}');
});

test('audit-access bypasses legacy resource audit and all credentialed write operations', () => {
  const legacy = step('Audit Cloudflare preview resources and existing Worker');
  assert.ok(legacy.if.includes("inputs.operation != 'audit-access'"));

  for (const item of steps) {
    if (item === legacy || item.name === 'Audit isolated preview Access configuration (read-only)') continue;
    if (!item.env?.CLOUDFLARE_API_TOKEN && !item.with?.apiToken) continue;
    const enabledOperations = [...item.if.matchAll(/inputs\.operation == '([^']+)'/g)].map((match) => match[1]);
    assert.ok(enabledOperations.length > 0, `${item.name} lacks an explicit operation gate`);
    assert.ok(!enabledOperations.includes('audit-access'), `${item.name} could run during audit-access`);
  }
});
