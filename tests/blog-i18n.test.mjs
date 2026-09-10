import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { load as parseYaml } from 'js-yaml';

import { factChecks, getFactCheck, isFactCheckComplete } from '../src/data/fact-checks.ts';
import { routeMatrix } from '../src/i18n/routing.ts';
import { isBlogFeedPost, postLanguageToSiteLocale, siteLocaleToPostLanguage } from '../src/utils/blog-content.js';

const translationDirectory = new URL('../src/content/blog/', import.meta.url);

const getTranslationFrontmatter = async () => {
  const names = (await readdir(translationDirectory)).filter((name) => /\.mdx?$/i.test(name));
  return Promise.all(
    names.map(async (name) => {
      const source = await readFile(new URL(name, translationDirectory), 'utf8');
      const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      assert.ok(match, `${name}: frontmatter is required`);
      return { name, data: parseYaml(match[1]) || {} };
    })
  );
};

test('post languages map to site locales and back', () => {
  const expectations = {
    en: 'en',
    'zh-CN': 'zh',
    ja: 'ja',
    ko: 'ko',
    ru: 'ru',
    es: 'es',
    'pt-BR': 'pt',
    fr: 'fr',
  };

  for (const [postLanguage, siteLocale] of Object.entries(expectations)) {
    assert.equal(postLanguageToSiteLocale(postLanguage), siteLocale);
    assert.equal(siteLocaleToPostLanguage(siteLocale), postLanguage);
  }
});

test('unknown languages and locales do not resolve', () => {
  assert.equal(postLanguageToSiteLocale('zh-TW'), undefined);
  assert.equal(postLanguageToSiteLocale(undefined), undefined);
  assert.equal(siteLocaleToPostLanguage('de'), undefined);
  assert.equal(siteLocaleToPostLanguage(''), undefined);
});

test('the default-locale feed lists the English automated archive', () => {
  assert.equal(isBlogFeedPost('archived_unverified', 'en'), true);
  assert.equal(isBlogFeedPost('published', 'en'), true);
  assert.equal(isBlogFeedPost('draft', 'en'), false);
  assert.equal(isBlogFeedPost('withdrawn', 'en'), false);
});

test('localized feeds never list the English automated archive', () => {
  assert.equal(isBlogFeedPost('archived_unverified', 'en', 'zh'), false);
  assert.equal(isBlogFeedPost('archived_unverified', 'zh-CN', 'zh'), false);
  assert.equal(isBlogFeedPost('archived_unverified', 'zh-CN', 'en'), false);
});

test('each feed lists only published posts written in its language', () => {
  assert.equal(isBlogFeedPost('published', 'zh-CN', 'zh'), true);
  assert.equal(isBlogFeedPost('published', 'zh-CN', 'en'), false);
  assert.equal(isBlogFeedPost('published', 'en', 'zh'), false);
  assert.equal(isBlogFeedPost('published', 'pt-BR', 'pt'), true);
  assert.equal(isBlogFeedPost('published', 'pt', 'pt'), false);
});

test('unknown locales list nothing', () => {
  assert.equal(isBlogFeedPost('published', 'en', 'de'), false);
  // An omitted locale falls back to the default-locale (English) feed.
  assert.equal(isBlogFeedPost('published', 'en', undefined), true);
  assert.equal(isBlogFeedPost('archived_unverified', 'en', undefined), true);
});

test('the route matrix exposes only blog locales that currently have published feeds', () => {
  assert.deepEqual(routeMatrix['/blog'], ['en', 'zh', 'ja']);
});

test('fact-check records have unique keys and structurally valid public source URLs', () => {
  const keys = new Set();

  for (const record of factChecks) {
    assert.ok(!keys.has(record.translationKey), `duplicate fact-check key: ${record.translationKey}`);
    keys.add(record.translationKey);
    assert.match(record.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(record.checkedBy.trim());
    assert.ok(record.summary.trim());
    assert.ok(record.claims.length > 0);

    for (const claim of record.claims) {
      assert.ok(claim.claim.trim());
      assert.ok(claim.note.trim());
      assert.ok(Array.isArray(claim.sources));
      for (const source of claim.sources) {
        const url = new URL(source);
        assert.ok(['http:', 'https:'].includes(url.protocol), `${record.translationKey}: invalid source ${source}`);
      }
    }

    assert.equal(getFactCheck(record.translationKey) !== undefined, isFactCheckComplete(record));
  }
});

test('only translations with complete fact-check records are published', async () => {
  const recordsByKey = new Map(factChecks.map((record) => [record.translationKey, record]));
  const translations = await getTranslationFrontmatter();
  const routablePairs = new Set();
  const publishedByLocale = new Map();

  for (const { name, data } of translations) {
    const record = recordsByKey.get(data.translationKey);
    assert.ok(record, `${name}: missing fact-check record`);
    const complete = isFactCheckComplete(record);
    const locale = postLanguageToSiteLocale(data.language);
    assert.ok(locale, `${name}: unsupported language ${String(data.language)}`);

    if (data.status === 'published') {
      assert.equal(complete, true, `${name}: published with an incomplete fact-check`);
      assert.equal(data.verification?.status, 'fact_checked');
      const pair = `${data.translationKey}\u0000${locale}`;
      assert.ok(!routablePairs.has(pair), `${name}: duplicate published translation locale`);
      routablePairs.add(pair);
      publishedByLocale.set(locale, (publishedByLocale.get(locale) || 0) + 1);
    } else {
      if (!complete) assert.equal(data.status, 'in_review', `${name}: incomplete translation must remain in review`);
    }
  }

  assert.ok((publishedByLocale.get('zh') || 0) > 0, 'Chinese blog needs at least one published translation');
  assert.ok((publishedByLocale.get('ja') || 0) > 0, 'Japanese blog needs at least one published translation');
  assert.deepEqual([...publishedByLocale.keys()].sort(), ['ja', 'zh']);
});
