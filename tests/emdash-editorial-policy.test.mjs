import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { definePlugin, HookPipeline } from 'emdash';

import { createPlugin, editorialPolicyPlugin, validatePostPublication } from '../src/emdash/editorial-policy.ts';

const approvedPost = () => ({
  id: 'post-1',
  data: {
    editorial_status: 'approved',
    origin: 'editorial',
    review_status: 'approved',
    reviewed_by: 'Editor',
    reviewed_at: '2026-09-28T10:00:00.000Z',
    verification_status: 'source_reviewed',
    verified_by: 'Researcher',
    verified_at: '2026-09-28T09:00:00.000Z',
    sources: [{ title: 'Official announcement', url: 'https://www.cloudflare.com/news/' }],
  },
});

const policyHooks = createPlugin().hooks;
const publish = (entry, collection = 'posts') =>
  policyHooks['content:beforePublish'].handler({
    collection,
    content: entry,
    origin: { source: 'api' },
  });
const schedule = (entry, collection = 'posts') =>
  policyHooks['content:beforeSchedule'].handler({
    collection,
    content: entry,
    origin: { source: 'api' },
    scheduledAt: '2026-10-01T10:00:00.000Z',
  });

test('registers a native policy with normalized aborting publish and schedule hooks', () => {
  const descriptor = editorialPolicyPlugin();
  const plugin = createPlugin();
  assert.equal(descriptor.id, plugin.id);
  assert.equal(descriptor.version, plugin.version);
  assert.equal(descriptor.format, 'native');
  assert.equal(descriptor.entrypoint, '/src/emdash/editorial-policy.ts');
  assert.ok(plugin.capabilities.includes('hooks.content-policy:register'));
  assert.equal(policyHooks['content:beforePublish'].errorPolicy, 'abort');
  assert.equal(policyHooks['content:beforeSchedule'].errorPolicy, 'abort');
  for (const hook of Object.values(policyHooks)) {
    assert.equal(hook.pluginId, descriptor.id);
    assert.equal(hook.priority, 100);
    assert.equal(hook.timeout, 5000);
    assert.deepEqual(hook.dependencies, []);
    assert.equal(hook.exclusive, false);
  }
  assert.deepEqual(plugin.routes, {});
  assert.deepEqual(plugin.allowedHosts, []);
});

test('fixed native metadata and hooks match EmDash native normalization', () => {
  const plugin = createPlugin();
  const expected = definePlugin({
    id: 'cinagroup-editorial-policy',
    version: '1.0.0',
    capabilities: ['hooks.content-policy:register'],
    hooks: {
      'content:beforePublish': {
        errorPolicy: 'abort',
        handler: plugin.hooks['content:beforePublish'].handler,
      },
      'content:beforeSchedule': {
        errorPolicy: 'abort',
        handler: plugin.hooks['content:beforeSchedule'].handler,
      },
    },
  });

  assert.deepEqual(plugin, expected);
});

test('EmDash dispatch preserves publication cancellation and aborts hook failures', async () => {
  for (const name of ['content:beforePublish', 'content:beforeSchedule']) {
    const plugin = createPlugin();
    const event = {
      collection: 'posts',
      content: approvedPost(),
      origin: { source: 'api' },
      scheduledAt: '2026-10-01T10:00:00.000Z',
    };
    const pipeline = new HookPipeline([plugin], { db: {} });
    assert.equal((await pipeline.runContentPolicy(name, event)).cancellation, undefined);

    event.content.data.editorial_status = 'withdrawn';
    const rejected = await pipeline.runContentPolicy(name, event);
    assert.equal(rejected.cancellation.pluginId, plugin.id);
    assert.match(rejected.cancellation.reason, /cannot be published or scheduled/);

    const failure = new Error('Editorial policy failure');
    plugin.hooks[name].handler = async () => {
      throw failure;
    };
    const failingPipeline = new HookPipeline([plugin], { db: {} });
    await assert.rejects(failingPipeline.runContentPolicy(name, event), (error) => error === failure);

    plugin.hooks[name].handler = async () => new Promise(() => {});
    plugin.hooks[name].timeout = 10;
    const timingOutPipeline = new HookPipeline([plugin], { db: {} });
    await assert.rejects(timingOutPipeline.runContentPolicy(name, event), /Hook timeout/);
  }
});

test('native factory can register before its module constants initialize', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'cinagroup-policy-init-'));

  try {
    const source = readFileSync(new URL('../src/emdash/editorial-policy.ts', import.meta.url), 'utf8');
    writeFileSync(join(fixture, 'policy.ts'), `import './factory-consumer.mjs';\n${source}`);
    writeFileSync(
      join(fixture, 'factory-consumer.mjs'),
      `import { createPlugin, editorialPolicyPlugin } from './policy.ts';
export const plugin = createPlugin();
export const descriptor = editorialPolicyPlugin();
`
    );

    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
await import('./policy.ts');
const { plugin, descriptor } = await import('./factory-consumer.mjs');
assert.equal(plugin.id, 'cinagroup-editorial-policy');
assert.equal(descriptor.id, plugin.id);
assert.equal(descriptor.version, plugin.version);
assert.equal(descriptor.format, 'native');
const approved = ${JSON.stringify(approvedPost())};
for (const name of ['content:beforePublish', 'content:beforeSchedule']) {
  const hook = plugin.hooks[name];
  assert.equal(hook.errorPolicy, 'abort');
  assert.equal(await hook.handler({ collection: 'posts', content: approved }), undefined);
  const rejected = await hook.handler({ collection: 'posts', content: { data: {} } });
  assert.equal(rejected.cancel, true);
}
`,
      ],
      { cwd: fixture, encoding: 'utf8', timeout: 10000 }
    );

    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('approved, sourced, reviewed posts may publish and schedule', async () => {
  const entry = approvedPost();
  assert.equal(validatePostPublication(entry), undefined);
  assert.equal(await publish(entry), undefined);
  assert.equal(await schedule(entry), undefined);
  assert.equal(await publish(entry, 'pages'), undefined);
});

test('missing metadata and historical or withdrawn states reject both actions', async () => {
  for (const status of [undefined, 'draft', 'in_review', 'published', 'archived_unverified', 'withdrawn']) {
    const entry = approvedPost();
    entry.data.editorial_status = status;
    const publication = await publish(entry);
    const scheduling = await schedule(entry);
    assert.equal(publication.cancel, true, String(status));
    assert.deepEqual(scheduling, publication);
  }

  assert.equal((await publish({ data: null })).cancel, true);
  assert.equal((await schedule(null)).cancel, true);
});

test('review and source verification require an explicit state, actor, and date', async () => {
  for (const field of [
    'review_status',
    'reviewed_by',
    'reviewed_at',
    'verification_status',
    'verified_by',
    'verified_at',
    'origin',
  ]) {
    const entry = approvedPost();
    delete entry.data[field];
    assert.equal((await publish(entry)).cancel, true, field);
    assert.equal((await schedule(entry)).cancel, true, field);
  }

  const invalidDate = approvedPost();
  invalidDate.data.reviewed_at = 'not-a-date';
  assert.equal((await publish(invalidDate)).cancel, true);
  invalidDate.data.reviewed_at = '2026-09-28T10:00:00.000Z';
  invalidDate.data.verified_at = 'not-a-date';
  assert.equal((await schedule(invalidDate)).cancel, true);
});

test('every citation requires a title and a public HTTP(S) URL', async () => {
  for (const source of [
    [],
    [{ title: 'Local', url: 'http://localhost:8787/article' }],
    [{ title: 'Placeholder', url: 'https://example.com/article' }],
    [{ title: 'Script', url: 'javascript:alert(1)' }],
    [{ title: 'Private address', url: 'http://192.168.1.10/article' }],
    [{ title: '', url: 'https://www.cloudflare.com/news/' }],
    [{ title: 'Signed-in', url: 'https://user:password@www.cloudflare.com/news/' }],
    [
      { title: 'Valid', url: 'https://www.cloudflare.com/news/' },
      { title: 'Broken', url: 'not-a-url' },
    ],
  ]) {
    const entry = approvedPost();
    entry.data.sources = source;
    assert.equal((await publish(entry)).cancel, true, JSON.stringify(source));
  }
});

test('a post withdrawn after scheduling is rejected again at publication time', async () => {
  const entry = approvedPost();
  assert.equal(await schedule(entry), undefined);
  entry.data.editorial_status = 'withdrawn';
  assert.equal((await publish(entry)).cancel, true);
});
