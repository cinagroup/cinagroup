import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Kysely } from 'kysely';
import { createDialect } from 'emdash/db/sqlite';
import { runMigrations } from 'emdash/db';
import { ContentRepository, OptionsRepository, SchemaRegistry } from 'emdash';
import { DEFAULT_ABOUT_COPY } from '../src/data/site/about-defaults.ts';
import { DEFAULT_SERVICES_COPY } from '../src/data/site/services-defaults.ts';
import { DEFAULT_CONTACT_COPY } from '../src/data/site/contact-defaults.ts';
import { DEFAULT_PRICING_COPY, DEFAULT_PRICING_DISCLOSURES } from '../src/data/site/pricing-defaults.ts';
import { defaultProductCopy } from '../src/data/site/product-defaults.ts';
import {
  INNER_PAGE_LOCALES,
  mergePageCopy,
  pageCopyFromEntry,
  pageCopySeedData,
} from '../src/emdash/page-copy-model.ts';
import { getPublishedPageCopy, getPageCopyMetadata } from '../src/emdash/published-page-copy.ts';
import { initializeSiteContent, SITE_CONTENT_INITIALIZATION_MARKER } from '../src/emdash/initialize-site-content.ts';
import { prepareInnerPagesSeed } from '../scripts/prepare-inner-page-seed.mjs';

const products = ['cinaseek', 'cinaclaw', 'cinatoken', 'cinaskill', 'cinachain'];
const definitionDefaults = [
  ['page_about', DEFAULT_ABOUT_COPY],
  ['page_services', DEFAULT_SERVICES_COPY],
  ['page_contact', DEFAULT_CONTACT_COPY],
  ['page_pricing', DEFAULT_PRICING_COPY],
];

function queryEntry(copy, collection = 'page_about', slug = 'about', locale = 'zh', status = 'published') {
  return { data: { ...pageCopySeedData(copy, collection), slug, locale, status } };
}

test('all existing 63 localized pages round trip through individually editable fields', () => {
  for (const locale of INNER_PAGE_LOCALES) {
    for (const [collection, copies] of definitionDefaults) {
      assert.deepEqual(
        mergePageCopy(pageCopySeedData(copies[locale], collection), copies[locale], collection),
        copies[locale]
      );
    }
    for (const product of products) {
      const copy = defaultProductCopy(locale, product);
      assert.deepEqual(mergePageCopy(pageCopySeedData(copy, 'page_products'), copy, 'page_products'), copy);
    }
  }
  const seed = prepareInnerPagesSeed();
  assert.equal(seed.collections.length, 5);
  assert.equal(Object.values(seed.content).flat().length, 63);
  assert.equal(
    seed.collections.some((collection) => collection.fields.some((field) => field.type === 'json')),
    false
  );
  assert.equal(seed.content.page_products.length, 35);
});

test('wrong locale, slug, fallback and unsigned drafts preserve defaults', async () => {
  const copy = DEFAULT_ABOUT_COPY.zh;
  const original = queryEntry(copy);
  for (const entry of [
    { data: { ...original.data, locale: 'ja' } },
    { data: { ...original.data, slug: 'services' } },
    { data: { ...original.data, status: 'draft' } },
  ]) {
    assert.equal(pageCopyFromEntry(entry, 'zh', 'page_about', 'about', copy, { isPreview: false }), undefined);
  }
  assert.equal(
    pageCopyFromEntry(original, 'zh', 'page_about', 'about', copy, { isPreview: false, fallbackLocale: 'en' }),
    undefined
  );
  const context = { url: new URL('https://cinagroup.com/zh/about/') };
  const changed = { data: { ...original.data, hero_title: 'Published CMS edit' } };
  assert.equal(
    (
      await getPublishedPageCopy(context, 'page_about', 'about', copy, async () => ({
        entry: changed,
        isPreview: false,
      }))
    ).heroTitle,
    'Published CMS edit'
  );
  assert.deepEqual(
    await getPublishedPageCopy(context, 'page_about', 'about', copy, async () => {
      throw new Error('DB unavailable');
    }),
    copy
  );
});

test('verified query preview remains private and nonindexable; prerender never queries DB', async () => {
  const copy = DEFAULT_CONTACT_COPY.zh;
  const context = { url: new URL('https://cinagroup.com/zh/contact/'), response: { headers: new Headers() } };
  const draft = {
    data: { ...queryEntry(copy, 'page_contact', 'contact', 'zh', 'draft').data, hero_title: 'Draft edit' },
  };
  assert.equal(
    (
      await getPublishedPageCopy(context, 'page_contact', 'contact', copy, async () => ({
        entry: draft,
        isPreview: true,
      }))
    ).heroTitle,
    'Draft edit'
  );
  assert.equal(context.response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(context.response.headers.get('Cache-Control'), 'private, no-store');
  let calls = 0;
  const prerender = { ...context, isPrerendered: true };
  assert.deepEqual(
    await getPublishedPageCopy(prerender, 'page_contact', 'contact', copy, async () => {
      calls++;
      throw new Error('Must not run');
    }),
    copy
  );
  assert.equal(calls, 0);
});

test('invalid repeaters and changed illustrative disclaimers cannot replace protected content', () => {
  const copy = DEFAULT_PRICING_COPY.zh;
  const data = pageCopySeedData(copy, 'page_pricing');
  data.cards = [...data.cards, data.cards[0]];
  assert.deepEqual(mergePageCopy(data, copy, 'page_pricing').cards, copy.cards);
  const product = defaultProductCopy('zh', 'cinaseek');
  assert.equal(
    mergePageCopy({ scenario_qualifier: 'Unreviewed claim' }, product, 'page_products').scenarioQualifier,
    product.scenarioQualifier
  );
  assert.equal('scenario_qualifier' in pageCopySeedData(product, 'page_products'), false);
  assert.equal(DEFAULT_PRICING_DISCLOSURES.zh.cards.length, 3);
});

test('official SDK initializes all inner-page schemas, revisions and locales in memory', async () => {
  const db = new Kysely({ dialect: createDialect({ url: ':memory:' }) });
  try {
    await runMigrations(db);
    const seed = prepareInnerPagesSeed();
    const result = await initializeSiteContent({ db, seed, dryRun: false });
    assert.equal(result.result.content.created, 63);
    const registry = new SchemaRegistry(db);
    const pricing = await registry.getCollectionWithFields('page_pricing');
    assert.equal(pricing.fields.find((field) => field.slug === 'cards').type, 'repeater');
    const posts = await registry.getCollection('posts');
    assert.equal(posts, null);
    const repo = new ContentRepository(db);
    const a = await repo.findBySlug('page_products', 'cinaseek', 'zh');
    const b = await repo.findBySlug('page_products', 'cinaseek', 'ja');
    assert.equal(a.status, 'published');
    assert.ok(a.liveRevisionId);
    assert.equal(a.translationGroup, b.translationGroup);
    assert.equal((await new OptionsRepository(db).get(SITE_CONTENT_INITIALIZATION_MARKER)).status, 'complete');
    assert.equal((await initializeSiteContent({ db, seed, dryRun: false })).status, 'already-complete');
  } finally {
    await db.destroy();
  }
});

test('native SEO edits affect only head metadata and reject foreign canonical/image URLs', async () => {
  const copy = DEFAULT_ABOUT_COPY.zh;
  const context = { url: new URL('https://cinagroup.com/zh/about/'), locals: {}, response: { headers: new Headers() } };
  const result = queryEntry(copy);
  result.data.seo = {
    title: 'SEO-only title',
    description: 'SEO-only description',
    canonical: '/zh/about/',
    image: '/brand/cinagroup-horizontal.png',
    noIndex: true,
  };
  const rendered = await getPublishedPageCopy(context, 'page_about', 'about', copy, async () => ({
    entry: result,
    isPreview: false,
  }));
  assert.equal(rendered.heroTitle, copy.heroTitle);
  const metadata = await getPageCopyMetadata(context, { title: rendered.title, description: rendered.description });
  assert.equal(metadata.title, 'SEO-only title');
  assert.equal(metadata.description, 'SEO-only description');
  assert.equal(metadata.canonical, 'https://cinagroup.com/zh/about/');
  assert.equal(metadata.openGraph.images[0].url, 'https://cinagroup.com/brand/cinagroup-horizontal.png');
  assert.equal(metadata.robots.index, false);
  assert.equal(context.response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  result.data.seo = { canonical: 'https://other.invalid/about/', image: 'javascript:alert(1)' };
  await getPublishedPageCopy(context, 'page_about', 'about', copy, async () => ({ entry: result, isPreview: false }));
  const safe = await getPageCopyMetadata(context, { title: copy.title });
  assert.equal(safe.canonical, undefined);
  assert.equal(safe.openGraph, undefined);
});

test('SEO media IDs resolve to the stored file key while URL images need no lookup', async () => {
  const copy = DEFAULT_ABOUT_COPY.zh;
  const context = { url: new URL('https://cinagroup.com/zh/about/'), locals: {} };
  const result = queryEntry(copy);
  const mediaId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  result.data.seo = { image: mediaId };
  await getPublishedPageCopy(context, 'page_about', 'about', copy, async () => ({ entry: result, isPreview: false }));
  let lookups = 0;
  const resolve = async (seo) => {
    lookups++;
    assert.equal(seo.imageMediaId, mediaId);
    return 'https://cinagroup.com/_emdash/api/media/file/brand/actual-logo.png';
  };
  const selected = await getPageCopyMetadata(context, { title: copy.title }, resolve);
  assert.equal(selected.openGraph.images[0].url, 'https://cinagroup.com/_emdash/api/media/file/brand/actual-logo.png');
  result.data.seo = { image: '/brand/cinagroup-horizontal.png' };
  await getPublishedPageCopy(context, 'page_about', 'about', copy, async () => ({ entry: result, isPreview: false }));
  await getPageCopyMetadata(context, { title: copy.title }, resolve);
  assert.equal(lookups, 1);
});
