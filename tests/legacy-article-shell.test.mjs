import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  extractLegacyArticleShell,
  legacyArticleReadRequest,
  loadLegacyArticleShell,
  setLegacyArticleShellHeaders,
  withoutHeadBody,
} from '../src/emdash/legacy-article-shell.ts';

const url = 'https://cinagroup.com/zh/blog/old-post/';
const main =
  '<main id="main-content" tabindex="-1"><article class="cg-blog-post" data-content-kind="historical-archive" data-content-status="archived_unverified"><aside data-archive-notice>存档 / Unverified</aside><div class="cg-prose"><p>Original &amp; copy &lt;tag&gt;</p><pre><code>const value = "&lt;main&gt;";</code></pre><table><tbody><tr><td>Original</td></tr></tbody></table><script>window.articleCodeCopy = true;</script></div></article></main>';
function fixture({ archived = true, extraHead = '', extraBody = '' } = {}) {
  const body = archived
    ? main
    : main.replace('historical-archive', 'editorial').replace('archived_unverified', 'published');
  return (
    '<!doctype html><html lang="zh-CN" dir="ltr" class="original-root"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legacy title</title><meta name="description" content="Original description"><meta name="robots" content="' +
    (archived ? 'noindex,follow' : 'index,follow') +
    '"><link rel="canonical" href="' +
    url +
    '"><link rel="alternate" hreflang="ja" href="https://cinagroup.com/ja/blog/old-ja-post/"><meta property="og:type" content="article"><meta property="article:published_time" content="2026-06-01T00:00:00Z"><link rel="icon" href="/old.ico"><link rel="apple-touch-icon" href="/old.png"><link rel="stylesheet" href="/_astro/original.css"><style>.cg-prose pre{white-space:pre}</style><meta name="astro-view-transitions-enabled" content="true"><script type="module" src="/_astro/ClientRouter.astro_astro_type_script_index_0_lang.abc.js"></script><script>if(window.basic_script)return;window.basic_script=true;</script>' +
    extraHead +
    '</head><body class="original-body"><header id="marketing-header"><a href="/" lang="en">English fallback</a><a href="/zh/blog/old-post/" lang="zh">中文</a></header>' +
    body +
    '<footer>Old navigation</footer><script>window.awIntersectionObserver={};</script>' +
    extraBody +
    '</body></html>'
  );
}

test('controlled archive main is byte-for-byte unchanged, including governance and article scripts', () => {
  const article = extractLegacyArticleShell(fixture(), url);
  assert.ok(article);
  assert.equal(article.mainHtml, main);
  assert.equal(article.archived, true);
  assert.equal(article.noIndex, true);
  assert.equal(article.language, 'zh-CN');
  assert.equal(article.htmlClass, 'original-root');
  assert.equal(article.bodyClass, 'original-body');
  assert.deepEqual(article.languageAlternates, [
    { hreflang: 'en', href: '/' },
    { hreflang: 'zh', href: '/zh/blog/old-post/' },
    { hreflang: 'ja', href: 'https://cinagroup.com/ja/blog/old-ja-post/' },
  ]);
  for (const expected of [
    '<title>Legacy title</title>',
    'name="robots" content="noindex,follow"',
    'rel="canonical"',
    'rel="alternate"',
    'property="og:type"',
    'article:published_time',
    '/_astro/original.css',
    '.cg-prose pre',
  ])
    assert.ok(article.headHtml.includes(expected), expected);
  for (const removed of ['/old.ico', '/old.png', 'ClientRouter', 'astro-view-transitions-', 'window.basic_script'])
    assert.equal(article.headHtml.includes(removed), false, removed);
  assert.equal(article.bodyScriptsHtml, '');
});

test('published article JSON-LD and unknown compiled interactions are preserved once', () => {
  const json =
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"原文"}</script>';
  const interaction =
    '<script type="module" src="/_astro/article-copy.abc.js"></script><script>window.awIntersectionObserver?.removeAnimationDelay();</script>';
  const article = extractLegacyArticleShell(fixture({ archived: false, extraHead: json, extraBody: interaction }), url);
  assert.ok(article);
  assert.equal(article.archived, false);
  assert.equal(article.noIndex, false);
  assert.ok(article.headHtml.includes(json));
  assert.equal(article.bodyScriptsHtml, interaction);
});

test('unsupported documents, contradictory archive governance and locale/canonical mismatches fail closed', () => {
  const html = fixture();
  for (const input of [
    html.replace('id="main-content"', 'id="other"'),
    html.replace('data-content-status="archived_unverified"', 'data-content-status="draft"'),
    html.replace('noindex,follow', 'index,follow'),
    html.replace('data-archive-notice', 'data-missing-notice'),
    html.replace('<title>Legacy title</title>', '<title>First</title><title>Second</title>'),
    html.replace('<main id=', '<main></main><main id='),
    html.replace('https://cinagroup.com/zh/blog/old-post/', 'https://other.example/zh/blog/old-post/'),
    html.replace('lang="zh-CN"', 'lang="en"'),
    html.replace('</head>', ''),
    html.replace('</main>', ''),
  ])
    assert.equal(extractLegacyArticleShell(input, url), undefined);
  assert.equal(extractLegacyArticleShell(html, 'https://cinagroup.com/zh/blog/other/'), undefined);
  assert.equal(extractLegacyArticleShell('x'.repeat(2 * 1024 * 1024 + 1), url), undefined);
});

test('conditional and range HEAD fetches read a full GET internally; a new shell drops old entity validators', async () => {
  const request = new Request(url, {
    method: 'HEAD',
    headers: {
      'If-None-Match': '"old"',
      'If-Modified-Since': 'yesterday',
      'If-Match': '"x"',
      'If-Unmodified-Since': 'yesterday',
      Range: 'bytes=0-9',
      'If-Range': '"old"',
      'Accept-Language': 'zh',
    },
  });
  const inner = legacyArticleReadRequest(request);
  assert.equal(inner.method, 'GET');
  assert.equal(inner.headers.get('Accept-Language'), 'zh');
  for (const name of ['If-None-Match', 'If-Modified-Since', 'If-Match', 'If-Unmodified-Since', 'Range', 'If-Range'])
    assert.equal(inner.headers.has(name), false, name);
  const result = await loadLegacyArticleShell(request, {
    async fetch(req) {
      assert.equal(req.method, 'GET');
      assert.equal(req.headers.has('Range'), false);
      return new Response(fixture(), { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"old"' } });
    },
  });
  assert.equal(result.kind, 'shell');
  const headers = new Headers({
    ETag: '"old"',
    'Last-Modified': 'yesterday',
    'Content-Length': '123',
    'Content-Encoding': 'gzip',
    'Accept-Ranges': 'bytes',
  });
  setLegacyArticleShellHeaders(headers, result.article);
  assert.equal(headers.get('Cache-Control'), 'no-store');
  assert.equal(headers.get('X-Robots-Tag'), 'noindex, follow');
  for (const name of ['ETag', 'Last-Modified', 'Content-Length', 'Content-Encoding', 'Accept-Ranges'])
    assert.equal(headers.has(name), false);
  const response = withoutHeadBody(request, new Response('rendered shell', { headers }));
  assert.equal(await response.text(), '');
});

test('unknown asset retains original response and conditional priority; only missing assets reach CMS', async () => {
  const request = new Request(url, { headers: { 'If-None-Match': '"same"' } });
  let calls = 0;
  const original = new Response(null, { status: 304, headers: { ETag: '"same"' } });
  const result = await loadLegacyArticleShell(request, {
    async fetch(req) {
      calls++;
      if (calls === 1) {
        assert.equal(req.headers.has('If-None-Match'), false);
        return new Response('<!doctype html><html>unknown asset</html>', { headers: { 'Content-Type': 'text/html' } });
      }
      assert.equal(req, request);
      return original;
    },
  });
  assert.equal(result.kind, 'asset');
  assert.equal(result.response, original);
  assert.equal(calls, 2);
  assert.equal(
    await loadLegacyArticleShell(request, {
      async fetch() {
        return new Response('missing', { status: 404 });
      },
    }),
    undefined
  );
  assert.equal(
    await loadLegacyArticleShell(new Request(url, { method: 'POST' }), {
      async fetch() {
        assert.fail('POST must not read static articles');
      },
    }),
    undefined
  );
});

test('Worker no longer short-circuits governed archives, and both routes use the shell helper', async () => {
  const worker = await readFile(new URL('../src/worker.ts', import.meta.url), 'utf8');
  assert.equal(worker.includes('await fetchLegacyArticleAsset('), false);
  assert.ok(worker.includes('withoutHeadBody(request, applyDeploymentHeaders('));
  for (const file of ['../src/pages/blog/[slug].astro', '../src/pages/[lang]/blog/[slug].astro']) {
    const route = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.ok(route.includes('await loadLegacyArticleShell('));
    assert.ok(route.includes('<LegacyArticleLayout article={legacy.article} />'));
    assert.ok(route.indexOf("legacy?.kind === 'asset'") < route.indexOf('await getEmDashEntry('));
  }
});
