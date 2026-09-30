import assert from 'node:assert/strict';
import test from 'node:test';

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
