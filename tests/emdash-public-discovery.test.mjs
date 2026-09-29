import assert from 'node:assert/strict';
import test from 'node:test';

import { getRssString } from '@astrojs/rss';

import {
  cmsPostsToRssItems,
  cmsSitemapXml,
  LEGACY_ROBOTS_BODY,
  listDiscoverableCmsPosts,
  robotsBody,
} from '../src/emdash/public-discovery.ts';

const approvedEntry = (slug, locale = 'zh', overrides = {}) => ({
  data: {
    slug,
    locale,
    status: 'published',
    title: '文章 <标题>',
    excerpt: 'A & B',
    content: [],
    editorial_status: 'approved',
    origin: 'editorial',
    review_status: 'approved',
    reviewed_by: 'Editor',
    reviewed_at: '2026-09-28T10:00:00.000Z',
    verification_status: 'source_reviewed',
    verified_by: 'Researcher',
    verified_at: '2026-09-28T09:00:00.000Z',
    sources: [{ title: 'Official announcement', url: 'https://www.cloudflare.com/news/' }],
    publish_date: '2026-09-29T03:00:00Z',
    ...overrides,
  },
});

const missingAssets = {
  fetch: async () => new Response(null, { status: 404 }),
};

test('empty CMS leaves the public post inventory empty without asset probes', async () => {
  const assets = { fetch: async () => assert.fail('No post path should be probed') };
  const posts = await listDiscoverableCmsPosts('en', 'https://preview.example/rss.xml', assets, async () => ({
    entries: [],
  }));
  assert.deepEqual(posts, []);
});

test('published, approved posts are enumerated across cursor pages in only the requested locale', async () => {
  const probedPaths = [];
  const assets = {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      probedPaths.push(path);
      return new Response(null, { status: path.includes('legacy-path') ? 200 : 404 });
    },
  };
  const cursors = [];
  const posts = await listDiscoverableCmsPosts(
    'zh',
    'https://preview.example/sitemap-emdash.xml',
    assets,
    async (cursor) => {
      cursors.push(cursor);
      return cursor
        ? {
            entries: [approvedEntry('second-post'), approvedEntry('second-post'), approvedEntry('japanese-post', 'ja')],
          }
        : {
            entries: [
              approvedEntry('first-post'),
              approvedEntry('draft-post', 'zh', { status: 'draft' }),
              approvedEntry('review-post', 'zh', { editorial_status: 'withdrawn' }),
              approvedEntry('legacy-path'),
            ],
            nextCursor: 'page-2',
          };
    }
  );

  assert.deepEqual(cursors, [undefined, 'page-2']);
  assert.deepEqual(
    posts.map(({ slug }) => slug),
    ['first-post', 'second-post']
  );
  assert.deepEqual(probedPaths, ['/zh/blog/first-post/', '/zh/blog/legacy-path/', '/zh/blog/second-post/']);
});

test('pagination or CMS errors fail explicitly instead of producing a partial sitemap', async () => {
  await assert.rejects(
    listDiscoverableCmsPosts('ja', 'https://preview.example/', missingAssets, async () => ({
      entries: [approvedEntry('first-post', 'ja')],
      nextCursor: 'repeated',
    })),
    /did not advance/
  );
  await assert.rejects(
    listDiscoverableCmsPosts('ja', 'https://preview.example/', missingAssets, async () => ({
      entries: [],
      error: new Error('database unavailable'),
    })),
    /database unavailable/
  );
});

test('robots discovery stops only after a post survives review and legacy-route checks', async () => {
  const paths = [];
  const assets = {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      paths.push(path);
      return new Response(null, { status: path.includes('old-slug') ? 200 : 404 });
    },
  };
  let calls = 0;
  const posts = await listDiscoverableCmsPosts(
    'en',
    'https://preview.example/robots.txt',
    assets,
    async () => {
      calls++;
      return {
        entries: [
          approvedEntry('draft-slug', 'en', { status: 'draft' }),
          approvedEntry('old-slug', 'en'),
          approvedEntry('new-slug', 'en'),
          approvedEntry('later-slug', 'en'),
        ],
      };
    },
    1
  );
  assert.equal(calls, 1);
  assert.deepEqual(
    posts.map(({ slug }) => slug),
    ['new-slug']
  );
  assert.deepEqual(paths, ['/blog/old-slug/', '/blog/new-slug/']);
});

test('RSS items and sitemap contain canonical exact-locale URLs with XML-safe text', async () => {
  const zh = (
    await listDiscoverableCmsPosts('zh', 'https://preview.example/', missingAssets, async () => ({
      entries: [approvedEntry('first-post')],
    }))
  )[0];
  const ja = (
    await listDiscoverableCmsPosts('ja', 'https://preview.example/', missingAssets, async () => ({
      entries: [approvedEntry('second-post', 'ja')],
    }))
  )[0];
  const xml = cmsSitemapXml([zh, ja], 'https://cinagroup.com');
  assert.match(xml, /<loc>https:\/\/cinagroup\.com\/zh\/blog\/first-post\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/cinagroup\.com\/ja\/blog\/second-post\/<\/loc>/);
  assert.doesNotMatch(xml, /preview\.example|cms-preview|_preview|draft-post/);

  const rss = await getRssString({
    title: 'CinaGroup',
    description: 'Published editorial posts',
    site: 'https://cinagroup.com',
    items: cmsPostsToRssItems([zh]),
  });
  assert.match(rss, /https:\/\/cinagroup\.com\/zh\/blog\/first-post\//);
  assert.match(rss, /文章 &lt;标题&gt;/);
  assert.match(rss, /A &amp; B/);
  assert.doesNotMatch(rss, /ja\/blog\/second-post|draft-post/);
});

test('robots body is byte-for-byte legacy until published CMS content exists', () => {
  assert.equal(LEGACY_ROBOTS_BODY, 'User-agent: *\r\nDisallow:');
  assert.equal(robotsBody(false, 'https://cinagroup.com'), LEGACY_ROBOTS_BODY);
  assert.equal(
    robotsBody(true, 'https://cinagroup.com'),
    `${LEGACY_ROBOTS_BODY}\r\nSitemap: https://cinagroup.com/sitemap-index.xml\r\nSitemap: https://cinagroup.com/sitemap-emdash.xml`
  );
});
