import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DEFAULT_HOME_COPY, DEFAULT_HOME_IMAGES, HOME_LOCALES } from '../src/data/site/home-defaults.ts';
import {
  defaultHomeContent,
  homeContentFromEntry,
  homeDefaultFields,
  homeImageFromValue,
  loadHomeContent,
  safeHomeHref,
} from '../src/emdash/home-content.ts';

const entry = (locale = 'zh', fields = {}, status = 'published') => ({
  data: { ...homeDefaultFields(locale), slug: 'home', locale, status, ...fields },
});
const publicOptions = { isPreview: false };

test('the homepage seed presents all eight existing translations without missing fields or photos', async () => {
  const seed = JSON.parse(await readFile(new URL('../seed/site-presentation.json', import.meta.url), 'utf8'));
  assert.equal(seed.collections[0].slug, 'site_pages');
  assert.deepEqual(seed.collections[0].supports, ['drafts', 'revisions', 'preview', 'seo']);
  assert.deepEqual(
    seed.content.site_pages.map((item) => item.locale),
    HOME_LOCALES
  );
  for (const item of seed.content.site_pages) {
    const content = homeContentFromEntry(
      { data: { ...item.data, slug: item.slug, locale: item.locale, status: item.status } },
      item.locale,
      publicOptions
    );
    assert.ok(content);
    for (const key of Object.keys(DEFAULT_HOME_COPY[item.locale]))
      assert.deepEqual(content[key], DEFAULT_HOME_COPY[item.locale][key], `${item.locale}:${key}`);
    assert.equal(content.heroImage, DEFAULT_HOME_IMAGES.hero);
    assert.equal(content.aboutImage, DEFAULT_HOME_IMAGES.about);
    assert.equal(item.translationOf, item.locale === 'en' ? undefined : 'home-en');
  }
});

test('unpublished content and another locale never replace the public homepage', () => {
  for (const status of ['draft', 'scheduled', 'trash', 'withdrawn']) {
    assert.equal(
      homeContentFromEntry(entry('zh', { hero_title: 'Unpublished text' }, status), 'zh', publicOptions),
      undefined
    );
  }
  assert.equal(homeContentFromEntry(entry('en'), 'zh', publicOptions), undefined);
  assert.equal(homeContentFromEntry(entry('zh', { slug: 'about' }), 'zh', publicOptions), undefined);
  assert.equal(homeContentFromEntry(entry(), 'zh', { isPreview: false, fallbackLocale: 'en' }), undefined);
  assert.equal(homeContentFromEntry(null, 'zh', publicOptions), undefined);
});

test('only the official verified preview result permits a draft', () => {
  const draft = entry('zh', { hero_title: 'Draft under a signed preview' }, 'draft');
  assert.equal(homeContentFromEntry(draft, 'zh', { isPreview: true }).heroTitle, 'Draft under a signed preview');
  assert.equal(homeContentFromEntry(draft, 'zh', { isPreview: 'true' }), undefined);
  assert.equal(homeContentFromEntry(draft, 'en', { isPreview: true }), undefined);
  assert.equal(homeContentFromEntry(draft, 'zh', { isPreview: true, fallbackLocale: 'en' }), undefined);
});

test('published field changes, ordered repeaters, and safe SEO-panel overrides reach the frontend', () => {
  const content = homeContentFromEntry(
    entry('fr', {
      hero_title: 'Un titre modifié',
      products: [
        {
          name: 'CinaSeek',
          role: 'Workspace',
          description: 'A reviewed scope',
          href: '/fr/cinaseek/?view=details#scope',
        },
      ],
      methods: [{ title: 'Review', description: 'Check the agreed result.' }],
      seo: { title: 'Updated SEO title', description: 'Updated SEO description', noIndex: true },
    }),
    'fr',
    publicOptions
  );
  assert.equal(content.heroTitle, 'Un titre modifié');
  assert.equal(content.title, 'Updated SEO title');
  assert.equal(content.description, 'Updated SEO description');
  assert.equal(content.noIndex, true);
  assert.equal(content.products[0].href, '/fr/cinaseek/?view=details#scope');
  assert.deepEqual(content.methods, [{ title: 'Review', description: 'Check the agreed result.' }]);
});

test('malformed fields fall back independently and unknown properties cannot enter presentation data', () => {
  const content = homeContentFromEntry(
    entry('ja', {
      hero_title: { injected: 'not text' },
      hero_lead: 'x'.repeat(2001),
      products: [{ name: 'Broken card', href: 'javascript:alert(1)' }],
      methods: [{ title: 'Missing explanation' }],
      hero_image: { id: '../other', src: '//outside.example/photo.png' },
      contact_url: 'javascript:alert(1)',
      adminToken: 'must not render',
    }),
    'ja',
    publicOptions
  );
  assert.equal(content.heroTitle, DEFAULT_HOME_COPY.ja.heroTitle);
  assert.equal(content.heroLead, DEFAULT_HOME_COPY.ja.heroLead);
  assert.deepEqual(content.products, DEFAULT_HOME_COPY.ja.products);
  assert.deepEqual(content.methods, DEFAULT_HOME_COPY.ja.methods);
  assert.equal(content.contactHref, '/ja/contact/');
  assert.equal(content.heroImage, DEFAULT_HOME_IMAGES.hero);
  assert.equal(Object.hasOwn(content, 'adminToken'), false);
});

test('homepage URLs reject executable schemes, foreign origins, credentials, controls and backslashes', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,example',
    '//outside.example',
    '/\\outside.example',
    'https://outside.example',
    'https://cinagroup.com@outside.example/',
    '/%0d%0aHeader',
    '/%5coutside',
    'https://user@cinagroup.com/',
    '/two words',
  ]) {
    assert.equal(safeHomeHref(value), undefined, value);
  }
  assert.equal(safeHomeHref('#products'), '#products');
  assert.equal(safeHomeHref('https://cinagroup.com/zh/contact/?source=home#form'), '/zh/contact/?source=home#form');
});

test('CMS images keep bounded local media metadata without accepting external providers or unsafe URLs', () => {
  assert.deepEqual(
    homeImageFromValue({
      id: '01MEDIAREFERENCE',
      src: '/_emdash/api/media/file/01MEDIAREFERENCE',
      alt: 'Workspace',
      width: 1920,
      height: 1080,
      focalX: 0.5,
      meta: { storageKey: 'media/workspace.webp', secret: 'drop' },
      arbitrary: 'drop',
    }),
    {
      id: '01MEDIAREFERENCE',
      src: '/_emdash/api/media/file/01MEDIAREFERENCE',
      alt: 'Workspace',
      width: 1920,
      height: 1080,
      focalX: 0.5,
      meta: { storageKey: 'media/workspace.webp' },
    }
  );
  assert.deepEqual(
    homeImageFromValue({ id: '01MEDIAREFERENCE', width: -1, focalX: 4, meta: { storageKey: '../other' } }),
    { id: '01MEDIAREFERENCE' }
  );
  assert.equal(homeImageFromValue({ id: '01MEDIAREFERENCE', src: 'javascript:alert(1)' }), undefined);
  assert.equal(homeImageFromValue({ id: '01MEDIAREFERENCE', provider: 'unconfigured-external' }), undefined);
});

test('missing or failed CMS reads keep locale-specific public fallback and invalidation tags', async () => {
  const missing = await loadHomeContent('ko', async () => ({ entry: null, isPreview: false, cacheHint: {} }));
  assert.equal(missing.source, 'fallback');
  assert.equal(missing.content.title, DEFAULT_HOME_COPY.ko.title);
  assert.deepEqual(missing.cacheHint.tags, ['site_pages']);
  const failed = await loadHomeContent('ru', async () => ({
    entry: entry('ru', { hero_title: 'Never admit an error result' }),
    error: new Error('Unavailable'),
    isPreview: false,
  }));
  assert.equal(failed.content.heroTitle, DEFAULT_HOME_COPY.ru.heroTitle);
  const thrown = await loadHomeContent('pt', async () => {
    throw new Error('Database unavailable');
  });
  assert.equal(thrown.source, 'fallback');
  assert.equal(thrown.isPreview, false);
  assert.equal(thrown.content.title, DEFAULT_HOME_COPY.pt.title);
});

test('CMS loading preserves trusted preview state and cache hints while public drafts remain fallback', async () => {
  const draft = entry('es', { hero_title: 'Unpublished' }, 'draft');
  const hidden = await loadHomeContent('es', async () => ({ entry: draft, isPreview: false }));
  assert.equal(hidden.source, 'fallback');
  const preview = await loadHomeContent('es', async () => ({
    entry: draft,
    isPreview: true,
    cacheHint: { tags: ['home-id'] },
  }));
  assert.equal(preview.source, 'emdash');
  assert.equal(preview.isPreview, true);
  assert.equal(preview.content.heroTitle, 'Unpublished');
  assert.deepEqual(preview.cacheHint.tags, ['site_pages', 'home-id']);
  const fallback = defaultHomeContent('es');
  fallback.products[0].name = 'changed in one request';
  assert.equal(defaultHomeContent('es').products[0].name, DEFAULT_HOME_COPY.es.products[0].name);
});
