import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveLocale, SUPPORTED_LOCALES } from '@emdash-cms/admin/locales/config';
import { SITE_APPEARANCE_FIELDS } from '../src/emdash/site-appearance.ts';
import {
  localizeAdminPresentationManifest,
  localizeAdminPresentationResponse,
} from '../src/emdash/admin-presentation-i18n.ts';

const seedPaths = ['site-shell', 'site-presentation', 'site-inner-pages', 'site-english-pages'];
const seeds = await Promise.all(
  seedPaths.map(async (name) => JSON.parse(await readFile(new URL(`../seed/${name}.json`, import.meta.url), 'utf8')))
);
const collections = seeds
  .flatMap((seed) => seed.collections)
  .map((collection) =>
    collection.slug === 'site_profile'
      ? { ...collection, fields: [...collection.fields, ...SITE_APPEARANCE_FIELDS] }
      : collection
  );
const localeRequest = (locale, path = '/_emdash/api/manifest', method = 'GET', extraHeaders = {}) =>
  new Request(`https://cinagroup.com${path}`, {
    method,
    headers: { cookie: `emdash-locale=${locale}`, ...extraHeaders },
  });
const originalResponse = (value = manifest(), init = {}) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
    ...init,
  });

function manifest() {
  return JSON.parse(
    JSON.stringify({
      success: true,
      data: {
        version: '1.0.1',
        hash: 'native-stable-schema-hash',
        authMode: 'cloudflare-access',
        signupEnabled: false,
        i18n: { defaultLocale: 'en', locales: ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'] },
        admin: { siteName: 'CinaGroup', logo: { label: 'Website', url: '/logo.svg' } },
        plugins: { example: { version: '1', adminPages: [{ label: 'Website', path: '/example' }] } },
        collections: {
          posts: {
            label: 'Website Pages',
            labelSingular: 'Website Page',
            group: 'Website',
            fields: { hero_title: { kind: 'string', label: 'Hero — Heading' } },
          },
          ...Object.fromEntries(
            collections.map((collection) => [
              collection.slug,
              {
                id: `collection-${collection.slug}`,
                slug: collection.slug,
                label: collection.label,
                labelSingular: collection.labelSingular,
                description: collection.description,
                group: collection.group,
                supports: collection.supports,
                hasSeo: collection.supports?.includes('seo') ?? false,
                routable: collection.routable,
                urlPattern: collection.urlPattern,
                fields: Object.fromEntries(
                  collection.fields.map((field) => [
                    field.slug,
                    {
                      id: `field-${collection.slug}-${field.slug}`,
                      kind: field.type,
                      label: field.label,
                      required: field.required ?? false,
                      translatable: field.translatable ?? true,
                      options: field.validation?.options
                        ? field.validation.options.map((value) => ({
                            value,
                            label: value.charAt(0).toUpperCase() + value.slice(1),
                          }))
                        : field.options,
                      validation: structuredClone(field.validation),
                    },
                  ])
                ),
              },
            ])
          ),
        },
      },
    })
  );
}

function removeKnownDisplayStrings(value) {
  const copy = structuredClone(value);
  for (const collection of collections) {
    const item = copy.data.collections[collection.slug];
    for (const key of ['label', 'labelSingular', 'description', 'group']) delete item[key];
    for (const field of collection.fields) {
      delete item.fields[field.slug].label;
      if (collection.slug === 'site_profile' && SITE_APPEARANCE_FIELDS.some((input) => input.slug === field.slug))
        for (const option of item.fields[field.slug].options ?? []) delete option.label;
      for (const sub of item.fields[field.slug].validation?.subFields ?? []) delete sub.label;
    }
  }
  return copy;
}

test('native admin language is independent from the eight content locales and resolves its existing preferences', async () => {
  assert.equal(
    SUPPORTED_LOCALES.some(({ code }) => code === 'zh-CN'),
    true
  );
  assert.equal(
    SUPPORTED_LOCALES.some(({ code }) => code === 'ko' || code === 'ru'),
    false
  );
  const request = new Request('https://cinagroup.com/_emdash/api/manifest?locale=ja', {
    headers: { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
  });
  assert.equal(resolveLocale(request), 'zh-CN');
  const projected = await localizeAdminPresentationResponse(request, originalResponse());
  assert.equal((await projected.json()).data.collections.site_pages.fields.hero_title.label, '首屏 — 标题');
  const english = originalResponse();
  assert.equal(
    await localizeAdminPresentationResponse(
      localeRequest('en', '/_emdash/api/manifest?locale=zh', 'GET', { 'accept-language': 'zh-CN' }),
      english
    ),
    english
  );
});

test('appearance selector labels localize while stable values, validations and authored choices remain intact', () => {
  const value = manifest();
  const fields = value.data.collections.site_profile.fields;
  fields.design_width.options[0].label = 'Editor selected custom label';
  fields.design_width.options.push({ value: 'unowned', label: 'Standard' });
  fields.design_radius.label = 'Editor selected custom field';
  const original = structuredClone(fields);
  localizeAdminPresentationManifest(value, 'zh-CN');
  assert.equal(fields.design_hero_autoplay.options[0].label, '默认');
  assert.equal(fields.design_hero_autoplay.options[1].label, '启用');
  assert.equal(fields.design_width.options[0].label, 'Editor selected custom label');
  assert.equal(fields.design_width.options.at(-1).label, 'Standard');
  assert.deepEqual(fields.design_radius, original.design_radius);
  for (const input of SITE_APPEARANCE_FIELDS) {
    assert.deepEqual(fields[input.slug].validation, original[input.slug].validation);
    assert.deepEqual(
      fields[input.slug].options?.map(({ value }) => value),
      original[input.slug].options?.map(({ value }) => value)
    );
  }
});

test('every reviewed collection, field and repeater label is translated in each supported project admin language', () => {
  assert.equal(collections.length, 8);
  for (const locale of ['zh-CN', 'zh-TW', 'ja', 'es-ES', 'es-419', 'pt-BR', 'fr']) {
    const value = manifest();
    const original = structuredClone(value);
    assert.equal(localizeAdminPresentationManifest(value, locale), true, locale);
    for (const collection of collections) {
      const item = value.data.collections[collection.slug];
      for (const key of ['label', 'labelSingular', 'description', 'group'])
        assert.notEqual(item[key], collection[key], `${locale}:${collection.slug}:${key}`);
      for (const field of collection.fields) {
        assert.notEqual(item.fields[field.slug].label, field.label, `${locale}:${collection.slug}:${field.slug}`);
        for (const [index, sub] of (field.validation?.subFields ?? []).entries()) {
          const label = item.fields[field.slug].validation.subFields[index].label;
          if (sub.label === 'URL') assert.equal(label, 'URL');
          else assert.notEqual(label, sub.label, `${locale}:${collection.slug}:${field.slug}:${sub.slug}`);
        }
      }
    }
    assert.deepEqual(removeKnownDisplayStrings(value), removeKnownDisplayStrings(original), locale);
  }
});

test('English and unsupported project catalogs fall back without changing the native response', async () => {
  for (const locale of ['en', 'en-GB', 'ko', 'ru', 'de', 'ar']) {
    const value = manifest();
    assert.equal(localizeAdminPresentationManifest(value, locale), false);
    const response = originalResponse();
    assert.equal(await localizeAdminPresentationResponse(localeRequest(locale), response), response, locale);
    assert.deepEqual(await response.json(), manifest());
  }
});

test('only known field slugs and exact original labels are translated, preserving authored customizations', () => {
  const value = manifest();
  const home = value.data.collections.site_pages;
  home.label = 'Our edited model name';
  home.group = 'Editorial';
  home.fields.hero_title.label = 'Our custom heading';
  home.fields.unowned = { kind: 'string', label: 'Hero — Heading', value: 'Hero — Heading' };
  home.fields.products.validation.subFields[0].label = 'Edited product label';
  home.fields.products.validation.subFields.push({ slug: 'unowned', label: 'Product name', type: 'string' });
  home.fields.products.options = { label: 'Product name', choices: ['Hero — Heading'] };
  home.fields.products.description = 'Administrator-authored help';
  const original = structuredClone(value);
  localizeAdminPresentationManifest(value, 'zh-CN');
  assert.equal(home.label, 'Our edited model name');
  assert.equal(home.group, 'Editorial');
  assert.equal(home.fields.hero_title.label, 'Our custom heading');
  assert.deepEqual(home.fields.unowned, original.data.collections.site_pages.fields.unowned);
  assert.equal(home.fields.products.validation.subFields[0].label, 'Edited product label');
  assert.deepEqual(
    home.fields.products.validation.subFields.at(-1),
    original.data.collections.site_pages.fields.products.validation.subFields.at(-1)
  );
  assert.deepEqual(home.fields.products.options, original.data.collections.site_pages.fields.products.options);
  assert.equal(home.fields.products.description, 'Administrator-authored help');
  assert.deepEqual(value.data.collections.posts, original.data.collections.posts);
  assert.deepEqual(value.data.plugins, original.data.plugins);
  assert.deepEqual(value.data.admin, original.data.admin);
});

test('projection is per response and cannot mutate a shared native manifest or retain the last visitor locale', async () => {
  const native = originalResponse();
  const zh = await localizeAdminPresentationResponse(localeRequest('zh-CN'), native);
  const fr = await localizeAdminPresentationResponse(localeRequest('fr'), native);
  assert.equal((await zh.json()).data.collections.site_pages.fields.hero_title.label, '首屏 — 标题');
  assert.equal((await fr.json()).data.collections.site_pages.fields.hero_title.label, 'Bannière principale — Titre');
  assert.deepEqual(await native.json(), manifest());
});

test('native schema exports, metadata snapshots, schema editors and content read/write APIs keep original stored labels', async () => {
  const excluded = [
    '/_emdash/api/schema',
    '/_emdash/api/schema?format=typescript',
    '/_emdash/api/schema/collections',
    '/_emdash/api/schema/collections/site_pages?includeFields=true',
    '/_emdash/api/schema/collections/site_pages/fields',
    '/_emdash/api/schema/collections/site_pages/fields/hero_title',
    '/_emdash/api/admin/transfer/exports/id/manifest',
    '/_emdash/api/content/site_pages',
    '/_emdash/api/content/site_pages/id',
    '/_emdash/admin/settings',
    '/_emdash/api/manifest/extra',
    '/_emdash/api/%6danifest',
    '/_emdash/api/Manifest',
  ];
  for (const path of excluded) {
    const response = originalResponse();
    assert.equal(await localizeAdminPresentationResponse(localeRequest('zh-CN', path), response), response, path);
    assert.deepEqual(await response.json(), manifest(), path);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const response = originalResponse();
    assert.equal(
      await localizeAdminPresentationResponse(localeRequest('zh-CN', '/_emdash/api/manifest', method), response),
      response,
      method
    );
    assert.deepEqual(await response.json(), manifest(), method);
  }
});

test('failed authentication, native errors and non-JSON responses are untouched and readable', async () => {
  for (const status of [302, 400, 401, 403, 404, 500]) {
    const response = originalResponse(
      { success: false, error: { code: 'ACCESS_IDENTITY_REQUIRED', message: 'Website Pages' } },
      { status }
    );
    assert.equal(await localizeAdminPresentationResponse(localeRequest('zh-CN'), response), response, `${status}`);
    assert.equal((await response.json()).success, false);
  }
  for (const headers of [
    { 'content-type': 'text/html' },
    { 'content-type': 'application/problem+json' },
    { 'content-type': 'application/json', 'content-encoding': 'gzip' },
  ]) {
    const response = originalResponse(manifest(), { headers });
    assert.equal(await localizeAdminPresentationResponse(localeRequest('zh-CN'), response), response);
    assert.deepEqual(await response.json(), manifest());
  }
  const successError = originalResponse({ success: false, error: { message: 'Website Pages' } });
  assert.equal(await localizeAdminPresentationResponse(localeRequest('zh-CN'), successError), successError);
});

test('malformed or oversized bodies fail open to the original response without consuming it', async () => {
  for (const body of [
    '{"success":',
    JSON.stringify({ success: true, data: { collections: [] } }),
    'x'.repeat(512 * 1024 + 1),
  ]) {
    const response = new Response(body, { headers: { 'content-type': 'application/json' } });
    assert.equal(await localizeAdminPresentationResponse(localeRequest('zh-CN'), response), response);
    assert.equal(await response.text(), body);
  }
  const response = originalResponse(manifest(), {
    headers: { 'content-type': 'application/json', 'content-length': String(512 * 1024 + 1) },
  });
  assert.equal(await localizeAdminPresentationResponse(localeRequest('zh-CN'), response), response);
  assert.deepEqual(await response.json(), manifest());
});

test('rewritten responses preserve business headers, use private locale caching and drop obsolete entity validators', async () => {
  const response = originalResponse(manifest(), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
      'content-length': '123',
      etag: '"native-original"',
      'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
      vary: 'Origin, cOoKiE',
      'x-cinagroup-auth': 'verified',
      'x-content-type-options': 'nosniff',
      'set-cookie': 'existing-native-cookie=1; Secure; HttpOnly',
    },
  });
  const localized = await localizeAdminPresentationResponse(localeRequest('zh-TW'), response);
  assert.equal(localized.headers.get('cache-control'), 'private, no-store');
  assert.equal(localized.headers.get('vary'), 'Origin, cOoKiE, Accept-Language');
  for (const header of ['content-length', 'etag', 'last-modified'])
    assert.equal(localized.headers.has(header), false, header);
  for (const header of ['x-cinagroup-auth', 'x-content-type-options', 'set-cookie'])
    assert.equal(localized.headers.get(header), response.headers.get(header), header);
  assert.deepEqual((await localized.json()).data.i18n, manifest().data.i18n);
});

test('Vary wildcard is preserved and manifest query parameters do not choose UI language', async () => {
  const response = originalResponse(manifest(), { headers: { 'content-type': 'application/json', vary: '*' } });
  const localized = await localizeAdminPresentationResponse(
    localeRequest('zh-CN', '/_emdash/api/manifest/?locale=en'),
    response
  );
  assert.equal(localized.headers.get('vary'), '*');
  assert.equal((await localized.json()).data.collections.site_pages.label, '网站首页');
});
