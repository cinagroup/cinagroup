import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isActiveBlogIndexLocale,
  renderPublicCmsSection,
  respondWithPublicBlogIndex,
  selectPublicCmsPosts,
} from '../src/emdash/public-blog-index.ts';

const legacyHtml =
  '<main><section data-blog-collection="index"><header><h1>Journal</h1></header><ul class="cg-blog-list"><li>Legacy article</li></ul></section></main>';
const entry = (slug, overrides = {}) => ({
  data: {
    slug,
    locale: 'zh',
    status: 'published',
    title: '文章标题',
    excerpt: '介绍',
    content: [{ _type: 'block', children: [] }],
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

test('legacy and native CMS index locales are admitted', () => {
  for (const locale of ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr']) {
    assert.equal(isActiveBlogIndexLocale(locale), true);
  }
  assert.equal(isActiveBlogIndexLocale('de'), false);
});

test('no published CMS entries return the original static asset response untouched', async () => {
  const original = new Response(legacyHtml, { headers: { 'Content-Type': 'text/html', ETag: 'legacy-hash' } });
  const request = new Request('https://preview.example/zh/blog/');
  const assets = { fetch: async () => original };
  const response = await respondWithPublicBlogIndex(request, 'zh', assets, async () => ({ entries: [] }));
  assert.equal(response, original);
  assert.equal(response.headers.get('ETag'), 'legacy-hash');
  assert.equal(await response.text(), legacyHtml);
});

test('a conditional 304 remains untouched when there are no public CMS posts', async () => {
  const original = new Response(null, { status: 304, headers: { ETag: 'legacy-hash' } });
  let assetFetches = 0;
  const response = await respondWithPublicBlogIndex(
    new Request('https://preview.example/zh/blog/', { headers: { 'If-None-Match': 'legacy-hash' } }),
    'zh',
    {
      fetch: async () => {
        assetFetches += 1;
        return original;
      },
    },
    async () => ({ entries: [] })
  );
  assert.equal(response, original);
  assert.equal(assetFetches, 1);
  assert.equal(response.status, 304);
});

test('drafts, unapproved content and legacy-slug collisions never enter CMS list', async () => {
  const fetchedPaths = [];
  const assets = {
    fetch: async (request) => {
      fetchedPaths.push(new URL(request.url).pathname);
      return new Response(null, { status: request.url.includes('old-slug') ? 200 : 404 });
    },
  };
  const posts = await selectPublicCmsPosts(
    [
      entry('draft', { status: 'draft' }),
      entry('withdrawn', { editorial_status: 'withdrawn' }),
      entry('wrong-language', { locale: 'ja' }),
      entry('old-slug'),
      entry('safe-slug'),
      entry('safe-slug'),
    ],
    'zh',
    'https://preview.example/zh/blog/',
    assets
  );
  assert.deepEqual(
    posts.map((post) => post.slug),
    ['safe-slug']
  );
  assert.deepEqual(fetchedPaths, ['/zh/blog/old-slug/', '/zh/blog/safe-slug/']);
});

test('CMS section renders safe text and exact locale links', () => {
  const html = renderPublicCmsSection(
    [{ slug: 'safe-slug', locale: 'zh', title: '<script>alert("x")</script>', excerpt: 'A & B', content: [] }],
    'zh'
  );
  assert.ok(html.includes('data-blog-source="emdash"'));
  assert.ok(html.includes('href="/zh/blog/safe-slug/"'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(!html.includes('<script>alert'));
});

test('HTMLRewriter inserts CMS section before the original legacy list', async () => {
  const original = new Response(legacyHtml, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Encoding': 'gzip',
      ETag: 'legacy-hash',
      'Content-Length': String(legacyHtml.length),
    },
  });
  const assets = {
    fetch: async (request) =>
      new URL(request.url).pathname === '/zh/blog/' ? original : new Response(null, { status: 404 }),
  };
  let selector;
  let beforeOptions;
  const createRewriter = () => ({
    on(value, handler) {
      selector = value;
      this.handler = handler;
      return this;
    },
    transform(response) {
      assert.equal(response, original);
      let section = '';
      this.handler.element({
        before(html, options) {
          section = html;
          beforeOptions = options;
        },
      });
      const html = legacyHtml.replace('<ul class="cg-blog-list">', `${section}<ul class="cg-blog-list">`);
      return new Response(html, { headers: response.headers });
    },
  });
  const response = await respondWithPublicBlogIndex(
    new Request('https://preview.example/zh/blog/'),
    'zh',
    assets,
    async () => ({ entries: [entry('safe-slug')] }),
    createRewriter
  );
  const html = await response.text();
  assert.equal(selector, 'section[data-blog-collection="index"] ul.cg-blog-list');
  assert.deepEqual(beforeOptions, { html: true });
  assert.ok(html.includes('data-blog-source="emdash"'));
  assert.ok(html.includes('href="/zh/blog/safe-slug/"'));
  assert.ok(html.indexOf('data-blog-source="emdash"') < html.indexOf('<li>Legacy article</li>'));
  assert.ok(html.endsWith('<ul class="cg-blog-list"><li>Legacy article</li></ul></section></main>'));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Content-Encoding'), 'gzip');
  assert.equal(response.headers.get('ETag'), null);
  assert.equal(response.headers.get('Content-Length'), null);
});

test('a visible CMS post re-fetches HTML without conditional headers after a static 304', async () => {
  const cached = new Response(null, { status: 304, headers: { ETag: 'legacy-hash' } });
  const fresh = new Response(legacyHtml, { headers: { ETag: 'legacy-hash' } });
  const indexRequests = [];
  const assets = {
    fetch: async (request) => {
      if (new URL(request.url).pathname !== '/zh/blog/') return new Response(null, { status: 404 });
      indexRequests.push(request);
      return request.headers.has('If-None-Match') ? cached : fresh;
    },
  };
  const createRewriter = () => ({
    on(_selector, handler) {
      this.handler = handler;
      return this;
    },
    transform(response) {
      assert.equal(response, fresh);
      this.handler.element({
        before(html) {
          assert.ok(html.includes('/zh/blog/safe-slug/'));
        },
      });
      return new Response('rewritten', { headers: response.headers });
    },
  });
  const response = await respondWithPublicBlogIndex(
    new Request('https://preview.example/zh/blog/', { headers: { 'If-None-Match': 'legacy-hash' } }),
    'zh',
    assets,
    async () => ({ entries: [entry('safe-slug')] }),
    createRewriter
  );
  assert.equal(indexRequests.length, 2);
  assert.equal(indexRequests[0].headers.get('If-None-Match'), 'legacy-hash');
  assert.equal(indexRequests[1].headers.get('If-None-Match'), null);
  assert.equal(await response.text(), 'rewritten');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
