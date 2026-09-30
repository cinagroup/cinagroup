import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findLegacyArticle,
  isPublicPostLocale,
  isPublicPostSlug,
  publicPostFromEntry,
  publicPostPath,
} from '../src/emdash/public-post.ts';

const published = (overrides = {}) => ({
  data: {
    slug: 'new-article',
    locale: 'zh',
    status: 'published',
    title: '新文章',
    excerpt: '已核准的简介',
    content: [{ _type: 'block', children: [{ _type: 'span', text: '正文' }] }],
    author_name: 'CinaGroup Editorial',
    publish_date: '2026-09-29T03:00:00Z',
    editorial_status: 'approved',
    origin: 'editorial',
    review_status: 'approved',
    reviewed_by: 'Editor',
    reviewed_at: '2026-09-28T10:00:00.000Z',
    verification_status: 'source_reviewed',
    verified_by: 'Researcher',
    verified_at: '2026-09-28T09:00:00.000Z',
    sources: [{ title: 'Official announcement', url: 'https://www.cloudflare.com/news/' }],
    ...overrides,
  },
});

test('only known locales and path-safe slugs can form public URLs', () => {
  assert.equal(isPublicPostLocale('zh'), true);
  for (const locale of ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr']) {
    assert.equal(isPublicPostLocale(locale), true);
  }
  assert.equal(isPublicPostLocale('de'), false);
  assert.equal(isPublicPostLocale('zh-CN'), false);
  assert.equal(isPublicPostSlug('new-article'), true);
  for (const slug of ['../admin', 'draft/entry', 'News', 'bad slug', 'a%2fb']) {
    assert.equal(isPublicPostSlug(slug), false, slug);
  }
  assert.equal(publicPostPath('en', 'new-article'), '/blog/new-article/');
  assert.equal(publicPostPath('ja', 'new-article'), '/ja/blog/new-article/');
});

test('legacy static articles and redirects take priority over a CMS lookup', async () => {
  const request = new Request('https://preview.example/blog/existing-article/');
  const existing = new Response('immutable legacy article', { status: 200 });
  assert.equal(await findLegacyArticle(request, { fetch: async () => existing }), existing);

  const redirect = new Response(null, { status: 308, headers: { Location: '/blog/existing-article/' } });
  assert.equal(await findLegacyArticle(request, { fetch: async () => redirect }), redirect);
  assert.equal(await findLegacyArticle(request, { fetch: async () => new Response(null, { status: 404 }) }), undefined);
});

test('exactly published EmDash locale becomes a public post', () => {
  const post = publicPostFromEntry(published(), 'zh', 'new-article', { isPreview: false });
  assert.equal(post?.title, '新文章');
  assert.equal(post?.locale, 'zh');
  assert.equal(post?.publishDate?.toISOString(), '2026-09-29T03:00:00.000Z');
});

test('every CMS-only locale can publish only its own exact locale entry', () => {
  for (const locale of ['ko', 'ru', 'es', 'pt', 'fr']) {
    const post = publicPostFromEntry(published({ locale }), locale, 'new-article', { isPreview: false });
    assert.equal(post?.locale, locale);
    assert.equal(publicPostPath(locale, 'new-article'), `/${locale}/blog/new-article/`);
    assert.equal(publicPostFromEntry(published(), locale, 'new-article', { isPreview: false }), undefined);
  }
});

test('drafts, signed previews, locale fallback, and slug mismatch stay private', () => {
  assert.equal(
    publicPostFromEntry(published({ status: 'draft' }), 'zh', 'new-article', { isPreview: false }),
    undefined
  );
  assert.equal(publicPostFromEntry(published(), 'zh', 'new-article', { isPreview: true }), undefined);
  assert.equal(
    publicPostFromEntry(published(), 'zh', 'new-article', { isPreview: false, fallbackLocale: 'en' }),
    undefined
  );
  assert.equal(publicPostFromEntry(published(), 'ja', 'new-article', { isPreview: false }), undefined);
  assert.equal(publicPostFromEntry(published(), 'zh', 'another-article', { isPreview: false }), undefined);
  assert.equal(publicPostFromEntry(null, 'zh', 'new-article', { isPreview: false }), undefined);
});

test('published status alone cannot bypass later editorial withdrawal or lost evidence', () => {
  for (const override of [
    { editorial_status: 'withdrawn' },
    { review_status: 'pending' },
    { verification_status: 'unverified' },
    { sources: [] },
  ]) {
    assert.equal(publicPostFromEntry(published(override), 'zh', 'new-article', { isPreview: false }), undefined);
  }
});

test('malformed entry data is not published', () => {
  assert.equal(publicPostFromEntry(published({ title: '' }), 'zh', 'new-article', { isPreview: false }), undefined);
  const post = publicPostFromEntry(
    published({ publish_date: null, publishedAt: new Date('2026-09-29') }),
    'zh',
    'new-article',
    {
      isPreview: false,
    }
  );
  assert.equal(post?.publishDate?.toISOString(), '2026-09-29T00:00:00.000Z');
});
