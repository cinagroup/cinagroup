import assert from 'node:assert/strict';
import test from 'node:test';
import { cmsBlogDisplaySettings, formatCmsBlogDate } from '../src/emdash/cms-blog-display.ts';

import { cmsBlogIndexHeaders, cmsBlogIndexHeadResponse, loadCmsBlogIndex } from '../src/emdash/cms-blog-index.ts';

const approvedEntry = (slug, locale, overrides = {}) => ({
  data: {
    slug,
    locale,
    status: 'published',
    title: 'Editorial article',
    content: [],
    editorial_status: 'approved',
    origin: 'editorial',
    review_status: 'approved',
    reviewed_by: 'Editor',
    reviewed_at: '2026-09-29T10:00:00.000Z',
    verification_status: 'source_reviewed',
    verified_by: 'Researcher',
    verified_at: '2026-09-29T09:00:00.000Z',
    sources: [{ title: 'Official announcement', url: 'https://www.cloudflare.com/news/' }],
    ...overrides,
  },
});

const missingAssets = { fetch: async () => new Response(null, { status: 404 }) };

test('new locale indexes are reachable but not indexable before approved articles exist', async () => {
  for (const locale of ['ko', 'ru', 'es', 'pt', 'fr']) {
    const result = await loadCmsBlogIndex(
      locale,
      `https://preview.example/${locale}/blog/`,
      missingAssets,
      async () => ({
        entries: [],
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.indexable, false);
    assert.deepEqual(result.posts, []);
  }
});

test('native index lists only its approved locale across all cursor pages', async () => {
  const cursors = [];
  const paths = [];
  const result = await loadCmsBlogIndex(
    'ko',
    'https://preview.example/ko/blog/',
    {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        paths.push(path);
        return new Response(null, { status: path.includes('legacy-post') ? 200 : 404 });
      },
    },
    async (cursor) => {
      cursors.push(cursor);
      return cursor
        ? { entries: [approvedEntry('second-post', 'ko')] }
        : {
            entries: [
              approvedEntry('first-post', 'ko'),
              approvedEntry('legacy-post', 'ko'),
              approvedEntry('draft-post', 'ko', { status: 'draft' }),
              approvedEntry('unverified-post', 'ko', { verification_status: 'unverified' }),
              approvedEntry('french-post', 'fr'),
            ],
            nextCursor: 'page-2',
          };
    }
  );
  assert.equal(result.status, 200);
  assert.equal(result.indexable, true);
  assert.deepEqual(
    result.posts.map(({ slug }) => slug),
    ['first-post', 'second-post']
  );
  assert.deepEqual(cursors, [undefined, 'page-2']);
  assert.deepEqual(paths, ['/ko/blog/first-post/', '/ko/blog/legacy-post/', '/ko/blog/second-post/']);
});

test('database failure or incomplete pagination produces a non-indexable 503 with no partial posts', async () => {
  for (const loadPage of [
    async () => ({ entries: [], error: new Error('Database unavailable') }),
    async (cursor) =>
      cursor
        ? { entries: [], error: new Error('Page unavailable') }
        : {
            entries: [approvedEntry('first-post', 'es')],
            nextCursor: 'page-2',
          },
    async () => ({ entries: [approvedEntry('first-post', 'es')], nextCursor: 'repeated-cursor' }),
  ]) {
    const result = await loadCmsBlogIndex('es', 'https://preview.example/es/blog/', missingAssets, loadPage);
    assert.equal(result.status, 503);
    assert.equal(result.indexable, false);
    assert.deepEqual(result.posts, []);
    assert.ok(result.error instanceof Error);
  }
});

test('native HEAD response matches GET status, cache and robots policy without a body', () => {
  for (const result of [
    { status: 200, indexable: false },
    { status: 200, indexable: true },
    { status: 503, indexable: false },
  ]) {
    const response = cmsBlogIndexHeadResponse(result);
    assert.equal(response.status, result.status);
    assert.equal(response.body, null);
    assert.deepEqual([...response.headers], [...cmsBlogIndexHeaders(result)]);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('X-Robots-Tag'), result.indexable ? null : 'noindex, follow');
  }
});

test('CMS pagination uses the complete approved inventory and bounds malformed display input', async () => {
  const result = await loadCmsBlogIndex(
    'fr',
    'https://cinagroup.com/fr/blog/?page=2',
    missingAssets,
    async () => ({
      entries: [
        approvedEntry('one', 'fr'),
        approvedEntry('hidden-draft', 'fr', { status: 'draft' }),
        approvedEntry('two', 'fr'),
        approvedEntry('three', 'fr'),
      ],
    }),
    { postsPerPage: 2 }
  );
  assert.deepEqual(
    result.posts.map((post) => post.slug),
    ['three']
  );
  assert.equal(result.pagination.total, 3);
  assert.equal(result.pagination.previousHref, '/fr/blog/');
  assert.equal(result.pagination.nextHref, undefined);
  const settings = cmsBlogDisplaySettings({
    postsPerPage: -1,
    dateFormat: 'invalid token string',
    timezone: 'Unknown/Timezone',
  });
  assert.equal(settings.postsPerPage, 6);
  assert.equal(settings.timezone, 'Asia/Singapore');
  assert.equal(settings.dateFormat, 'MMMM d, yyyy');
  assert.equal(
    formatCmsBlogDate(new Date('2026-01-23T00:30:00Z'), 'fr', cmsBlogDisplaySettings({ dateFormat: 'MMMM d, yyyy' })),
    'janvier 23, 2026'
  );
});

test('native setting lookup failures keep the approved CMS list usable', async () => {
  const result = await loadCmsBlogIndex(
    'es',
    'https://cinagroup.com/es/blog/?page=999999',
    missingAssets,
    async () => ({ entries: [approvedEntry('published', 'es')] }),
    Promise.reject(new Error('Settings unavailable'))
  );
  assert.equal(result.status, 200);
  assert.equal(result.posts[0].slug, 'published');
  assert.equal(result.pagination.page, 1);
  assert.equal(result.pagination.canonicalHref, '/es/blog/');
});
