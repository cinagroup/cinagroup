import assert from 'node:assert/strict';
import test from 'node:test';

import { getRssString } from '@astrojs/rss';

import {
  cmsPostsToRssItems,
  cmsSitemapXml,
  isCmsOnlyBlogIndexPath,
  PRODUCTION_ROBOTS_BODY,
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

test('robots body preserves the live production sitemap until published CMS content exists', () => {
  assert.equal(PRODUCTION_ROBOTS_BODY, 'User-agent: *\nDisallow:\n\nSitemap: https://cinagroup.com/sitemap-index.xml');
  assert.equal(robotsBody(false, 'https://cinagroup.com'), PRODUCTION_ROBOTS_BODY);
  assert.equal(
    robotsBody(true, 'https://cinagroup.com'),
    `${PRODUCTION_ROBOTS_BODY}\nSitemap: https://cinagroup.com/sitemap-emdash.xml`
  );
});

test('static sitemap excludes only CMS-only index paths before locale prefixes are stripped', () => {
  for (const locale of ['ko', 'ru', 'es', 'pt', 'fr']) {
    assert.equal(isCmsOnlyBlogIndexPath(`/${locale}/blog/`), true);
    assert.equal(isCmsOnlyBlogIndexPath(`/${locale}/blog`), true);
    assert.equal(isCmsOnlyBlogIndexPath(`/${locale}/blog/approved-post/`), false);
    assert.equal(isCmsOnlyBlogIndexPath(`/${locale}/about/`), false);
  }
  for (const path of ['/blog/', '/en/blog/', '/zh/blog/', '/ja/blog/', '/cms-preview/', '/de/blog/']) {
    assert.equal(isCmsOnlyBlogIndexPath(path), false);
  }
});

test('empty CMS sitemap contains no native index URL', () => {
  const xml = cmsSitemapXml([], 'https://cinagroup.com');
  assert.doesNotMatch(xml, /<url>|\/blog\//);
});

test('only non-empty native CMS locales add a unique index URL; legacy indexes stay static', async () => {
  const entriesByLocale = {
    fr: [approvedEntry('first-post', 'fr'), approvedEntry('second-post', 'fr')],
    ko: [approvedEntry('korean-post', 'ko')],
    zh: [approvedEntry('chinese-post', 'zh')],
    en: [approvedEntry('english-post', 'en')],
    ja: [approvedEntry('japanese-post', 'ja')],
  };
  const posts = (
    await Promise.all(
      Object.entries(entriesByLocale).map(([locale, entries]) =>
        listDiscoverableCmsPosts(locale, 'https://preview.example/', missingAssets, async () => ({ entries }))
      )
    )
  ).flat();
  const xml = cmsSitemapXml(posts, 'https://cinagroup.com');
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.equal(urls.filter((url) => url === 'https://cinagroup.com/fr/blog/').length, 1);
  assert.equal(urls.filter((url) => url === 'https://cinagroup.com/ko/blog/').length, 1);
  for (const path of ['/blog/', '/zh/blog/', '/ja/blog/', '/ru/blog/', '/es/blog/', '/pt/blog/']) {
    assert.ok(!urls.includes(`https://cinagroup.com${path}`), path);
  }
  assert.equal(urls.length, posts.length + 2);
});

test('draft, private path, unapproved, wrong-locale and legacy-collision entries cannot advertise a native index', async () => {
  const paths = [];
  const posts = await listDiscoverableCmsPosts(
    'fr',
    'https://preview.example/',
    {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        paths.push(path);
        return new Response(null, { status: 200 });
      },
    },
    async () => ({
      entries: [
        approvedEntry('draft-post', 'fr', { status: 'draft' }),
        approvedEntry('../cms-preview', 'fr'),
        approvedEntry('withdrawn-post', 'fr', { editorial_status: 'withdrawn' }),
        approvedEntry('wrong-locale', 'ko'),
        approvedEntry('legacy-collision', 'fr'),
      ],
    })
  );
  assert.deepEqual(posts, []);
  assert.deepEqual(paths, ['/fr/blog/legacy-collision/']);
  assert.doesNotMatch(cmsSitemapXml(posts, 'https://cinagroup.com'), /<url>|cms-preview|\/fr\/blog\//);
  assert.throws(
    () => cmsSitemapXml([{ locale: 'fr', slug: '../cms-preview' }], 'https://cinagroup.com'),
    /Invalid sitemap post slug/
  );
});

test('the sitemap URL limit counts native index URLs in addition to article URLs', () => {
  const posts = Array.from({ length: 49_999 }, (_, index) => ({
    locale: 'fr',
    slug: `post-${index}`,
    title: 'Article',
    excerpt: '',
    content: [],
  }));
  const xml = cmsSitemapXml(posts, 'https://cinagroup.com');
  assert.equal([...xml.matchAll(/<url>/g)].length, 50_000);
  assert.match(xml, /<loc>https:\/\/cinagroup\.com\/fr\/blog\/<\/loc>/);
  assert.throws(
    () => cmsSitemapXml([...posts, { ...posts[0], slug: 'last-post' }], 'https://cinagroup.com'),
    /50,000 URL limit/
  );
  assert.throws(
    () =>
      cmsSitemapXml(
        [...posts.slice(0, -1), { ...posts[0], locale: 'ko', slug: 'korean-post' }, { ...posts[0], slug: 'last-post' }],
        'https://cinagroup.com'
      ),
    /50,000 URL limit/
  );
});
