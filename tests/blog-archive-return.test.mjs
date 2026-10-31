import assert from 'node:assert/strict';
import test from 'node:test';

import { blogArchiveReturnHref, createArchiveVisit, resolveArchiveVisit } from '../src/utils/blog-archive-return.ts';

const origin = 'https://cinagroup.com';
const post = '/blog/ai-news-briefing-2026-10-16-06/';

test('archive return preserves filters, result page, oldest sorting and the search anchor', () => {
  assert.deepEqual(
    createArchiveVisit(
      new URL(post, origin),
      `${origin}/blog/2?q=OpenAI%20agents&month=2026-10&archivePage=3&sort=oldest#archive-search-heading`,
      origin
    ),
    {
      postPath: post,
      archiveHref: '/blog/2/?q=OpenAI+agents&month=2026-10&archivePage=3&sort=oldest#archive-search-heading',
    }
  );
});

test('only the selected English archived article receives the stored return link', () => {
  const visit = createArchiveVisit(post, '/blog/?q=OpenAI', origin);
  assert.equal(resolveArchiveVisit(visit, `${origin}${post}?source=bookmark`, origin), '/blog/?q=OpenAI');
  assert.equal(resolveArchiveVisit(visit, '/blog/ai-news-briefing-2026-10-17-06/', origin), undefined);
  assert.equal(resolveArchiveVisit(visit, `/zh${post}`, origin), undefined);
  assert.equal(resolveArchiveVisit(visit, `${origin}/blog/`, origin), undefined);
});

test('return state contains only the article path and supported archive parameters', () => {
  const visit = createArchiveVisit(
    `${post}?private=discard#heading`,
    '/blog?q=%20OpenAI%20&archivePage=1&sort=newest&redirect=https://example.com&body=discard#other-heading',
    origin
  );
  assert.deepEqual(visit, { postPath: post, archiveHref: '/blog/?q=OpenAI' });
});

test('external, credentialed, non-web and locale archive destinations are rejected', () => {
  const unsafe = [
    'https://example.com/blog/?q=OpenAI',
    '//example.com/blog/',
    'http://cinagroup.com/blog/',
    'https://user:password@cinagroup.com/blog/',
    'javascript:alert(1)',
    'data:text/html,/blog/',
    '/_emdash/',
    '/admin/',
    '/zh/blog/',
    '/blog/category/ai/',
    post,
    '/blog/0/',
    '/blog/-1/',
    '/blog/02/',
    '/blog/%32/',
    '/blog/\\evil',
    '/blog/\n',
  ];
  for (const value of unsafe) {
    assert.equal(blogArchiveReturnHref(value, origin), undefined, value);
    assert.equal(createArchiveVisit(post, value, origin), undefined, value);
  }
});

test('post destinations cannot target external sites, admin, locale or list routes', () => {
  for (const value of [
    `https://example.com${post}`,
    `http://cinagroup.com${post}`,
    `https://reader@cinagroup.com${post}`,
    'javascript:alert(1)',
    '/_emdash/',
    '/blog/admin/',
    `/zh${post}`,
    '/blog/2/',
    '/blog/ai-news-briefing-one/extra/',
    '/blog/ai-news-briefing-%2fadmin/',
  ]) {
    assert.equal(createArchiveVisit(value, '/blog/?q=AI', origin), undefined, value);
  }
});

test('invalid, unbounded or tampered stored search states do not replace the default link', () => {
  for (const search of [
    `?q=${'a'.repeat(301)}`,
    '?month=2026-13',
    '?month=2026-1',
    '?archivePage=0',
    '?archivePage=1.5',
    '?archivePage=9007199254740992',
    '?sort=random',
  ]) {
    assert.equal(createArchiveVisit(post, `/blog/${search}`, origin), undefined, search);
  }
  for (const value of [
    undefined,
    null,
    [],
    'not a record',
    {},
    { postPath: post, archiveHref: 5 },
    { postPath: post, archiveHref: 'https://example.com/blog/' },
    { postPath: '/_emdash/', archiveHref: '/blog/?q=OpenAI' },
  ]) {
    assert.equal(resolveArchiveVisit(value, post, origin), undefined);
  }
});

test('same-origin local development is supported without accepting arbitrary protocols', () => {
  const localOrigin = 'http://127.0.0.1:4322';
  assert.deepEqual(createArchiveVisit(post, '/blog/?q=AI', localOrigin), {
    postPath: post,
    archiveHref: '/blog/?q=AI',
  });
  assert.equal(createArchiveVisit(post, '/blog/', 'file:///tmp/'), undefined);
});
