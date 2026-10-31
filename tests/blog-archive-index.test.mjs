import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBlogArchiveIndex, explicitlyArchivedIds } from '../src/utils/blog-archive-index.ts';

const entry = (overrides = {}) => ({
  id: 'ai-news-briefing-2026-04-07-06',
  slug: 'ai-news-briefing-2026-04-07-06',
  permalink: 'blog/ai-news-briefing-2026-04-07-06',
  language: 'en',
  status: 'archived_unverified',
  draft: false,
  publishDate: new Date('2026-04-07T06:00:00.000Z'),
  title: 'Briefing',
  excerpt: 'Archive excerpt',
  ...overrides,
});

const postUrl = (permalink) => `/${permalink}/`;
const formatDate = (date, language) => `${language}:${date.toISOString()}`;
const archivedIds = new Set(['ai-news-briefing-2026-04-07-06']);

test('archive index contains only the necessary public fields', () => {
  const result = buildBlogArchiveIndex(
    [entry({ content: 'private body', review: 'private review' })],
    archivedIds,
    postUrl,
    formatDate
  );
  assert.deepEqual(result, [
    {
      title: 'Briefing',
      excerpt: 'Archive excerpt',
      url: '/blog/ai-news-briefing-2026-04-07-06/',
      date: '2026-04-07',
      displayDate: 'en:2026-04-07T06:00:00.000Z',
    },
  ]);
});

test('drafts, withdrawn posts, editorial posts and other locales never enter the archive index', () => {
  const posts = [
    entry(),
    entry({ draft: true, title: 'draft flag' }),
    entry({ status: 'draft', title: 'draft' }),
    entry({ status: 'in_review', title: 'review' }),
    entry({ status: 'scheduled', title: 'scheduled' }),
    entry({ status: 'withdrawn', title: 'withdrawn' }),
    entry({ status: 'published', title: 'published' }),
    entry({ language: 'zh-CN', title: 'Chinese' }),
    entry({ slug: 'ordinary-article', title: 'other archive' }),
  ];
  assert.deepEqual(
    buildBlogArchiveIndex(posts, archivedIds, postUrl, formatDate).map((post) => post.title),
    ['Briefing']
  );
});

test('missing excerpts are represented as empty strings and original order is retained', () => {
  const entries = [entry({ title: 'Newest', excerpt: undefined }), entry({ title: 'Older' })];
  const result = buildBlogArchiveIndex(entries, archivedIds, postUrl, formatDate);
  assert.equal(result[0].excerpt, '');
  assert.deepEqual(
    result.map((post) => post.title),
    ['Newest', 'Older']
  );
});

test('date filters use the same Singapore calendar day as the displayed date', () => {
  const posts = [entry({ publishDate: new Date('2026-10-31T18:00:00Z') })];
  assert.equal(buildBlogArchiveIndex(posts, archivedIds, postUrl, formatDate)[0].date, '2026-11-01');
});

test('only source records explicitly marked as archives are eligible even if normalization changes their status', () => {
  const ids = explicitlyArchivedIds([
    { id: 'archive', data: { status: 'archived_unverified' } },
    { id: 'draft-status', data: { status: 'draft' } },
    { id: 'draft-flag', data: { status: 'archived_unverified', draft: true } },
    { id: 'review', data: { status: 'in_review' } },
    { id: 'missing', data: {} },
  ]);
  const posts = ['archive', 'draft-status', 'draft-flag', 'review', 'missing'].map((id) => entry({ id, title: id }));
  assert.deepEqual(
    buildBlogArchiveIndex(posts, ids, postUrl, formatDate).map((post) => post.title),
    ['archive']
  );
});
