import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { getPublishedPageCopy, getPageCopyMetadata } from '../src/emdash/published-page-copy.ts';
import { ENGLISH_PAGE_DEFAULTS } from '../src/data/site/english-page-defaults.ts';
import {
  mapEnglishPageText,
  englishPageTextFromEntry,
  createEnglishPageTextLoader,
} from '../src/emdash/english-page-text-model.ts';
const result = (slug = 'about', data = {}, flags = {}) => ({
  entry: { data: { status: 'published', locale: 'en', slug, ...data } },
  isPreview: false,
  ...flags,
});
const defaults = { metadata_title: 'Existing page', hero_title: 'Existing heading', hero_primary_text: 'Contact' };
const request = (path = '/about/') => ({
  locals: {},
  url: new URL(path, 'https://cinagroup.com'),
  response: { headers: new Headers() },
});

test('known plain text updates SEO and displayed text without granting URL or HTML props', () => {
  const copy = mapEnglishPageText(
    {
      title: 'Edited page',
      texts: [
        { key: 'hero_title', label: 'ignored location metadata', value: 'Edited heading' },
        { key: 'hero_primary_text', value: '<img src=x onerror=alert(1)>' },
        { key: 'href', value: 'javascript:alert(1)' },
        { key: '__proto__', value: 'unsafe' },
        { key: 'metadata_title', value: 'Must not override the native title field' },
      ],
    },
    defaults
  );
  assert.deepEqual(copy, { ...defaults, metadata_title: 'Edited page', hero_title: 'Edited heading' });
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  assert.equal(Object.hasOwn(copy, 'href'), false);
});

test('invalid or duplicate bindings retain the existing text', () => {
  const copy = mapEnglishPageText(
    {
      title: '<b>title</b>',
      texts: [
        { key: 'hero_title', value: 'First' },
        { key: 'hero_title', value: 'Second' },
        { key: 'hero_primary_text', value: 'bad\u0000text' },
      ],
    },
    defaults
  );
  assert.deepEqual(copy, defaults);
  assert.equal(
    mapEnglishPageText({ texts: [{ key: 'hero_title', value: 'x'.repeat(6001) }] }, defaults).hero_title,
    defaults.hero_title
  );
});

test('English pages accept only their exact published English snapshot', () => {
  assert.equal(englishPageTextFromEntry(result(), 'about', defaults).hero_title, defaults.hero_title);
  for (const invalid of [
    result('services'),
    result('about', { locale: 'zh' }),
    result('about', { status: 'draft' }),
    result('about', {}, { fallbackLocale: 'en' }),
    result('about', {}, { error: new Error('missing') }),
  ]) {
    assert.equal(englishPageTextFromEntry(invalid, 'about', defaults), undefined);
  }
});

test('request deduplication is local; prerender, other locales and unavailable runtime safely fall back', async () => {
  let reads = 0;
  const hints = [];
  const load = createEnglishPageTextLoader(async (slug) => {
    reads++;
    return { ...result(slug, { title: 'Updated' }), cacheHint: { tags: ['English page'] } };
  });
  const ctx = request();
  const first = load(ctx, 'about', defaults, (hint) => hints.push(hint));
  assert.equal(first, load(ctx, 'about', defaults));
  assert.equal((await first).metadata_title, 'Updated');
  assert.equal(reads, 1);
  assert.equal(hints.length, 1);
  assert.deepEqual(await load({ ...request(), isPrerendered: true }, 'about', defaults), defaults);
  assert.deepEqual(await load(request('/zh/about/'), 'about', defaults), defaults);
  assert.equal(reads, 1);
  await load(request(), 'about', defaults);
  assert.equal(reads, 2);
  const failed = createEnglishPageTextLoader(async () => {
    throw new Error('no DB');
  });
  assert.deepEqual(await failed(request(), 'about', defaults), defaults);
});

test('verified preview shows draft text and marks its response private and noindex', async () => {
  const load = createEnglishPageTextLoader(async (slug) =>
    result(slug, { status: 'draft', title: 'Secret draft' }, { isPreview: true })
  );
  const ctx = request();
  assert.deepEqual(await load(ctx, 'about', defaults), { ...defaults, metadata_title: 'Secret draft' });
  assert.equal(ctx.response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(ctx.response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});

test('all ten published seed entries reproduce the exact extracted existing copy', () => {
  const seed = JSON.parse(fs.readFileSync(new URL('../seed/site-english-pages.json', import.meta.url), 'utf8'));
  assert.equal(seed.collections[0].slug, 'page_english');
  assert.equal(seed.collections[0].group, 'Website');
  assert.equal(seed.collections[0].fields[1].type, 'repeater');
  assert.equal(seed.content.page_english.length, 10);
  for (const entry of seed.content.page_english) {
    assert.equal(entry.locale, 'en');
    assert.equal(entry.status, 'published');
    assert.deepEqual(
      mapEnglishPageText(entry.data, ENGLISH_PAGE_DEFAULTS[entry.slug]),
      ENGLISH_PAGE_DEFAULTS[entry.slug]
    );
    assert.equal(new Set(entry.data.texts.map((row) => row.key)).size, entry.data.texts.length);
  }
});

test('native SEO panel values override the head, resolve a media ID and preserve noindex', async () => {
  const ctx = request();
  const entry = result('about', {
    seo: {
      title: 'Native SEO title',
      description: 'Native SEO description',
      canonical: 'https://cinagroup.com/about/',
      image: '0'.repeat(26),
      noIndex: true,
    },
  });
  const load = createEnglishPageTextLoader(async (slug, context) => {
    await getPublishedPageCopy(context, 'page_english', slug, {}, async () => entry);
    return entry;
  });
  const copy = await load(ctx, 'about', defaults);
  assert.equal(copy.metadata_title, 'Existing page');
  let mediaId;
  const metadata = await getPageCopyMetadata(
    ctx,
    { title: copy.metadata_title, description: 'Existing description', robots: { index: true, follow: true } },
    async (seo) => {
      mediaId = seo.imageMediaId;
      return 'https://cinagroup.com/_emdash/api/media/file/share.webp';
    }
  );
  assert.equal(metadata.title, 'Native SEO title');
  assert.equal(metadata.description, 'Native SEO description');
  assert.equal(metadata.canonical, 'https://cinagroup.com/about/');
  assert.equal(mediaId, '0'.repeat(26));
  assert.deepEqual(metadata.openGraph.images, [{ url: 'https://cinagroup.com/_emdash/api/media/file/share.webp' }]);
  assert.deepEqual(metadata.robots, { index: false, follow: false });
});

test('an unverified preview-looking URL cannot expose drafts or draft SEO', async () => {
  const ctx = request('/about/?_preview=invalid');
  const entry = result('about', { status: 'draft', title: 'Unpublished title', seo: { title: 'Unpublished SEO' } });
  const load = createEnglishPageTextLoader(async (slug, context) => {
    await getPublishedPageCopy(context, 'page_english', slug, {}, async () => entry);
    return entry;
  });
  assert.deepEqual(await load(ctx, 'about', defaults), defaults);
  assert.deepEqual(await getPageCopyMetadata(ctx, { title: 'Existing page' }), { title: 'Existing page' });
});

test('verified draft preview also applies native draft SEO with a noindex head', async () => {
  const ctx = request('/about/?_preview=verified-by-emdash');
  const entry = result(
    'about',
    { status: 'draft', title: 'Preview title', seo: { title: 'Preview SEO' } },
    { isPreview: true }
  );
  const load = createEnglishPageTextLoader(async (slug, context) => {
    await getPublishedPageCopy(context, 'page_english', slug, {}, async () => entry);
    return entry;
  });
  assert.equal((await load(ctx, 'about', defaults)).metadata_title, 'Preview title');
  const metadata = await getPageCopyMetadata(ctx, { title: 'Existing page', robots: { index: true, follow: true } });
  assert.equal(metadata.title, 'Preview SEO');
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(ctx.response.headers.get('Cache-Control'), 'private, no-store');
});
