import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchLegacyArticleAsset, isPotentialLegacyArticleUrl } from '../src/emdash/legacy-article-asset.ts';

test('only pilot blog article routes enter the Worker asset lookup', () => {
  const origin = 'https://cinagroup-emdash-preview.cinagroup.workers.dev';
  assert.equal(isPotentialLegacyArticleUrl(`${origin}/zh/blog/news-briefing-2026-06-15-06-zh/`), true);
  assert.equal(isPotentialLegacyArticleUrl(`${origin}/blog/ai-news-briefing-2026-03-20/`), true);
  for (const path of ['/blog/', '/ko/blog/post/', '/blog/draft/edit/', '/blog/UPPER/', '/_emdash/admin/']) {
    assert.equal(isPotentialLegacyArticleUrl(`${origin}${path}`), false, path);
  }
});

test('legacy asset response wins before CMS routing, preserving method and conditional headers', async () => {
  const request = new Request('https://preview.example/zh/blog/old-post/', {
    headers: { 'If-None-Match': '"old"' },
  });
  const existing = new Response('existing article', { status: 200 });
  const response = await fetchLegacyArticleAsset(request, {
    async fetch(assetRequest) {
      assert.equal(new URL(assetRequest.url).pathname, '/zh/blog/old-post/');
      assert.equal(assetRequest.headers.get('If-None-Match'), '"old"');
      return existing;
    },
  });
  assert.equal(response, existing);
});

test('missing legacy asset and non-GET article requests continue to the CMS route', async () => {
  let calls = 0;
  const assets = {
    async fetch() {
      calls++;
      return new Response('missing', { status: 404 });
    },
  };
  assert.equal(
    await fetchLegacyArticleAsset(new Request('https://preview.example/ja/blog/new-post/'), assets),
    undefined
  );
  assert.equal(
    await fetchLegacyArticleAsset(new Request('https://preview.example/ja/blog/new-post/', { method: 'POST' }), assets),
    undefined
  );
  assert.equal(calls, 1);
});
