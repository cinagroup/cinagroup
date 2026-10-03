import assert from 'node:assert/strict';
import { test } from 'node:test';

import { preparePilot } from '../scripts/prepare-emdash-pilot.mjs';
import {
  auditPreviewWorker,
  applyPilot,
  assertPreviewOrigin,
  createPreviewClient,
  openPreviewGate,
  preflightPilot,
  runPilotImport,
  validateDraftSeed,
  verifyLiveDrafts,
} from '../scripts/import-emdash-pilot.mjs';

const { seed } = preparePilot();
const entries = validateDraftSeed(seed);
const source = entries[1];
const translation = entries[2];
const fields = seed.collections[0].fields.map(({ slug, type }) => ({ slug, type }));

function remote(entry, id, translationGroup = id) {
  return {
    id,
    slug: entry.slug,
    locale: entry.locale,
    status: 'draft',
    publishedAt: null,
    data: { ...entry.data },
    translationGroup,
  };
}

function mockClient(existing = []) {
  const items = [...existing];
  const creates = [];
  return {
    items,
    creates,
    async collection() {
      return { fields, supports: ['drafts', 'preview'] };
    },
    async *listAll(_collection, { locale, status }) {
      assert.equal(status, 'all');
      assert.equal(locale, undefined);
      yield* items.filter((item) => !locale || item.locale === locale);
    },
    async get(_collection, idOrSlug, { locale }) {
      const item = items.find(
        (candidate) => candidate.id === idOrSlug || (candidate.slug === idOrSlug && candidate.locale === locale)
      );
      if (!item) throw Object.assign(new Error('not found'), { status: 404, code: 'NOT_FOUND' });
      return item;
    },
    async create(_collection, input) {
      assert.equal(input.status, 'draft');
      assert.equal(
        items.some((item) => item.locale === input.locale && item.slug === input.slug),
        false
      );
      const id = `new-${creates.length + 1}`;
      const group = input.translationOf ? items.find((item) => item.id === input.translationOf)?.translationGroup : id;
      if (!group) throw new Error('missing translation source');
      const item = { ...input, id, publishedAt: null, translationGroup: group };
      creates.push(input);
      items.push(item);
      return item;
    },
  };
}

const emptyTrash = async () => [];

test('pilot seed stays draft-only and target URL rejects production or lookalikes', () => {
  assert.equal(entries.length, 3);
  assert.equal(assertPreviewOrigin(), 'https://cinagroup-emdash-preview.cinagroup.workers.dev');
  for (const value of [
    'https://cinagroup.com/',
    'https://cinagroup-emdash-preview.cinagroup.workers.dev.evil.test/',
    'http://cinagroup-emdash-preview.cinagroup.workers.dev/',
  ]) {
    assert.throws(() => assertPreviewOrigin(value), /isolated workers.dev/);
  }
  const changed = structuredClone(seed);
  changed.content.posts[0].status = 'published';
  assert.throws(() => validateDraftSeed(changed), /in-review draft/);
});

test('read-only preflight reports three creates and detects trash or route conflicts', async () => {
  const client = mockClient();
  const checkedLocales = [];
  const plan = await preflightPilot({
    client,
    entries,
    trashByLocale: async (locale) => {
      checkedLocales.push(locale);
      return [];
    },
  });
  assert.deepEqual(
    plan.map((item) => item.action),
    ['create', 'create', 'create']
  );
  assert.equal(client.creates.length, 0);
  assert.deepEqual(checkedLocales, ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr']);
  await assert.rejects(
    preflightPilot({
      client,
      entries,
      trashByLocale: async (locale) => (locale === 'ja' ? [{ slug: translation.slug }] : []),
    }),
    /exists in the ja trash/
  );
  const conflict = mockClient([{ ...remote(source, 'old-source'), status: 'published' }]);
  await assert.rejects(
    preflightPilot({ client: conflict, entries, trashByLocale: emptyTrash }),
    /Conflicting existing content/
  );
  const keyConflict = mockClient([{ ...remote(source, 'other'), slug: 'other-zh' }]);
  await assert.rejects(
    preflightPilot({ client: keyConflict, entries, trashByLocale: emptyTrash }),
    /outside the pilot shares translation key/
  );
  const crossLocale = mockClient([{ ...remote(source, 'foreign'), locale: 'en', slug: 'english-archive' }]);
  await assert.rejects(
    preflightPilot({ client: crossLocale, entries, trashByLocale: emptyTrash }),
    /outside the pilot shares translation key/
  );
});

test('read_drafts permission probe fails before any partial content inventory', async () => {
  const client = mockClient();
  let listed = false;
  client.listAll = async function* () {
    listed = true;
    yield* [];
  };
  await assert.rejects(
    preflightPilot({
      client,
      entries,
      trashByLocale: async () => {
        throw new Error('HTTP 403');
      },
    }),
    /HTTP 403/
  );
  assert.equal(listed, false);
  assert.equal(client.creates.length, 0);
});

test('explicit apply creates only drafts, links Japanese translation, and safely reuses a completed import', async () => {
  const client = mockClient();
  const plan = await preflightPilot({ client, entries, trashByLocale: emptyTrash });
  const ids = await applyPilot({ client, plan });
  assert.equal(ids.size, 3);
  assert.equal(client.creates.length, 3);
  assert.equal(client.creates[2].translationOf, ids.get(source.id));
  assert.equal(
    client.items.find((item) => item.slug === translation.slug).translationGroup,
    client.items.find((item) => item.slug === source.slug).translationGroup
  );
  assert.ok(client.items.every((item) => item.status === 'draft' && item.publishedAt === null));

  const retryPlan = await preflightPilot({ client, entries, trashByLocale: emptyTrash });
  assert.ok(retryPlan.every((item) => item.action === 'reuse'));
  await applyPilot({ client, plan: retryPlan });
  assert.equal(client.creates.length, 3);
});

test('a lost create response is not retried blindly; next preflight reuses the written draft', async () => {
  const client = mockClient();
  const plan = await preflightPilot({ client, entries, trashByLocale: emptyTrash });
  const originalCreate = client.create;
  let first = true;
  client.create = async (...args) => {
    const item = await originalCreate(...args);
    if (first) {
      first = false;
      throw new Error('response lost');
    }
    return item;
  };
  await assert.rejects(applyPilot({ client, plan }), /response lost/);
  const retry = await preflightPilot({ client, entries, trashByLocale: emptyTrash });
  assert.deepEqual(
    retry.map((item) => item.action),
    ['reuse', 'create', 'create']
  );
  await applyPilot({ client, plan: retry });
  assert.equal(client.creates.length, 3);
});

test('default run is read-only even with credentials available', async () => {
  const client = mockClient();
  const result = await runPilotImport({ client, trashByLocale: emptyTrash });
  assert.equal(result.mode, 'preflight');
  assert.equal(result.summary.length, 3);
  assert.equal(client.creates.length, 0);
});

test('admin gate requires completed setup and accepts only its scoped cookie', async () => {
  const cookie = `emdash_preview_access=v1.1750000000.${'a'.repeat(64)}`;
  const fetchFn = async (_url, options) => {
    assert.match(options.headers.Authorization, /^Basic /);
    return new Response(JSON.stringify({ success: true, data: { needsSetup: false } }), {
      status: 200,
      headers: { 'set-cookie': `${cookie}; Path=/_emdash; HttpOnly` },
    });
  };
  assert.equal(await openPreviewGate(fetchFn, 'x'.repeat(32)), cookie);
  await assert.rejects(
    openPreviewGate(
      async () =>
        new Response(JSON.stringify({ success: true, data: { needsSetup: true } }), {
          status: 200,
          headers: { 'set-cookie': `${cookie}; Path=/_emdash; HttpOnly` },
        }),
      'x'.repeat(32)
    ),
    /first-admin setup/
  );
});

test('live verification requires anonymous 404 and a same-origin signed preview for each draft', async () => {
  const ids = new Map(entries.map((entry, index) => [entry.id, `id-${index}`]));
  const noindex = { 'x-robots-tag': 'noindex, nofollow' };
  const fetchFn = async (input, options) => {
    const url = new URL(input);
    if (options.method === 'POST') {
      assert.equal(options.headers.Authorization, 'Bearer ec_pat_example');
      const id = url.pathname.split('/').at(-2);
      const entry = entries.find((candidate) => ids.get(candidate.id) === id);
      return new Response(
        JSON.stringify({
          success: true,
          data: { url: `/cms-preview/${entry.slug}/?locale=${entry.locale}&_preview=signed` },
        }),
        {
          status: 200,
        }
      );
    }
    if (url.pathname === '/cms-preview/') return new Response('<ul></ul>', { status: 200, headers: noindex });
    const entry = entries.find((candidate) => url.pathname.includes(candidate.slug));
    if (!url.searchParams.has('_preview')) return new Response('Not found', { status: 404, headers: noindex });
    return new Response(`<h1>${entry.data.title}</h1>`, { status: 200, headers: noindex });
  };
  await verifyLiveDrafts({ entries, ids, token: 'ec_pat_example', cookie: 'gate-cookie', fetchFn });

  const badFetch = async (_input, options) => {
    if (options.method === 'POST') {
      return new Response(JSON.stringify({ success: true, data: { url: 'https://cinagroup.com/?_preview=signed' } }), {
        status: 200,
      });
    }
    return new Response('Not found', { status: 404, headers: noindex });
  };
  await assert.rejects(
    verifyLiveDrafts({ entries, ids, token: 'ec_pat_example', cookie: 'gate-cookie', fetchFn: badFetch }),
    /outside the isolated Worker/
  );
});

test('Cloudflare preflight verifies the deployed D1 binding and absence of routes', async () => {
  const accountId = 'a'.repeat(32);
  const results = new Map([
    [
      '/workers/scripts/cinagroup-emdash-preview/settings',
      {
        bindings: [
          { name: 'DB', type: 'd1', database_id: '050ec919-1b18-4de8-86a8-62c16c28e59c' },
          { name: 'CONTACT_DB', type: 'd1', database_id: 'a24a999d-f784-4ee1-8dcd-888a7be43e7c' },
          { name: 'MEDIA', type: 'r2_bucket', bucket_name: 'cinagroup-emdash-media-preview' },
        ],
      },
    ],
    ['/workers/scripts', [{ id: 'cinagroup-emdash-preview', routes: null }]],
    ['/workers/domains', []],
    ['/workers/scripts/cinagroup-emdash-preview/subdomain', { enabled: true }],
    ['/workers/subdomain', { subdomain: 'cinagroup' }],
  ]);
  const fetchFn = async (input) => {
    const url = new URL(input);
    return new Response(
      JSON.stringify({
        success: true,
        result: results.get(url.pathname.replace(`/client/v4/accounts/${accountId}`, '')),
      }),
      {
        status: 200,
      }
    );
  };
  assert.equal(await auditPreviewWorker({ fetchFn, accountId, cloudflareToken: 'test-token' }), true);
  results.get('/workers/scripts/cinagroup-emdash-preview/settings').bindings[0].database_id = 'wrong';
  await assert.rejects(auditPreviewWorker({ fetchFn, accountId, cloudflareToken: 'test-token' }), /isolated EmDash D1/);
});

test('EmDash client sends both the preview gate cookie and API Bearer token', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (request) => {
      assert.equal(new URL(request.url).origin, assertPreviewOrigin());
      assert.equal(request.headers.get('authorization'), 'Bearer ec_pat_example');
      assert.equal(request.headers.get('cookie'), 'emdash_preview_access=gate');
      return new Response(JSON.stringify({ success: true, data: { item: { fields: [] } } }), { status: 200 });
    };
    const client = createPreviewClient('ec_pat_example', 'emdash_preview_access=gate');
    await client.collection('posts');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
